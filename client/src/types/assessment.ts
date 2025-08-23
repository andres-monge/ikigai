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
  statementSentence: string;
  coreThreads: string;
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


export interface YoutubeVideo {
  title: string;
  url: string;
  thumbnailUrl: string;
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
  purposePaths: PurposePath[];
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