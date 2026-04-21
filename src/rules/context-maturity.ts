/**
 * Layer 2 rules — Context Maturity.
 *
 * The 26-dimension context maturity framework. Namespaces the two existing
 * pure-domain modules (context-evaluator + maturity-engine) to avoid
 * name collisions between their overlapping types.
 */
export * as evaluator from '../context-evaluator';
export * as engine from '../maturity-engine';
