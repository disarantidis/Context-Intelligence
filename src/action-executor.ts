/**
 * Layer 6 — Action Execution.
 *
 * The ONLY module that writes back to Figma. All enrichment writes
 * (descriptions, scopes, code syntax, annotations, names, variable values)
 * flow through executeAction() / executeBatch().
 *
 * Every action validates its target still exists before writing. Batches
 * continue on individual failure; each action reports its own result.
 *
 * Destructive operations (delete, restructure) are intentionally NOT
 * supported here — this layer is for enrichment only.
 *
 * NOTE: The onboarding/commit/* files and fix-applier.ts still hold some
 * legacy writes. Migration of those callers is a follow-up; this layer
 * establishes the canonical write path going forward.
 */

import type { ActionRequest, ActionResult } from './types';
import { getNodeById, getVariableById } from './data-collection';

// ============================================================================
// Extended action types beyond the base ActionRequest union
// ============================================================================

export type ExtendedActionRequest =
  | ActionRequest
  | { type: 'rename-node'; targetId: string; targetType: 'component'; value: string }
  | { type: 'set-documentation-links'; targetId: string; targetType: 'component'; value: Array<{ uri: string }> }
  | { type: 'set-variant-description'; targetId: string; targetType: 'component'; variantProperty: string; value: string };

// ============================================================================
// Individual action handlers
// ============================================================================

async function setVariableDescription(targetId: string, value: string): Promise<ActionResult> {
  const action: ActionRequest = { type: 'set-description', targetId, targetType: 'variable', value };
  const variable = await getVariableById(targetId);
  if (!variable) return { action, success: false, error: `Variable not found: ${targetId}` };
  try {
    variable.description = String(value ?? '');
    return { action, success: true };
  } catch (e) {
    return { action, success: false, error: toErr(e) };
  }
}

async function setVariableScopes(targetId: string, value: unknown): Promise<ActionResult> {
  const action: ActionRequest = { type: 'set-scope', targetId, targetType: 'variable', value };
  if (!Array.isArray(value)) {
    return { action, success: false, error: 'Scopes must be an array' };
  }
  const variable = await getVariableById(targetId);
  if (!variable) return { action, success: false, error: `Variable not found: ${targetId}` };
  try {
    variable.scopes = value as VariableScope[];
    return { action, success: true };
  } catch (e) {
    return { action, success: false, error: toErr(e) };
  }
}

async function setVariableCodeSyntax(
  targetId: string,
  platform: 'WEB' | 'ANDROID' | 'iOS' | undefined,
  value: string,
): Promise<ActionResult> {
  const action: ActionRequest = { type: 'set-code-syntax', targetId, targetType: 'variable', value, platform };
  if (!platform) return { action, success: false, error: 'platform required for set-code-syntax' };
  const variable = await getVariableById(targetId);
  if (!variable) return { action, success: false, error: `Variable not found: ${targetId}` };
  try {
    variable.setVariableCodeSyntax(platform, String(value ?? ''));
    return { action, success: true };
  } catch (e) {
    return { action, success: false, error: toErr(e) };
  }
}

async function setComponentDescription(targetId: string, value: string): Promise<ActionResult> {
  const action: ActionRequest = { type: 'set-description', targetId, targetType: 'component', value };
  const node = await getNodeById(targetId);
  if (!node) return { action, success: false, error: `Node not found: ${targetId}` };
  if (!('description' in node)) {
    return { action, success: false, error: 'Node does not support description' };
  }
  try {
    (node as { description: string }).description = String(value ?? '');
    return { action, success: true };
  } catch (e) {
    return { action, success: false, error: toErr(e) };
  }
}

async function setAnnotation(targetId: string, value: unknown): Promise<ActionResult> {
  const action: ActionRequest = { type: 'set-annotation', targetId, targetType: 'component', value };
  const node = await getNodeById(targetId);
  if (!node) return { action, success: false, error: `Node not found: ${targetId}` };
  if (!('annotations' in node)) {
    return { action, success: false, error: 'Node does not support annotations' };
  }
  try {
    (node as any).annotations = Array.isArray(value) ? value : [value];
    return { action, success: true };
  } catch (e) {
    return { action, success: false, error: toErr(e) };
  }
}

async function renameNode(targetId: string, value: string): Promise<ActionResult> {
  const action: ExtendedActionRequest = { type: 'rename-node', targetId, targetType: 'component', value };
  const node = await getNodeById(targetId);
  if (!node) return { action: action as any, success: false, error: `Node not found: ${targetId}` };
  try {
    node.name = String(value ?? '');
    return { action: action as any, success: true };
  } catch (e) {
    return { action: action as any, success: false, error: toErr(e) };
  }
}

async function setDocumentationLinks(targetId: string, value: unknown): Promise<ActionResult> {
  const action: ExtendedActionRequest = { type: 'set-documentation-links', targetId, targetType: 'component', value: value as any };
  if (!Array.isArray(value)) {
    return { action: action as any, success: false, error: 'Documentation links must be an array' };
  }
  const node = await getNodeById(targetId);
  if (!node) return { action: action as any, success: false, error: `Node not found: ${targetId}` };
  if (!('documentationLinks' in node)) {
    return { action: action as any, success: false, error: 'Node does not support documentation links' };
  }
  try {
    (node as any).documentationLinks = value;
    return { action: action as any, success: true };
  } catch (e) {
    return { action: action as any, success: false, error: toErr(e) };
  }
}

async function setVariantDescription(
  targetId: string,
  variantProperty: string,
  value: string,
): Promise<ActionResult> {
  const action: ExtendedActionRequest = { type: 'set-variant-description', targetId, targetType: 'component', variantProperty, value };
  const node = await getNodeById(targetId);
  if (!node) return { action: action as any, success: false, error: `Node not found: ${targetId}` };

  let componentSet: ComponentSetNode | null = null;
  if (node.type === 'COMPONENT_SET') componentSet = node as ComponentSetNode;
  else if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    componentSet = node.parent as ComponentSetNode;
  }
  if (!componentSet) {
    return { action: action as any, success: false, error: 'Could not find component set' };
  }
  try {
    componentSet.setPluginData(`variant_desc_${variantProperty}`, String(value ?? ''));
    return { action: action as any, success: true };
  } catch (e) {
    return { action: action as any, success: false, error: toErr(e) };
  }
}

function toErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Execute a single action against Figma. Validates target existence,
 * performs the write, returns per-action result. Never throws.
 */
export async function executeAction(req: ExtendedActionRequest): Promise<ActionResult> {
  try {
    switch (req.type) {
      case 'set-description':
        return req.targetType === 'variable'
          ? await setVariableDescription(req.targetId, req.value)
          : await setComponentDescription(req.targetId, req.value);
      case 'set-scope':
        return await setVariableScopes(req.targetId, req.value);
      case 'set-code-syntax':
        return await setVariableCodeSyntax(req.targetId, (req as ActionRequest).platform, req.value);
      case 'set-annotation':
        return await setAnnotation(req.targetId, req.value);
      case 'rename-node':
        return await renameNode(req.targetId, req.value);
      case 'set-documentation-links':
        return await setDocumentationLinks(req.targetId, req.value);
      case 'set-variant-description':
        return await setVariantDescription(req.targetId, req.variantProperty, req.value);
      default:
        return {
          action: req as ActionRequest,
          success: false,
          error: `Unsupported action type: ${(req as any).type}`,
        };
    }
  } catch (e) {
    return { action: req as ActionRequest, success: false, error: toErr(e) };
  }
}

/**
 * Execute a batch of actions sequentially. Each failure is isolated —
 * subsequent actions still run. Returns per-action results.
 */
export async function executeBatch(requests: ExtendedActionRequest[]): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: ActionResult[];
}> {
  const results: ActionResult[] = [];
  let successful = 0;
  let failed = 0;
  for (const req of requests) {
    const res = await executeAction(req);
    results.push(res);
    if (res.success) successful++;
    else failed++;
  }
  return { total: requests.length, successful, failed, results };
}
