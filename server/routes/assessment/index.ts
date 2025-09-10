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
import { purposeDiscoveryRouter } from "./purpose-discovery";
import { actionPlanRouter } from "./action-plan";

/**
 * Combined assessment router that includes all assessment endpoints:
 * - POST /api/analyze/stream (from purpose-discovery.ts)
 * - POST /api/questionnaire/save (from purpose-discovery.ts)
 * - POST /api/action-plan/stream (from action-plan.ts)
 */
export const assessmentRouter = Router();

// Mount feature-specific routers
assessmentRouter.use(purposeDiscoveryRouter);
assessmentRouter.use(actionPlanRouter);