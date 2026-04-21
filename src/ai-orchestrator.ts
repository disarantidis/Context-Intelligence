/**
 * Layer 3 — AI Orchestration.
 *
 * The canonical entry point for all outbound network calls:
 *   - Rubric fetch (GitHub, cached 24 h)
 *   - Anthropic API (description generation, full analysis)
 *   - Notion / GitHub sync (re-exported via SyncAdapter)
 *
 * AI is ALWAYS optional. Every call here is allowed to fail — callers
 * must fall back to rule-only results. Responses must be validated
 * (schema check) before being trusted; we never blindly apply AI output.
 *
 * NOTE: learning/AIAnalysisModule still contains its own fetch() calls.
 * They should be migrated to route through this module in a follow-up.
 * This file establishes the canonical path.
 */

import type { AIPayload, AIEnrichedResult } from './types';
import { storage } from './storage';

// Re-export the existing sync adapter (Notion / GitHub). Callers that need
// external persistence should import via this module.
export { SyncAdapter } from './learning/SyncAdapter';
export type { SyncConfig, GitHubPaths, GitHubPushResult } from './learning/SyncAdapter';
export { AIAnalysisModule } from './learning/AIAnalysisModule';
export type { AIAnalysisRequest, AIAnalysisResponse } from './learning/AIAnalysisModule';

// ============================================================================
// Configuration
// ============================================================================

const RUBRIC_URL = 'https://raw.githubusercontent.com/PLACEHOLDER/main/rubrics/token-rubric.json';
const RUBRIC_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// ============================================================================
// Rubric (token scoring weights)
// ============================================================================

export interface RubricPayload {
  weights: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * Get the token-scoring rubric. Prefers cached copy (24h TTL).
 * On network failure returns null — caller must use built-in defaults.
 */
export async function fetchRubric(): Promise<RubricPayload | null> {
  try {
    const cached = await storage.rubric.get();
    if (cached && Date.now() - cached.ts < RUBRIC_TTL_MS) {
      return cached.data as RubricPayload;
    }
  } catch { /* fall through to network */ }

  try {
    const res = await fetch(RUBRIC_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as RubricPayload;
    await storage.rubric.set(data).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// Anthropic API — generic request
// ============================================================================

export interface AnthropicRequest {
  apiKey: string;
  system: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}

export interface AnthropicResponse {
  text: string;
  raw: unknown;
}

/**
 * Low-level Anthropic call. Throws on network / HTTP errors.
 * Callers should wrap in try/catch and gracefully degrade.
 */
export async function requestAnthropic(req: AnthropicRequest): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 1500,
      system: req.system,
      messages: [{ role: 'user', content: req.userMessage }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const raw = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = raw.content?.[0]?.text ?? '';
  return { text, raw };
}

// ============================================================================
// Full analysis (enrichment of rule results)
// ============================================================================

/**
 * Request a full AI analysis given a rule-engine output + collected data.
 * Returns enriched results or throws. Schema is validated before returning.
 */
export async function requestAnalysis(payload: AIPayload, apiKey: string): Promise<AIEnrichedResult> {
  const { text } = await requestAnthropic({
    apiKey,
    system: payload.systemPrompt,
    userMessage: JSON.stringify({
      collectedData: payload.collectedData,
      ruleResults: payload.ruleResults,
      storedContext: payload.storedContext,
      requestType: payload.requestType,
    }),
  });

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  // Minimal schema validation — trust but verify.
  const result: AIEnrichedResult = {
    ruleResults: Array.isArray(parsed?.ruleResults) ? parsed.ruleResults : [],
    generatedDescriptions:
      parsed?.generatedDescriptions && typeof parsed.generatedDescriptions === 'object'
        ? parsed.generatedDescriptions
        : {},
    insights: Array.isArray(parsed?.insights) ? parsed.insights : [],
    suggestedActions: Array.isArray(parsed?.suggestedActions) ? parsed.suggestedActions : [],
  };
  return result;
}

/**
 * Generate descriptions for a set of variables. Returns a partial map —
 * missing keys mean the AI did not produce a description for that variable.
 */
export async function generateDescriptions(
  prompt: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const { text } = await requestAnthropic({
    apiKey,
    system:
      'You are a design-system documentation assistant. Respond ONLY with a JSON object mapping variable IDs to description strings. No markdown, no preamble.',
    userMessage: prompt,
  });
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* fall through */ }
  return {};
}

// ============================================================================
// Aggregate export (convenience)
// ============================================================================

export const aiOrchestrator = {
  fetchRubric,
  requestAnthropic,
  requestAnalysis,
  generateDescriptions,
};
