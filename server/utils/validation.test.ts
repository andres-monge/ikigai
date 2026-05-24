/**
 * @description
 * Comprehensive unit tests for runtime input validation utilities.
 * 
 * These tests ensure our validation functions properly handle:
 * - Valid inputs (happy path)
 * - Invalid structure and types
 * - Missing required fields
 * - Edge cases like empty arrays and null values
 * - Error message clarity and debugging information
 * 
 * Critical for preventing malformed data from reaching expensive AI operations.
 */

import { describe, it, expect } from 'vitest';
import { 
  validateQuestionnaireResponses, 
  validateSessionForAI, 
  validateSessionForActionPlan 
} from './validation';
import { ValidationError } from './errors';
import type { HydratedAssessmentSession, QuestionnaireResponses } from '../storage';

/* ------------------------------------------------------------------ */
/*                         Test Data Fixtures                        */
/* ------------------------------------------------------------------ */

const validQuestionnaireResponses: QuestionnaireResponses = {
  passions: [
    { question: "What activities make you lose track of time?", answer: "Building web applications" },
    { question: "What energizes you most?", answer: "Solving complex problems" }
  ],
  skills: [
    { question: "What are you naturally good at?", answer: "Software development" },
    { question: "What do others ask for your help with?", answer: "Technical architecture" }
  ],
  values: [
    { question: "What principles guide your decisions?", answer: "Clean code and user experience" },
    { question: "What kind of impact do you want to make?", answer: "Better software for everyone" }
  ],
  economic: [
    { question: "How do you prefer to earn money?", answer: "Through software consulting" },
    { question: "What financial goals motivate you?", answer: "Financial independence" }
  ]
};

const validCoreDriversAnalysis = {
  statementSentence: "You are driven by the desire to create meaningful software that solves real problems.",
  coreThreads: "Key themes: Problem-solving, technical excellence, user impact, continuous learning."
};

const validPurposePaths = [
  {
    id: 1,
    assessmentId: 1,
    title: "Senior Full-Stack Developer",
    description: "Lead development of complex web applications with focus on user experience.",
    ikigaiAlignment: {
      love: "Building elegant user interfaces",
      goodAt: "Full-stack development and architecture", 
      meaning: "Better software experiences",
      pay: "$120,000-$150,000 annually with consulting opportunities"
    },
    actionStrategy: "Focus on mastering modern frameworks and building a portfolio of impactful projects."
  }
];

const createValidSession = (overrides: Partial<HydratedAssessmentSession> = {}): HydratedAssessmentSession => ({
  id: 1,
  sessionId: 'test-session-123',
  language: 'en' as const,
  responses: validQuestionnaireResponses,
  coreDriversAnalysis: validCoreDriversAnalysis,
  chosenPathId: null,
  actionPlan: null,
  purposePaths: validPurposePaths,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

/* ------------------------------------------------------------------ */
/*                    validateQuestionnaireResponses Tests           */
/* ------------------------------------------------------------------ */

describe('validateQuestionnaireResponses', () => {
  it('should validate correct questionnaire responses structure', () => {
    const result = validateQuestionnaireResponses(validQuestionnaireResponses);
    expect(result).toEqual(validQuestionnaireResponses);
  });

  it('should throw ValidationError when responses is null', () => {
    expect(() => validateQuestionnaireResponses(null)).toThrow(ValidationError);
    
    try {
      validateQuestionnaireResponses(null);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Questionnaire responses are required before AI processing");
      expect((error as ValidationError).details.field).toBe("responses");
      expect((error as ValidationError).details.received).toBe(null);
    }
  });

  it('should throw ValidationError when responses is undefined', () => {
    expect(() => validateQuestionnaireResponses(undefined)).toThrow(ValidationError);
    
    try {
      validateQuestionnaireResponses(undefined);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Questionnaire responses are required before AI processing");
    }
  });

  it('should throw ValidationError when responses is not an object', () => {
    expect(() => validateQuestionnaireResponses("invalid")).toThrow(ValidationError);
    expect(() => validateQuestionnaireResponses(123)).toThrow(ValidationError);
    expect(() => validateQuestionnaireResponses([])).toThrow(ValidationError);
  });

  it('should throw ValidationError when required categories are missing', () => {
    const incompleteResponses = {
      passions: validQuestionnaireResponses.passions,
      skills: validQuestionnaireResponses.skills
      // Missing values and economic
    };

    expect(() => validateQuestionnaireResponses(incompleteResponses)).toThrow(ValidationError);
    
    try {
      validateQuestionnaireResponses(incompleteResponses);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Missing required questionnaire sections");
    }
  });

  it('should throw ValidationError when categories are empty arrays', () => {
    const emptyResponses = {
      passions: [],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    expect(() => validateQuestionnaireResponses(emptyResponses)).toThrow(ValidationError);
  });

  it('should throw ValidationError when question-answer pairs are malformed', () => {
    const malformedResponses = {
      passions: [
        { question: "", answer: "Building web applications" }, // Empty question
        { question: "What energizes you most?", answer: "" } // Empty answer
      ],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    expect(() => validateQuestionnaireResponses(malformedResponses)).toThrow(ValidationError);
  });

  it('should throw ValidationError when question-answer pairs have wrong structure', () => {
    const wrongStructure = {
      passions: [
        { question: "What do you love?", answer: "Coding", extra: "field" }, // Extra field is OK
        { answer: "Building apps" } // Missing question field
      ],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    expect(() => validateQuestionnaireResponses(wrongStructure)).toThrow(ValidationError);
  });

  it('should include detailed validation errors in the details field', () => {
    try {
      validateQuestionnaireResponses({ invalid: "structure" });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      expect(validationError.details.validationErrors).toBeDefined();
      expect(Array.isArray(validationError.details.validationErrors)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*                       validateSessionForAI Tests                  */
/* ------------------------------------------------------------------ */

describe('validateSessionForAI', () => {
  it('should validate a complete valid session', () => {
    const session = createValidSession();
    expect(() => validateSessionForAI(session)).not.toThrow();
  });

  it('should throw ValidationError when language is missing', () => {
    const session = createValidSession({ language: undefined as any });
    
    expect(() => validateSessionForAI(session)).toThrow(ValidationError);
    
    try {
      validateSessionForAI(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session language is required before AI processing");
      expect((error as ValidationError).details.field).toBe("language");
    }
  });

  it('should throw ValidationError when language is null', () => {
    const session = createValidSession({ language: null as any });
    expect(() => validateSessionForAI(session)).toThrow(ValidationError);
  });

  it('should throw ValidationError when language is invalid', () => {
    const session = createValidSession({ language: 'fr' as any });
    
    expect(() => validateSessionForAI(session)).toThrow(ValidationError);
    
    try {
      validateSessionForAI(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session language must be 'en' or 'es'");
      expect((error as ValidationError).details.received).toBe('fr');
    }
  });

  it('should validate when language is en', () => {
    const session = createValidSession({ language: 'en' });
    expect(() => validateSessionForAI(session)).not.toThrow();
  });

  it('should validate when language is es', () => {
    const session = createValidSession({ language: 'es' });
    expect(() => validateSessionForAI(session)).not.toThrow();
  });

  it('should throw ValidationError when responses are invalid', () => {
    const session = createValidSession({ responses: null as any });
    
    expect(() => validateSessionForAI(session)).toThrow(ValidationError);
    
    try {
      validateSessionForAI(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Questionnaire responses are required before AI processing");
    }
  });

  it('should handle complex response validation errors', () => {
    const session = createValidSession({ 
      responses: { passions: [] } as any // Invalid: empty array
    });
    
    expect(() => validateSessionForAI(session)).toThrow(ValidationError);
  });
});

/* ------------------------------------------------------------------ */
/*                   validateSessionForActionPlan Tests              */
/* ------------------------------------------------------------------ */

describe('validateSessionForActionPlan', () => {
  it('should validate a complete session ready for action plan generation', () => {
    const session = createValidSession();
    expect(() => validateSessionForActionPlan(session)).not.toThrow();
  });

  it('should throw ValidationError when basic AI validation fails', () => {
    const session = createValidSession({ language: 'invalid' as any });
    
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
    
    try {
      validateSessionForActionPlan(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session language must be 'en' or 'es'");
    }
  });

  it('should throw ValidationError when purposePaths is missing', () => {
    const session = createValidSession({ purposePaths: undefined as any });
    
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
    
    try {
      validateSessionForActionPlan(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session must have purpose paths before generating action plan");
      expect((error as ValidationError).details.field).toBe("purposePaths");
    }
  });

  it('should throw ValidationError when purposePaths is null', () => {
    const session = createValidSession({ purposePaths: null as any });
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
  });

  it('should throw ValidationError when purposePaths is empty array', () => {
    const session = createValidSession({ purposePaths: [] });
    
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
    
    try {
      validateSessionForActionPlan(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session must have purpose paths before generating action plan");
      expect((error as ValidationError).details.received).toBe(0);
    }
  });

  it('should throw ValidationError when coreDriversAnalysis is missing', () => {
    const session = createValidSession({ coreDriversAnalysis: undefined as any });
    
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
    
    try {
      validateSessionForActionPlan(session);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Session must have core drivers analysis before generating action plan");
      expect((error as ValidationError).details.field).toBe("coreDriversAnalysis");
    }
  });

  it('should throw ValidationError when coreDriversAnalysis is null', () => {
    const session = createValidSession({ coreDriversAnalysis: null });
    expect(() => validateSessionForActionPlan(session)).toThrow(ValidationError);
  });

  it('should validate with multiple purpose paths', () => {
    const session = createValidSession({ 
      purposePaths: [
        ...validPurposePaths,
        { ...validPurposePaths[0], id: 2, title: "Technical Architect" },
        { ...validPurposePaths[0], id: 3, title: "Product Engineering Lead" }
      ]
    });
    
    expect(() => validateSessionForActionPlan(session)).not.toThrow();
  });

  it('should validate with complex coreDriversAnalysis structure', () => {
    const session = createValidSession({
      coreDriversAnalysis: {
        statementSentence: "Complex analysis statement",
        coreThreads: "Multiple themes and patterns",
        additionalField: "Should be allowed", // Extra fields are OK
        nestedData: {
          confidence: 0.95,
          categories: ["technical", "creative"]
        }
      }
    });
    
    expect(() => validateSessionForActionPlan(session)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*                       Error Object Structure Tests                */
/* ------------------------------------------------------------------ */

describe('ValidationError structure and formatting', () => {
  it('should create ValidationError with proper structure', () => {
    try {
      validateQuestionnaireResponses(null);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validationError = error as ValidationError;
      
      // Check error properties
      expect(validationError.name).toBe('ValidationError');
      expect(validationError.code).toBe('VALIDATION_ERROR');
      expect(validationError.message).toContain('required before AI processing');
      expect(validationError.details).toBeDefined();
      expect(validationError.details.field).toBeDefined();
      expect(validationError.details.received).toBeDefined();
      expect(validationError.details.expected).toBeDefined();
    }
  });

  it('should include session ID when provided in validation context', () => {
    const session = createValidSession({ responses: null as any });
    
    try {
      validateSessionForAI(session);
    } catch (error) {
      const validationError = error as ValidationError;
      expect(validationError.sessionId).toBe('test-session-123');
    }
  });

  it('should format error responses properly for API consumption', () => {
    try {
      validateQuestionnaireResponses("invalid");
    } catch (error) {
      const validationError = error as ValidationError;
      const response = validationError.toResponse();
      
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.error).toBe(validationError.message);
      
      // In test mode, should include details
      if (validationError.isTestMode) {
        expect(response).toHaveProperty('details');
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*                         Edge Case Tests                           */
/* ------------------------------------------------------------------ */

describe('Edge cases and boundary conditions', () => {
  it('should handle deeply nested invalid structures', () => {
    const deeplyNested = {
      passions: [
        {
          question: "Valid question",
          answer: {
            nested: {
              invalid: "structure"
            }
          }
        }
      ],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    expect(() => validateQuestionnaireResponses(deeplyNested)).toThrow(ValidationError);
  });

  it('should handle very long strings in responses', () => {
    const longString = "a".repeat(10000);
    const responsesWithLongStrings = {
      passions: [
        { question: longString, answer: longString }
      ],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    // Should validate successfully - no length restrictions
    expect(() => validateQuestionnaireResponses(responsesWithLongStrings)).not.toThrow();
  });

  it('should handle unicode and special characters', () => {
    const unicodeResponses = {
      passions: [
        { question: "¿Qué te apasiona? 🚀", answer: "Programación y 日本語" }
      ],
      skills: [
        { question: "Skills with émojis 💻", answer: "JavaScript & TypeScript ⚡" }
      ],
      values: [
        { question: "Values question", answer: "Creating accessible software for everyone" }
      ],
      economic: [
        { question: "Economic question", answer: "Sustainable income through tech" }
      ]
    };

    expect(() => validateQuestionnaireResponses(unicodeResponses)).not.toThrow();
  });

  it('should accept whitespace-only strings as valid (per current schema)', () => {
    const whitespaceResponses = {
      passions: [
        { question: "   ", answer: "Valid answer" }
      ],
      skills: validQuestionnaireResponses.skills,
      values: validQuestionnaireResponses.values,
      economic: validQuestionnaireResponses.economic
    };

    // Current schema allows whitespace-only strings via .min(1)
    expect(() => validateQuestionnaireResponses(whitespaceResponses)).not.toThrow();
  });
});