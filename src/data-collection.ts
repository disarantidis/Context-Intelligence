/**
 * Layer 1 — Data Collection.
 *
 * The ONLY module in the plugin that calls the Figma read API:
 *   figma.variables.*, figma.getLocal*StylesAsync, figma.currentPage, figma.getNodeByIdAsync.
 *
 * Returns a normalised CollectedData snapshot that downstream layers
 * (Rule Engine, AI Orchestration, Action Executor) consume. No writes.
 *
 * Re-uses the existing scanner modules rather than duplicating their logic:
 *   - buildVariableRegistry() — serialized variable + collection registry
 *   - walkDocument()          — node tree walk for bindings
 */

import type {
  CollectedData,
  SerializedNode,
  ComponentMeta,
  VariableMap,
  CollectionMap,
  StyleMap,
  StorageSnapshot,
} from './types';
import { buildVariableRegistry, VariableRegistry } from './scanner/variableRegistry';
import { walkDocument, WalkOptions, WalkResult } from './scanner/documentWalker';
import { storage } from './storage';

// Re-export the underlying scanner helpers for callers that want lower-level access.
export { buildVariableRegistry, walkDocument };
export type { VariableRegistry, WalkOptions, WalkResult };

export interface CollectOptions {
  /** Restrict node serialization to figma.currentPage.selection (default: true). */
  selectedOnly?: boolean;
  /** Include local paint/text/effect styles (default: true). */
  includeStyles?: boolean;
  /** Include components reachable from the scan scope (default: true). */
  includeComponents?: boolean;
  /** Include a snapshot of relevant clientStorage keys (default: true). */
  includeStorageSnapshot?: boolean;
  /** Cap on nodes serialized; protects against massive selections. */
  maxNodes?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function serializeNode(node: BaseNode): SerializedNode {
  const boundVariables = (node as unknown as Record<string, unknown>)['boundVariables'];
  const sharedKeys = (node.getSharedPluginDataKeys?.('dscc') ?? []) as string[];
  const pluginData: Record<string, string> = {};
  for (const key of sharedKeys) {
    try { pluginData[key] = node.getSharedPluginData('dscc', key); } catch { /* noop */ }
  }
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    description: (node as any).description,
    boundVariables: boundVariables && typeof boundVariables === 'object'
      ? (boundVariables as Record<string, any>)
      : undefined,
    pluginData: Object.keys(pluginData).length ? pluginData : undefined,
  };
}

function collectDescendants(root: BaseNode, out: SerializedNode[], cap: number): void {
  if (out.length >= cap) return;
  out.push(serializeNode(root));
  if ('children' in root) {
    for (const child of (root as ChildrenMixin).children) {
      collectDescendants(child as BaseNode, out, cap);
      if (out.length >= cap) return;
    }
  }
}

function isComponentLike(node: BaseNode): boolean {
  return node.type === 'COMPONENT' || node.type === 'COMPONENT_SET';
}

function collectComponents(root: BaseNode, out: ComponentMeta[]): void {
  if (isComponentLike(root)) {
    const n = root as ComponentNode | ComponentSetNode;
    out.push({
      id: n.id,
      name: n.name,
      type: n.type,
      description: (n as any).description,
      documentationLinks: (n as any).documentationLinks?.map((l: any) => l.uri) ?? undefined,
      codeSyntax: (n as any).codeSyntax,
    });
  }
  if ('children' in root) {
    for (const child of (root as ChildrenMixin).children) {
      collectComponents(child as BaseNode, out);
    }
  }
}

async function buildVariableMap(): Promise<{ variables: VariableMap; collections: CollectionMap }> {
  const [rawVars, rawCols] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const variables: VariableMap = {};
  for (const v of rawVars) variables[v.id] = v;
  const collections: CollectionMap = {};
  for (const c of rawCols) collections[c.id] = c;
  return { variables, collections };
}

async function buildStyleMap(): Promise<StyleMap> {
  const [paints, texts, effects] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);
  const styles: StyleMap = {};
  for (const s of [...paints, ...texts, ...effects]) styles[s.id] = s;
  return styles;
}

async function buildStorageSnapshot(): Promise<StorageSnapshot> {
  const [bakedRules, enrichedRules, connectorConfig] = await Promise.all([
    storage.rules.getBaked(),
    storage.rules.getEnriched(),
    storage.config.getConnector(),
  ]);
  return { bakedRules, enrichedRules, connectorConfig };
}

// ============================================================================
// Main entry point
// ============================================================================

export async function collectData(options: CollectOptions = {}): Promise<CollectedData> {
  const {
    selectedOnly = true,
    includeStyles = true,
    includeComponents = true,
    includeStorageSnapshot = true,
    maxNodes = 5000,
  } = options;

  // Roots — either current selection or the whole current page.
  const roots: readonly BaseNode[] = selectedOnly
    ? (figma.currentPage.selection as readonly BaseNode[])
    : (figma.currentPage.children as readonly BaseNode[]);

  // 1. Serialized node tree
  const nodes: SerializedNode[] = [];
  for (const root of roots) {
    collectDescendants(root, nodes, maxNodes);
    if (nodes.length >= maxNodes) break;
  }

  // 2. Variables & collections
  const { variables, collections } = await buildVariableMap();

  // 3. Styles (optional)
  const styles: StyleMap = includeStyles ? await buildStyleMap() : {};

  // 4. Components (optional)
  const components: ComponentMeta[] = [];
  if (includeComponents) {
    for (const root of roots) collectComponents(root, components);
  }

  // 5. Plugin storage snapshot (optional)
  const pluginStorageSnapshot: StorageSnapshot = includeStorageSnapshot
    ? await buildStorageSnapshot()
    : {};

  return { nodes, variables, collections, styles, components, pluginStorageSnapshot };
}

// ============================================================================
// Focused accessors for callers that don't need the full snapshot
// ============================================================================

/** Current selection, serialized (shallow — no descendants). */
export function getSelectionShallow(): SerializedNode[] {
  return (figma.currentPage.selection as readonly BaseNode[]).map(serializeNode);
}

/** Fetch a node by ID through the async API (Layer 1 boundary). */
export async function getNodeById(id: string): Promise<BaseNode | null> {
  try {
    return await figma.getNodeByIdAsync(id);
  } catch {
    return null;
  }
}

/** Fetch a variable by ID through the async API (Layer 1 boundary). */
export async function getVariableById(id: string): Promise<Variable | null> {
  try {
    return await figma.variables.getVariableByIdAsync(id);
  } catch {
    return null;
  }
}

/** Fetch a variable collection by ID. */
export async function getCollectionById(id: string): Promise<VariableCollection | null> {
  try {
    return await figma.variables.getVariableCollectionByIdAsync(id);
  } catch {
    return null;
  }
}
