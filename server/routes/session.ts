/**
 * @description
 * Session management endpoints for retrieving and clearing user session data.
 * 
 * ✨ Step 8 Implementation ✨
 * ──────────────────────────
 * • GET /api/session/:sessionId - Retrieve fully hydrated session data
 * • POST /api/session/start-over - Delete all session data (idempotent)
 * 
 * @dependencies
 * - Express Router for route handling
 * - storage for database operations
 * - Zod schemas for request validation
 */

import { Router } from "express";
import { storage } from "../storage";
import { startOverRequestSchema } from "@shared/schema";

export const sessionRouter = Router();

/* ------------------------- GET /api/session/:sessionId ------------------------- */

sessionRouter.get("/session/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    // Validate sessionId parameter
    if (!sessionId || sessionId.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid sessionId parameter",
        message: "sessionId must be a non-empty string"
      });
    }

    // Fetch session with hydrated data
    const session = await storage.getAssessmentSessionBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
        message: `No session found with id: ${sessionId}`
      });
    }

    // Return the fully hydrated session
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/* ------------------------ POST /api/session/start-over ------------------------ */

sessionRouter.post("/session/start-over", async (req, res, next) => {
  try {
    // Validate request body
    const validation = startOverRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: validation.error.errors,
      });
    }

    const { sessionId } = validation.data;

    // Delete session data (idempotent - always succeeds)
    const wasDeleted = await storage.deleteAssessmentSessionBySessionId(sessionId);

    // Return success regardless of whether session existed
    res.json({
      message: wasDeleted 
        ? "Session data cleared successfully"
        : "Session was already cleared or did not exist"
    });
  } catch (err) {
    next(err);
  }
});