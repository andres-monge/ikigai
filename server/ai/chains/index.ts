/**
 * @file index.ts (chains)
 *
 * Barrel file aggregating and re-exporting the AI chain functions so that
 * external modules can continue to `import { getPurposeDiscoveryStreamChain } from
 * "../ai/chains"` with zero changes.
 */

export { getPurposeDiscoveryStreamChain } from './purpose-discovery.stream.chain';
export { getActionPlanStreamChain } from './action-plan.stream.chain'; 