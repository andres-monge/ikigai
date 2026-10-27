import type { CareerMap } from '../../shared/career-map/index.js';
export type CandidateKind = 'paths' | 'voice' | 'learning';
export interface CandidatePreparation {
  status: 'blocked' | 'ready'; conflicts: string[]; adaptations: string[];
  originalSkill: string; contract: Record<string, unknown>;
}
export interface Candidate {
  id: string; name: string; kind: CandidateKind; version: string;
  voice: string; skills: Record<string, string>;
  sharedRules: string; controls: string; acceptedVoice: boolean;
  artifactPath: string;
  effortByModule?: Record<string, 'low' | 'medium' | 'high'>;
  preparation?: CandidatePreparation;
  archived?: boolean;
}
export interface ChatMessage { role: string; text: string; cards?: PathCard[] }
export interface PathCard { id?: string; [field: string]: unknown }
export interface Checkpoint {
  id: string; label: string; kind: CandidateKind;
  context: ChatMessage[]; currentMessage: string;
  historicalReply: string; historicalCards: PathCard[];
  provenance: Record<string, unknown>;
}
export interface Feedback { preference: 'none' | 'prefer' | 'avoid'; comment: string; updatedAt?: string }
export interface Job {
  id: string; candidateId: string; candidateName: string; version: string;
  checkpointId: string; parentId?: string; createdAt: string;
  status: 'queued' | 'running' | 'done' | 'error'; error?: string;
  reply?: string; cards?: PathCard[]; currentMessage?: string;
  feedback: Feedback; archive?: boolean; caveats?: string[];
  canonicalState?: CareerMap;
  config?: Candidate; traces?: unknown[]; operations?: unknown[];
  providerItems?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}
export interface LabState {
  candidates: Candidate[]; checkpoints: Checkpoint[]; jobs: Job[];
  model: string; effort: string; concurrency: number;
  acceptedVoice: string; privateRoot: string;
}
