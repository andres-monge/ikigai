/**
 * @description
 * Shared TypeScript interfaces for type safety across client and server.
 * 
 * This file contains browser-safe type definitions that can be imported
 * by both frontend and backend code without pulling in Node.js-specific
 * dependencies like Drizzle ORM.
 * 
 * Created as part of Step 22.2 to replace dangerous `any` types with
 * proper interfaces for better compile-time type checking.
 */

/**
 * Ikigai alignment data structure representing the four pillars
 * of ikigai philosophy used in career path analysis.
 */
export interface IkigaiAlignment {
  /** What the person is passionate about */
  love: string;
  /** What the person excels at or has talent for */
  goodAt: string;
  /** What the world needs or values */
  worldNeeds: string;
  /** How this path can provide economic stability */
  pay: string;
}

/**
 * Core drivers analysis representing the fundamental themes
 * that drive a person's career motivations and values.
 */
export interface CoreDriversAnalysis {
  /** A concise statement summarizing the person's core ikigai */
  statementSentence: string;
  /** Detailed explanation of the connecting threads in their responses */
  coreThreads: string;
}