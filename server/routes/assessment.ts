
/**
 * @description 
 * This module handles all assessment-related API routes for the Purpose Finder application.
 * It is responsible for managing the core ikigai analysis and action plan generation endpoints.
 * 
 * Key features:
 * - POST /api/analyze: Generates initial ikigai analysis and purpose paths
 * - POST /api/action-plan: Creates detailed action plans for selected paths
 * - Session management and response validation
 * - Integration with storage layer for persistence
 * 
 * @dependencies
 * - Express: Web framework for route handling
 * - Storage: In-memory storage interface for session data
 * - Zod schemas: Request validation from shared schema
 * 
 * @notes
 * - All endpoints require sessionId for data persistence
 * - Error responses follow { error: string } format
 * - Future integration with Gemini API wrapper will be added in next steps
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { 
  questionnaireResponseSchema,
  analysisRequestSchema
} from "@shared/schema";

/**
 * Registers assessment-related routes with the Express application
 * @param app - Express application instance
 */
export function registerAssessmentRoutes(app: Express): void {
  
  // Create or get assessment session
  app.post("/api/sessions", async (req: Request, res: Response) => {
    try {
      const sessionId = req.body.sessionId || generateSessionId();
      
      let session = await storage.getAssessmentSession(sessionId);
      if (!session) {
        session = await storage.createAssessmentSession({
          sessionId,
          responses: null,
          analysis: null,
          purposePaths: null,
          salaryData: null
        });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Save questionnaire responses
  app.post("/api/responses", async (req: Request, res: Response) => {
    try {
      const { sessionId, responses } = questionnaireResponseSchema.parse(req.body);
      
      const session = await storage.updateAssessmentSession(sessionId, { responses });
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Response saving error:", error);
      res.status(400).json({ error: "Invalid request data" });
    }
  });

  // Generate AI analysis - Core ikigai analysis endpoint
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const { sessionId, responses } = analysisRequestSchema.parse(req.body);
      
      // TODO: Call Gemini API for analysis (will be implemented in Step 6-7)
      // For now, return mock data to maintain functionality
      const analysisResult = await generateMockAnalysis(responses);
      
      // TODO: Fetch salary data using web search (will be implemented in Step 7)
      const salaryData = await fetchMockSalaryData(analysisResult.purposePaths);
      
      const session = await storage.updateAssessmentSession(sessionId, {
        responses,
        analysis: analysisResult.analysis,
        purposePaths: analysisResult.purposePaths,
        salaryData
      });
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to generate analysis" });
    }
  });

  // TODO: Implement action plan endpoint in Step 8
  // app.post("/api/action-plan", async (req: Request, res: Response) => {
  //   // Will be implemented when Gemini wrapper is ready
  // });
}

/**
 * Generates a unique session identifier
 * @returns Random session ID string
 */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Temporary mock function for analysis generation
 * This will be replaced with actual Gemini API integration in Step 6-7
 * @param responses - User questionnaire responses
 * @returns Mock analysis result
 */
async function generateMockAnalysis(responses: any) {
  // Mock implementation to maintain current functionality
  // This ensures the application doesn't break during refactoring
  return {
    analysis: {
      energy: "Based on your responses, you find energy in creative problem-solving and helping others grow.",
      edge: "Your natural strengths lie in communication, analysis, and building meaningful connections.",
      impact: "You want to make a difference through education, mentorship, and creating positive change.",
      economic: "You value financial stability while prioritizing meaningful work and growth opportunities."
    },
    purposePaths: [
      {
        title: "Product Manager",
        description: "Lead product development and strategy for technology solutions",
        ikigaiAlignment: {
          love: "Creating products that solve real problems",
          goodAt: "Strategic thinking and cross-functional collaboration",
          worldNeeds: "Better technology solutions for everyday challenges",
          pay: "$80K-$150K depending on experience and location"
        },
        actionStrategy: "Build portfolio through side projects, gain PM certification, network with tech professionals"
      },
      {
        title: "UX Designer", 
        description: "Design user-centered experiences for digital products",
        ikigaiAlignment: {
          love: "Crafting intuitive and beautiful user experiences",
          goodAt: "Creative problem-solving and user empathy",
          worldNeeds: "More accessible and user-friendly technology",
          pay: "$65K-$120K depending on experience and location"
        },
        actionStrategy: "Build design portfolio, complete UX bootcamp, practice with real client projects"
      },
      {
        title: "Data Analyst",
        description: "Transform data into actionable business insights",
        ikigaiAlignment: {
          love: "Discovering patterns and insights in complex data",
          goodAt: "Analytical thinking and problem-solving",
          worldNeeds: "Data-driven decision making in organizations",
          pay: "$60K-$110K depending on experience and location"
        },
        actionStrategy: "Learn SQL and Python, complete data analysis projects, obtain relevant certifications"
      }
    ]
  };
}

/**
 * Temporary mock function for salary data fetching
 * This will be replaced with actual web search integration in Step 7
 * @param purposePaths - Generated purpose paths
 * @returns Mock salary data
 */
async function fetchMockSalaryData(purposePaths: any[]) {
  // Mock implementation to maintain current functionality
  return purposePaths.map(path => ({
    title: path.title,
    entryLevel: "Entry level: $45K-$65K",
    midLevel: "Mid level: $65K-$95K", 
    seniorLevel: "Senior level: $95K-$150K+",
    location: "National average (US)",
    sources: [
      "https://glassdoor.com/salaries",
      "https://levels.fyi",
      "https://indeed.com/salaries"
    ]
  }));
}
