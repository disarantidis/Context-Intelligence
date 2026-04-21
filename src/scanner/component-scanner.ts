/**
 * Component Scanner — prefix-based taxonomy of COMPONENT / COMPONENT_SET nodes
 * across every page of the current Figma file.
 *
 * Categorisation logic derived from analysis of RADD 2.0 + industry taxonomies
 * (Carbon IBM, Material Design, Gestalt Pinterest, PatternFly Red Hat). Name-based
 * matching is deterministic; unknown components fall through to `uncategorized`
 * rather than being force-fit.
 */

import { compareAsciiInsensitive } from '../string-compare';

export type ComponentCategory =
  | 'actions'
  | 'form_inputs'
  | 'navigation'
  | 'feedback'
  | 'overlays'
  | 'content_display'
  | 'sub_components'
  | 'uncategorized';

export interface VariantProp {
  key: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  valuesCount: number;
}

export interface ComponentEntry {
  id: string;
  name: string;
  displayName: string;
  type: 'COMPONENT_SET' | 'COMPONENT';
  page: string;
  variantCount: number;
  variantProps: VariantProp[];
  isInternal: boolean;
  category: ComponentCategory;
}

export interface ScanOptions {
  prefix: string;
  includeInternal: boolean;
}

export interface ScanResult {
  prefix: string;
  scannedAt: string;
  totalComponents: number;
  byCategory: Record<ComponentCategory, ComponentEntry[]>;
  summary: {
    publicComponents: number;
    internalComponents: number;
    totalVariants: number;
  };
}

export type ProgressCallback = (current: number, total: number, pageName: string) => void;

// ──────────────────────────────────────────────────────────────────────────────
// Categorisation
// ──────────────────────────────────────────────────────────────────────────────

function anyMatch(str: string, patterns: string[]): boolean {
  return patterns.some((p) => str.includes(p));
}

export function categorize(entry: {
  displayName: string;
  variantProps: { key: string }[];
  isInternal: boolean;
}): ComponentCategory {
  // Rule 1: dot-prefix = internal sub-component
  if (entry.isInternal) return 'sub_components';

  const n = asciiLowerCase(entry.displayName);
  const props = new Set(entry.variantProps.map((p) => asciiLowerCase(p.key)));

  // Rule 2: Overlays — first to catch "bottom sheet" / "flyout"
  if (
    anyMatch(n, ['dialog', 'modal', 'bottom sheet', 'drawer', 'popover', 'tooltip', 'flyout', 'sheet'])
  ) {
    return 'overlays';
  }

  // Rule 3: Form inputs
  if (
    anyMatch(n, [
      'text field',
      'text area',
      'textarea',
      'dropdown',
      'select',
      'checkbox',
      'radio button',
      'radio',
      'switch',
      'toggle',
      'slider',
      'search bar',
      'search field',
      'code input',
      'input stepper',
      'stepper',
      'date picker',
      'time picker',
      'combobox',
      'autocomplete',
      'otp',
    ])
  ) {
    return 'form_inputs';
  }

  // Rule 4: Filter/Toggle chip with Selected state → form_inputs
  if (anyMatch(n, ['filter chip', 'toggle chip', 'filter'])) {
    if (props.has('selected') || props.has('expanded')) return 'form_inputs';
  }

  // Rule 5: Navigation
  if (
    anyMatch(n, [
      'tabs',
      'tab bar',
      'segmented control',
      'segmented',
      'bottom navigation',
      'bottom nav',
      'nav bar',
      'navbar',
      'breadcrumb',
      'pagination',
      'sidebar',
      'side nav',
      'top bar',
    ])
  ) {
    return 'navigation';
  }

  // Rule 6: Feedback & status
  if (
    anyMatch(n, [
      'toast',
      'snackbar',
      'banner',
      'notification',
      'alert',
      'badge',
      'progress bar',
      'progress tracker',
      'progress stepper',
      'loading spinner',
      'loading',
      'spinner',
      'skeleton',
      'support message',
      'help text',
      'empty state',
      'status',
    ])
  ) {
    return 'feedback';
  }

  // Rule 7: Content & display
  if (
    anyMatch(n, [
      'card',
      'list row',
      'list item',
      'accordion',
      'avatar',
      'tag',
      'divider',
      'separator',
      'product tile',
      'tile',
      'data table',
      'table',
      'image',
      'media',
      'chip',
    ])
  ) {
    return 'content_display';
  }

  // Rule 8: Actions — last (so "chip" above wins when appropriate)
  if (anyMatch(n, ['button', 'icon button', 'link', 'fab', 'floating action', 'cta', 'action'])) {
    return 'actions';
  }

  return 'uncategorized';
}

// ──────────────────────────────────────────────────────────────────────────────
// Scan
// ──────────────────────────────────────────────────────────────────────────────

function emptyGroups(): Record<ComponentCategory, ComponentEntry[]> {
  return {
    actions: [],
    form_inputs: [],
    navigation: [],
    feedback: [],
    overlays: [],
    content_display: [],
    sub_components: [],
    uncategorized: [],
  };
}

function extractVariantProps(node: ComponentSetNode): VariantProp[] {
  const defs = node.componentPropertyDefinitions;
  if (!defs) return [];

  const out: VariantProp[] = [];
  for (const rawKey of Object.keys(defs)) {
    const def = defs[rawKey];
    // Figma appends "#nodeId:x" suffix — strip it for display
    const key = rawKey.replace(/#\d+:\d+$/, '').trim();
    let valuesCount = 1;
    if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) {
      valuesCount = def.variantOptions.length;
    } else if (def.type === 'BOOLEAN') {
      valuesCount = 2;
    }
    out.push({
      key,
      type: def.type as VariantProp['type'],
      valuesCount,
    });
  }
  return out;
}

export async function scanComponents(
  options: ScanOptions,
  onProgress?: ProgressCallback
): Promise<ScanResult> {
  const prefix = options.prefix.trim();
  const dotPrefix = '.' + prefix;
  const allEntries: ComponentEntry[] = [];

  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (onProgress) onProgress(i + 1, pages.length, page.name);

    await page.loadAsync();

    const nodes = page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] });

    for (const node of nodes) {
      // Skip variant children inside a COMPONENT_SET
      if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
        continue;
      }

      const name = node.name;
      const isInternal = name.startsWith(dotPrefix);
      const isPublic = !isInternal && name.startsWith(prefix);
      if (!isPublic && !isInternal) continue;
      if (isInternal && !options.includeInternal) continue;

      const displayName = (isInternal
        ? name.slice(dotPrefix.length)
        : name.slice(prefix.length)
      ).trim();

      const variantProps: VariantProp[] =
        node.type === 'COMPONENT_SET' ? extractVariantProps(node) : [];

      const variantCount =
        node.type === 'COMPONENT_SET' ? node.children.length : 1;

      const entry: ComponentEntry = {
        id: node.id,
        name,
        displayName,
        type: node.type,
        page: page.name,
        variantCount,
        variantProps,
        isInternal,
        category: 'uncategorized',
      };
      entry.category = categorize(entry);
      allEntries.push(entry);
    }
  }

  // Group + sort
  const byCategory = emptyGroups();
  for (const entry of allEntries) byCategory[entry.category].push(entry);
  (Object.keys(byCategory) as ComponentCategory[]).forEach((cat) => {
    byCategory[cat].sort((a, b) => compareAsciiInsensitive(a.displayName, b.displayName));
  });

  const publicCount = allEntries.filter((e) => !e.isInternal).length;
  const internalCount = allEntries.filter((e) => e.isInternal).length;
  const totalVariants = allEntries.reduce((sum, e) => sum + e.variantCount, 0);

  return {
    prefix,
    scannedAt: new Date().toISOString(),
    totalComponents: allEntries.length,
    byCategory,
    summary: {
      publicComponents: publicCount,
      internalComponents: internalCount,
      totalVariants,
    },
  };
}
