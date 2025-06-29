/**
 * @file assessment.ts
 *
 * @description
 * Front-end TypeScript types used throughout the Purpose Finder React SPA.
 * This file defines the shape of data used for rendering and state management.
 *
 * ✨ **Updates in Step 21** ✨
 * - Replaced the incomplete `AssessmentResults` type with the comprehensive
 * `FullAssessment` type, which mirrors the backend's hydrated session object.
 * - Added `ActionPlan` and its related types (`YoutubeVideo`, `SkillToLearn`)
 * to strongly type the action plan data.
 * - Added `PurposePathWithSalary` to represent the nested data structure from
 * the server.
 * - Updated `SalaryData` to include a `title` and reflect nullable fields
 * from the database schema.
 *
 * @dependencies
 * - @shared/schema: For re-exporting canonical types like `QuestionnaireResponses`.
 */

import type {
  QuestionnaireResponses as SharedQuestionnaireResponses,
} from '@shared/schema';

/* -------------------------------------------------------------------------- */
/* RE-EXPORTED SHARED TYPES                           */
/* -------------------------------------------------------------------------- */

/**
 * @description User questionnaire payload.
 * Sourced from the shared schema to guarantee consistency.
 */
export type QuestionnaireResponses = SharedQuestionnaireResponses;
export type Language = 'en' | 'es';

/* -------------------------------------------------------------------------- */
/* FRONT-END-ONLY RENDER / UI DATA TYPES                    */
/* -------------------------------------------------------------------------- */

export interface CoreDrivers {
  energy: string;
  edge: string;
  impact: string;
  economicReality: string;
}

export interface IkigaiAlignment {
  love: string;
  goodAt: string;
  worldNeeds: string;
  pay: string;
}

export interface PurposePath {
  id: number; // Is always defined when coming from the server
  title: string;
  description: string;
  ikigaiAlignment: IkigaiAlignment;
  actionStrategy: string;
}

/**
 * Represents salary data as stored in the DB (with nullable fields)
 * plus a `title` field added by the client for rendering tables.
 */
export interface SalaryData {
  title: string;
  entryLevel: string | null;
  midLevel: string | null;
  seniorLevel: string | null;
  location: string | null;
  sources: string[] | null;
}

export interface YoutubeVideo {
  title: string;
  url: string;
}

export interface SkillToLearn {
  skill: string;
  youtubeLinks: YoutubeVideo[];
}

/**
 * One milestone – a phase in the roadmap with its own set of tasks and
 * optionally embedded skills + learning resources.
 */
export interface Milestone {
  title: string;
  timeline: string;
  actions: string[];
  skills?: SkillToLearn[];
}

/**
 * The complete Action Plan returned by the backend, now a single array of
 * ordered milestones rather than three separate top-level lists.
 */
export interface ActionPlan {
  milestones: Milestone[];
}

/**
 * Helper type representing the nested structure of a purpose path
 * with its associated salary data, as returned by the backend.
 */
export interface PurposePathWithSalary extends PurposePath {
  // Omit 'title' as it's already on the parent PurposePath
  salaryData: Omit<SalaryData, 'title'>[];
}

/**
 * @type FullAssessment
 * @description The canonical client-side representation of the entire user
 * session. This type matches the `HydratedAssessmentSession` object sent
 * by the backend and is the data stored in `sessionStorage`.
 */
export interface FullAssessment {
  id: number;
  sessionId: string;
  language: Language;
  responses: QuestionnaireResponses | null;
  coreDriversAnalysis: CoreDrivers | null;
  chosenPathId: number | null;
  actionPlan: ActionPlan | null;
  createdAt: string;
  updatedAt: string;
  purposePaths: PurposePathWithSalary[];
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  /**
   * ISO timestamp string supplied by the backend.
   */
  createdAt: string;
}