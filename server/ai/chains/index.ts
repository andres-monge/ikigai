/**
 * @file index.ts (chains)
 *
 * Barrel file aggregating and re-exporting the AI chain functions so that
 * external modules can continue to `import { getPurposeDiscoveryChain } from
 * "../ai/chains"` with zero changes.
 */

export { getPurposeDiscoveryChain } from './purpose-discovery.chain';
export { getActionPlanChain } from './action-plan.chain';
export { getChatRefinementChain } from './chat-refinement.chain'; 