/**
 * Layer 2 rules — barrel.
 *
 * Canonical import path for rule modules. Prefer:
 *   import { checkVariableScope } from './rules';
 * over:
 *   import { checkVariableScope } from './rules/scopes';
 */
export * as naming from './naming';
export * as aliases from './aliases';
export * as contextMaturity from './context-maturity';
export * as scopes from './scopes';
