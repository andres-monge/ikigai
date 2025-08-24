/**
 * @description
 * Assessment route module barrel export.
 * 
 * Combines all assessment-related routers into a single exported router
 * that maintains the same API interface as the original monolithic file.
 * This allows external code to import from the directory without knowing
 * the internal file structure.
 */

import { Router } from "express";
import { pathsRouter } from "./paths";
import { actionPlanRouter } from "./action-plan";

/**
 * Combined assessment router that includes all assessment endpoints:
 * - POST /api/analyze (from paths.ts)
 * - GET /api/analyze/stream (from paths.ts)  
 * - POST /api/action-plan (from action-plan.ts)
 * - GET /api/action-plan/stream (from action-plan.ts)
 */
export const assessmentRouter = Router();

// Mount feature-specific routers
assessmentRouter.use(pathsRouter);
assessmentRouter.use(actionPlanRouter);