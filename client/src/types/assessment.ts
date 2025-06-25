/**
 * @file assessment.ts
 *
 * @description
 * Front-end TypeScript types used throughout the Purpose Finder React SPA.
 * All complex, canonical types (e.g. `QuestionnaireResponses`) are re-exported
 * **type-only** from `@shared/schema` so the browser bundle is not forced to
 * include server-side Drizzle code.  Keep any *pure-frontend* helper interfaces
 * in this file.
 *
 * ⚠️  IMPORTANT:
 *   Always import from this file inside client code.  Do **NOT** import
 *   from `@shared/schema` directly except with `import type …` for type-only
 *   references, to avoid accidental runtime imports.
 */

import type {
  QuestionnaireResponses as SharedQuestionnaireResponses,
} from '@shared/schema';

/* -------------------------------------------------------------------------- */
/*                           RE-EXPORTED SHARED TYPES                         */
/* -------------------------------------------------------------------------- */

/**
 * @description
 * User questionnaire payload – now an object whose categories contain arrays
 * of `{ question, answer }` pairs.  Sourced from the shared schema to avoid
 * duplication and guarantee consistency across the stack.
 */
export type QuestionnaireResponses = SharedQuestionnaireResponses;

/* -------------------------------------------------------------------------- */
/*                    FRONT-END-ONLY RENDER / UI DATA TYPES                   */
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
  id?: number; // Becomes defined when persisted by the backend
  title: string;
  description: string;
  ikigaiAlignment: IkigaiAlignment;
  actionStrategy: string;
}

export interface SalaryData {
  title: string;
  entryLevel: string;
  midLevel: string;
  seniorLevel: string;
  location: string;
  sources: string[];
}

export interface AssessmentResults {
  coreDriversAnalysis: CoreDrivers;
  purposePaths: PurposePath[];
  salaryData: SalaryData[];
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  /**
   * ISO timestamp string supplied by the backend.
   * Renderers should convert to local time for display.
   */
  createdAt: string;
}
