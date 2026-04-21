/**
 * Layer 2 rules — Token Scopes.
 *
 * Validates that variables declare the correct `scopes` array for their
 * intent (e.g. spacing tokens are scoped WIDTH_HEIGHT / GAP, not ALL_SCOPES).
 *
 * Pure functions — no Figma API, no fetch, no storage.
 */

import type { RuleResult } from '../types';

/** Variable-shaped input for scope checks (avoids coupling to Figma types). */
export interface ScopeCheckInput {
  id: string;
  name: string;
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN' | string;
  scopes: string[];
}

/** Heuristics mapping token-name prefixes to allowed scope sets. */
const NAME_TO_EXPECTED_SCOPES: Array<{ match: RegExp; scopes: string[]; reason: string }> = [
  { match: /(^|\/)(spacing|space|gap|padding|margin|inset)\b/i,
    scopes: ['WIDTH_HEIGHT', 'GAP'],
    reason: 'spacing tokens should be scoped WIDTH_HEIGHT or GAP' },
  { match: /(^|\/)(radius|corner|border-radius)\b/i,
    scopes: ['CORNER_RADIUS'],
    reason: 'radius tokens should be scoped CORNER_RADIUS' },
  { match: /(^|\/)(stroke|border-width)\b/i,
    scopes: ['STROKE_FLOAT'],
    reason: 'stroke-width tokens should be scoped STROKE_FLOAT' },
  { match: /(^|\/)(opacity|alpha)\b/i,
    scopes: ['OPACITY'],
    reason: 'opacity tokens should be scoped OPACITY' },
  { match: /(^|\/)(font-size|text-size|size\/text)\b/i,
    scopes: ['FONT_SIZE'],
    reason: 'font-size tokens should be scoped FONT_SIZE' },
  { match: /(^|\/)(line-height|leading)\b/i,
    scopes: ['LINE_HEIGHT'],
    reason: 'line-height tokens should be scoped LINE_HEIGHT' },
];

/**
 * Check scope correctness for a single variable.
 * Returns [] if the variable's scopes are acceptable.
 */
export function checkVariableScope(v: ScopeCheckInput): RuleResult[] {
  const results: RuleResult[] = [];

  // Overly broad: ALL_SCOPES on a variable whose name suggests a narrow intent.
  const isAllScopes = v.scopes.length === 0 || v.scopes.includes('ALL_SCOPES');
  for (const rule of NAME_TO_EXPECTED_SCOPES) {
    if (rule.match.test(v.name) && isAllScopes) {
      results.push({
        ruleId: 'scopes.too-broad',
        severity: 'warning',
        target: v.id,
        targetType: 'variable',
        message: `"${v.name}" uses ALL_SCOPES; ${rule.reason}.`,
        suggestedFix: `Set scopes to [${rule.scopes.map(s => `'${s}'`).join(', ')}]`,
      });
      return results;
    }
  }

  // Mismatched: non-ALL scopes but none overlap with the expected set.
  for (const rule of NAME_TO_EXPECTED_SCOPES) {
    if (!rule.match.test(v.name)) continue;
    if (isAllScopes) continue;
    const overlap = rule.scopes.some(s => v.scopes.includes(s));
    if (!overlap) {
      results.push({
        ruleId: 'scopes.mismatch',
        severity: 'warning',
        target: v.id,
        targetType: 'variable',
        message: `"${v.name}" declares scopes [${v.scopes.join(', ')}] — ${rule.reason}.`,
        suggestedFix: `Include at least one of: ${rule.scopes.join(', ')}`,
      });
    }
  }

  return results;
}

/** Batch helper. */
export function checkVariableScopes(vars: ScopeCheckInput[]): RuleResult[] {
  const out: RuleResult[] = [];
  for (const v of vars) out.push(...checkVariableScope(v));
  return out;
}
