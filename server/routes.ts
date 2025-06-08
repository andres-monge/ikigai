import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  questionnaireResponseSchema,
  chatRequestSchema,
  analysisRequestSchema,
  insertChatMessageSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Create or get assessment session
  app.post("/api/sessions", async (req, res) => {
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
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Save questionnaire responses
  app.post("/api/responses", async (req, res) => {
    try {
      const { sessionId, responses } = questionnaireResponseSchema.parse(req.body);
      
      const session = await storage.updateAssessmentSession(sessionId, { responses });
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json(session);
    } catch (error) {
      res.status(400).json({ error: "Invalid request data" });
    }
  });

  // Generate AI analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { sessionId, responses } = analysisRequestSchema.parse(req.body);
      
      // Call Gemini API for analysis
      const analysisResult = await generateAnalysis(responses);
      
      // Fetch salary data
      const salaryData = await fetchSalaryData(analysisResult.purposePaths);
      
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

  // Get chat messages
  app.get("/api/chat/:sessionId", async (req, res) => {
    try {
      const messages = await storage.getChatMessages(req.params.sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to get chat messages" });
    }
  });

  // Send chat message
  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message } = chatRequestSchema.parse(req.body);
      
      // Save user message
      await storage.createChatMessage({
        sessionId,
        role: "user",
        content: message,
        timestamp: new Date().toISOString()
      });
      
      // Get AI response
      const aiResponse = await getChatResponse(sessionId, message);
      
      // Save AI response
      const aiMessage = await storage.createChatMessage({
        sessionId,
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toISOString()
      });
      
      res.json(aiMessage);
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function generateAnalysis(responses: any) {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "models/gemini-2.5-flash-preview-05-20";
  
  if (!geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  const prompt = `
You are Nami, an AI career guide inspired by Paul Graham's wisdom and stoic principles. Analyze the following questionnaire responses and provide:

1. Core Drivers Summary (Energy, Edge, Impact, Economic Reality)
2. Three distinct Purpose Paths aligned with ikigai principles

User Responses: ${JSON.stringify(responses)}

Please respond in JSON format with:
{
  "analysis": {
    "energy": "What the user loves - detailed analysis",
    "edge": "What the user is good at - detailed analysis", 
    "impact": "What the world needs - detailed analysis",
    "economic": "Economic reality - detailed analysis"
  },
  "purposePaths": [
    {
      "title": "Career Path Title",
      "description": "Brief description",
      "ikigaiAlignment": {
        "love": "How it aligns with what they love",
        "goodAt": "How it aligns with what they're good at",
        "worldNeeds": "How it meets world needs",
        "pay": "Salary range estimate"
      },
      "actionStrategy": "Detailed step-by-step action plan"
    }
  ]
}
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      throw new Error("No content received from Gemini API");
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from Gemini response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

async function fetchSalaryData(purposePaths: any[]) {
  // In a real implementation, this would use web search APIs to get current salary data
  // For now, return structured salary data based on the career paths
  return purposePaths.map(path => ({
    title: path.title,
    entryLevel: "Entry level salary range",
    midLevel: "Mid level salary range", 
    seniorLevel: "Senior level salary range",
    location: "Geographic location",
    sources: [
      "https://glassdoor.com/salaries",
      "https://levels.fyi",
      "https://indeed.com/salaries"
    ]
  }));
}

async function getChatResponse(sessionId: string, message: string): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "models/gemini-2.5-flash-preview-05-20";
  
  if (!geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  // Get session context
  const session = await storage.getAssessmentSession(sessionId);
  const chatHistory = await storage.getChatMessages(sessionId);

  const systemPrompt = `You are Nami, an AI career guide with a personality inspired by Paul Graham's essays and stoic principles. You are encouraging, wise, and action-oriented. 

You are helping users refine their ikigai analysis and career paths. The user has completed an assessment and received their results.

User's Analysis: ${JSON.stringify(session?.analysis || {})}
User's Purpose Paths: ${JSON.stringify(session?.purposePaths || [])}

Previous conversation:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Respond helpfully to the user's question: ${message}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response right now. Please try again.";
  } catch (error) {
    console.error("Chat response error:", error);
    return "I'm experiencing some technical difficulties. Please try again in a moment.";
  }
}
