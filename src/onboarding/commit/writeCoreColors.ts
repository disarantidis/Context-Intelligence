/**
 * Step 09 commit — Op 1: Write .core color + shade primitives.
 *
 * Creates/updates raw COLOR variables in `.core` for:
 *   - Primary brand palette (10 stops → `brand/50` … `brand/900`)
 *   - Optional secondary palette (`brand-second/50` … `brand-second/900`)
 *   - Extra accent shades entered in Step 04 (`accent-shade/<hex>`)
 *   - Neutral shades (`neutral/<hex>`)
 *   - Functional solid colors (`functional/destructive/500`, etc.)
 *
 * Returns the number of variables created/updated (for UI progress).
 */

import type { OnboardingDraft, PaletteEntry } from '../state/types';
import {
  CORE_COLLECTION_NAME,
  getOrCreateCollection,
  upsertVariable,
  setColorAllModes,
} from './shared';

export async function writeCoreColors(draft: OnboardingDraft): Promise<number> {
  const core = await getOrCreateCollection(CORE_COLLECTION_NAME);
  let count = 0;

  // ── Primary brand palette ──────────────────────────────────────────────────
  if (draft.palette.primary) {
    count += await writePalette(core, 'brand', draft.palette.primary);
  }

  // ── Secondary palette ──────────────────────────────────────────────────────
  if (draft.palette.secondary) {
    count += await writePalette(core, 'brand-second', draft.palette.secondary);
  } else {
    // User has no secondary — remove any pre-existing brand-second/* variables,
    // the entire `.secondary` collection (if any), and any `secondary` mode /
    // scheme-variable under scheme collections so the output matches intent.
    count += await removeSecondaryArtifacts(core);
  }

  // ── Accent & neutral extra shades (user-entered hexes) ─────────────────────
  const accentShades = uniqueHexes(draft.shades.accentShades);
  for (let i = 0; i < accentShades.length; i++) {
    const hex = accentShades[i];
    const name = `accent-shade/${i + 1}`;
    const { variable } = await upsertVariable(core, name, 'COLOR');
    await setColorAllModes(variable, core, hex);
    count++;
  }
  const neutralShades = uniqueHexes(draft.shades.neutralShades);
  for (let i = 0; i < neutralShades.length; i++) {
    const hex = neutralShades[i];
    const name = `neutral/${i + 1}`;
    const { variable } = await upsertVariable(core, name, 'COLOR');
    await setColorAllModes(variable, core, hex);
    count++;
  }

  // ── Functional colors ──────────────────────────────────────────────────────
  const fn = draft.shades.functional;
  const slots: Array<[string, string | undefined]> = [
    ['functional/destructive/500', fn.destructive],
    ['functional/warning/500',     fn.warning],
    ['functional/success/500',     fn.success],
    ['functional/info/500',        fn.info],
  ];
  for (const [name, hex] of slots) {
    if (!hex) continue;
    const { variable } = await upsertVariable(core, name, 'COLOR');
    await setColorAllModes(variable, core, hex);
    count++;
  }

  return count;
}

async function writePalette(
  core: VariableCollection,
  prefix: string,
  palette: PaletteEntry[],
): Promise<number> {
  let count = 0;
  for (const entry of palette) {
    const name = `${prefix}/${entry.shadeName}`;
    const { variable } = await upsertVariable(core, name, 'COLOR');
    await setColorAllModes(variable, core, entry.hex);
    count++;
  }
  return count;
}

// Clean every secondary artifact the user might have from a previous run:
//   • `.core` COLOR variables under `brand-second/*` or `core-colours/secondary/**`
//   • An entire `.secondary` / `secondary` collection
//   • Any mode whose name contains "secondary" on scheme collections
//   • Scheme variables under `color/secondary*` / `*/secondary/*`
async function removeSecondaryArtifacts(core: VariableCollection): Promise<number> {
  let removed = 0;

  // 1) .core variables under secondary-named paths
  const allVars = await figma.variables.getLocalVariablesAsync();
  for (const v of allVars) {
    if (v.variableCollectionId !== core.id) continue;
    const n = v.name;
    const isSecondary =
      n.startsWith('brand-second/') ||
      n.indexOf('/brand-second/') !== -1 ||
      n.indexOf('core-colours/secondary/') !== -1 ||
      (/\/secondary\//.test(n) && /core-colours/.test(n));
    if (isSecondary) {
      try { v.remove(); removed++; } catch { /* ignore */ }
    }
  }

  // 2) Remove a stand-alone `.secondary` / `secondary` collection, if present.
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of collections) {
    const lc = c.name.toLowerCase();
    if (lc === '.secondary' || lc === 'secondary') {
      try { c.remove(); removed++; } catch { /* ignore */ }
    }
  }

  // 3) In scheme-style collections, drop modes named like "secondary"
  //    and any COLOR variable whose name itself references secondary.
  const remaining = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of remaining) {
    const lc = c.name.toLowerCase();
    const looksLikeScheme =
      lc === 'core brand scheme' ||
      lc === '.scheme' ||
      lc === 'scheme' ||
      lc.indexOf('scheme') !== -1;
    if (!looksLikeScheme) continue;

    // Remove secondary modes (keep ≥ 1 mode so the collection stays valid).
    const modesSnapshot = c.modes.slice();
    for (const m of modesSnapshot) {
      if (/secondary/i.test(m.name) && c.modes.length > 1) {
        try { c.removeMode(m.modeId); removed++; } catch { /* ignore */ }
      }
    }

    // Remove any scheme variable referencing secondary in its name.
    for (const id of c.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v) continue;
      if (/secondary/i.test(v.name) || /brand-second/i.test(v.name)) {
        try { v.remove(); removed++; } catch { /* ignore */ }
      }
    }
  }

  return removed;
}

function uniqueHexes(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const h = String(raw).trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(h)) continue;
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}
