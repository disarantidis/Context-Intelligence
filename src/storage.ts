/**
 * Layer 4 — Storage Management.
 *
 * Single entry point for all figma.clientStorage access. Consolidates:
 *   - Rubric cache
 *   - Rules config (baked / enriched / connector)
 *   - Scan history and scores
 *   - API credentials (Anthropic, MCP)
 *   - DS settings (logo, theme, name)
 *   - Integration config (Git/Notion sync)
 *
 * Also re-exports the three existing storage subsystems:
 *   - draft (onboarding wizard draft)
 *   - cache (usage scan cache)
 *   - kb    (learning knowledge base)
 *
 * Do NOT call figma.clientStorage directly from new code. Use this module.
 * UI code must never import this file — message-pass to the plugin worker.
 */

import { compareAsciiInsensitive } from './string-compare';

// ============================================================================
// Re-exported subsystems
// ============================================================================
export * as draft from './onboarding/state/storage';
export { getCachedUsageScan, saveUsageScanCache, clearUsageScanCache } from './cache/clientStorage';
export { StorageAdapter } from './learning/StorageAdapter';

// ============================================================================
// Storage keys (centralised constants)
// ============================================================================
const K = {
  // Rubric
  rubric: 'cachedRubric',
  rubricTs: 'cachedRubricTs',
  // Rules
  rulesConfig: 'rulesConfig',
  bakedRules: 'dsccBakedRules',
  bakedRuleSummary: 'dsccBakedRuleSummary',
  enrichedRules: 'dsccEnrichedRules',
  // Scans
  scanScores: 'dsccScanScores',
  savedScans: 'dsccSavedScans',
  // Config / credentials
  connectorConfig: 'connectorConfig',
  mcpConfig: 'mcpConfig',
  descriptionApiKey: 'descriptionApiKey',
  aiModel: 'dsccAIModel',
  // Settings
  dsSettings: 'dscc-ds-settings',
  dsLogoPng: 'dscc-ds-settings-logo-png',
  uiTheme: 'dscc-ui-theme',
  // Integrations
  gitConfig: 'json-exporter-git-config',
  syncConfig: 'dsci_sync_config',
} as const;

export const STORAGE_KEYS = K;

// ============================================================================
// Low-level helpers (JSON-parsed, swallowed errors where appropriate)
// ============================================================================
async function getJson<T>(key: string, fallback: T | null = null): Promise<T | null> {
  try {
    const raw = await figma.clientStorage.getAsync(key);
    if (raw == null) return fallback;
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return raw as T;
  } catch {
    return fallback;
  }
}

async function setJson<T>(key: string, value: T): Promise<void> {
  await figma.clientStorage.setAsync(key, JSON.stringify(value));
}

async function getRaw<T = unknown>(key: string): Promise<T | null> {
  try {
    const v = await figma.clientStorage.getAsync(key);
    return v == null ? null : (v as T);
  } catch {
    return null;
  }
}

async function setRaw(key: string, value: unknown): Promise<void> {
  await figma.clientStorage.setAsync(key, value as any);
}

async function del(key: string): Promise<void> {
  try { await figma.clientStorage.deleteAsync(key); } catch { /* noop */ }
}

// ============================================================================
// Rubric
// ============================================================================
export const rubric = {
  async get(): Promise<{ data: unknown; ts: number } | null> {
    const [data, ts] = await Promise.all([
      getRaw<string>(K.rubric),
      getRaw<string>(K.rubricTs),
    ]);
    if (!data) return null;
    try {
      return { data: JSON.parse(data), ts: Number(ts) || 0 };
    } catch {
      return null;
    }
  },
  async set(data: unknown): Promise<void> {
    await Promise.all([
      figma.clientStorage.setAsync(K.rubric, JSON.stringify(data)).catch(() => {}),
      figma.clientStorage.setAsync(K.rubricTs, String(Date.now())).catch(() => {}),
    ]);
  },
  async clear(): Promise<void> {
    await Promise.all([del(K.rubric), del(K.rubricTs)]);
  },
};

// ============================================================================
// Rules
// ============================================================================
export const rules = {
  getConfig: <T = any>() => getJson<T>(K.rulesConfig),
  saveConfig: <T = any>(v: T) => setJson(K.rulesConfig, v),
  clearConfig: () => del(K.rulesConfig),

  getBaked: <T = any>() => getJson<T>(K.bakedRules),
  saveBaked: <T = any>(v: T) => setJson(K.bakedRules, v),

  getBakedSummary: <T = any>() => getJson<T>(K.bakedRuleSummary),
  saveBakedSummary: <T = any>(v: T) => setJson(K.bakedRuleSummary, v),

  getEnriched: <T = any>() => getJson<T>(K.enrichedRules),
  saveEnriched: <T = any>(v: T) => setJson(K.enrichedRules, v),
};

// ============================================================================
// Scans
// ============================================================================
export const scans = {
  getScores: <T = any>() => getJson<T>(K.scanScores),
  saveScores: <T = any>(v: T) => setJson(K.scanScores, v),

  getSaved: <T = any>() => getJson<T>(K.savedScans),
  saveSaved: <T = any>(v: T) => setJson(K.savedScans, v),

  getHistory: <T = any[]>(key: string) => getRaw<T>(key),
  saveHistory: (key: string, v: unknown) => setRaw(key, v),
  deleteHistoryEntry: async (key: string, entryId: string): Promise<void> => {
    const stored = await getRaw<any[]>(key);
    const arr = Array.isArray(stored) ? stored : [];
    await setRaw(key, arr.filter((e: any) => e && e.id !== entryId));
  },
};

// ============================================================================
// Config / credentials
// ============================================================================
export const config = {
  getConnector: <T = any>() => getJson<T>(K.connectorConfig),
  saveConnector: <T = any>(v: T) => setJson(K.connectorConfig, v),
  clearConnector: () => del(K.connectorConfig),

  getMcp: <T = any>() => getJson<T>(K.mcpConfig),
  saveMcp: <T = any>(v: T) => setJson(K.mcpConfig, v),

  getDescriptionApiKey: () => getRaw<string>(K.descriptionApiKey),
  saveDescriptionApiKey: (v: string) => setRaw(K.descriptionApiKey, v ?? ''),

  getAiModel: () => getRaw<string>(K.aiModel),
  saveAiModel: (v: string) => setRaw(K.aiModel, v),
};

// ============================================================================
// Settings
// ============================================================================
export const settings = {
  getDS: <T = any>() => getRaw<T>(K.dsSettings),
  saveDS: <T = any>(v: T) => setRaw(K.dsSettings, v),

  getLogo: () => getRaw<string>(K.dsLogoPng),
  saveLogo: (dataUrl: string) => setRaw(K.dsLogoPng, dataUrl),
  clearLogo: () => del(K.dsLogoPng),

  getTheme: () => getRaw<string>(K.uiTheme),
  saveTheme: (v: string) => setRaw(K.uiTheme, v),
};

// ============================================================================
// Integrations
// ============================================================================
export const integrations = {
  getGit: <T = any>() => getRaw<T>(K.gitConfig),
  saveGit: <T = any>(v: T) => setRaw(K.gitConfig, v),
  clearGit: () => del(K.gitConfig),

  getSync: <T = any>() => getJson<T>(K.syncConfig),
  saveSync: <T = any>(v: T) => setJson(K.syncConfig, v),
};

// ============================================================================
// Token export scan cache (clj_* keys — ported from JSON Exporter plugin)
// Large scan payloads are chunked across multiple entries to bypass the
// per-key size ceiling. Names + metadata are kept in two small index blobs.
// ============================================================================
const CL_NAMES_KEY = 'clj_scanNames';
const CL_META_KEY = 'clj_scanMeta';
const CL_CHUNK_SIZE = 3_500_000;

function _parseJsonArray<T = any>(raw: unknown): T[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export interface TokenExportScanMeta {
  name: string;
  timestamp: string;
  stats: Record<string, unknown>;
  scanMode: string;
}

export const tokenExport = {
  getPrefix: () => getRaw<string>('clj_prefix'),
  getIncludeDeprecated: () => getRaw<boolean>('clj_includeDeprecated'),

  async getLastScan<T = any>(): Promise<T | null> {
    const raw = await getRaw<string>('clj_lastScan');
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  saveLastScan: (data: unknown) =>
    figma.clientStorage.setAsync('clj_lastScan', JSON.stringify(data)).catch(() => {}),

  async getSavedNames(): Promise<string[]> {
    return _parseJsonArray<string>(await getRaw<string>(CL_NAMES_KEY));
  },
  async getSavedMeta(): Promise<TokenExportScanMeta[]> {
    return _parseJsonArray<TokenExportScanMeta>(await getRaw<string>(CL_META_KEY));
  },

  async saveScan(name: string, data: any): Promise<void> {
    const dataStr = JSON.stringify(data);
    if (dataStr.length <= CL_CHUNK_SIZE) {
      await figma.clientStorage.setAsync('clj_scan_' + name, data);
    } else {
      const chunks: string[] = [];
      for (let i = 0; i < dataStr.length; i += CL_CHUNK_SIZE) {
        chunks.push(dataStr.slice(i, i + CL_CHUNK_SIZE));
      }
      await figma.clientStorage.setAsync('clj_chunks_' + name, chunks.length);
      await Promise.all(
        chunks.map((chunk, idx) =>
          figma.clientStorage.setAsync('clj_scan_' + name + '_c' + idx, chunk),
        ),
      );
    }

    const names = await tokenExport.getSavedNames();
    if (!names.includes(name)) { names.push(name); names.sort(); }
    await figma.clientStorage.setAsync(CL_NAMES_KEY, JSON.stringify(names));

    const meta = await tokenExport.getSavedMeta();
    const entry: TokenExportScanMeta = {
      name,
      timestamp: data?.timestamp || new Date().toISOString(),
      stats: data?.stats || {},
      scanMode: data?.scanMode || 'all',
    };
    const idx = meta.findIndex((m) => m.name === name);
    if (idx >= 0) meta[idx] = entry; else meta.push(entry);
    meta.sort((a, b) => compareAsciiInsensitive(b.timestamp || '', a.timestamp || ''));
    await figma.clientStorage.setAsync(CL_META_KEY, JSON.stringify(meta));
  },

  async loadScan<T = any>(name: string): Promise<T | null> {
    const chunkCount = await figma.clientStorage.getAsync('clj_chunks_' + name);
    if (chunkCount && chunkCount >= 1) {
      const promises: Promise<any>[] = [];
      for (let i = 0; i < chunkCount; i++) {
        promises.push(figma.clientStorage.getAsync('clj_scan_' + name + '_c' + i));
      }
      const chunks = await Promise.all(promises);
      return JSON.parse(chunks.join('')) as T;
    }
    const val = await figma.clientStorage.getAsync('clj_scan_' + name);
    return typeof val === 'string' ? (JSON.parse(val) as T) : (val as T);
  },

  async deleteScan(name: string): Promise<void> {
    const chunkCount = await figma.clientStorage.getAsync('clj_chunks_' + name);
    const dels: Promise<void>[] = [
      figma.clientStorage.deleteAsync('clj_scan_' + name),
      figma.clientStorage.deleteAsync('clj_chunks_' + name),
    ];
    if (chunkCount && chunkCount >= 1) {
      for (let i = 0; i < chunkCount; i++) {
        dels.push(figma.clientStorage.deleteAsync('clj_scan_' + name + '_c' + i));
      }
    }
    await Promise.all(dels);

    const names = (await tokenExport.getSavedNames()).filter((n) => n !== name);
    await figma.clientStorage.setAsync(CL_NAMES_KEY, JSON.stringify(names));

    const meta = (await tokenExport.getSavedMeta()).filter((m) => m.name !== name);
    await figma.clientStorage.setAsync(CL_META_KEY, JSON.stringify(meta));
  },
};

// ============================================================================
// Aggregate export (convenience)
// ============================================================================
export const storage = { rubric, rules, scans, config, settings, integrations, tokenExport };
