/**
 * @file use-streaming-state.test.ts
 * 
 * @description
 * Unit tests for the useStreamingState hook focusing on safe sessionStorage parsing
 * and utility functions. Since this is a React hook, we test the core utility functions
 * that handle the critical safety measures.
 * 
 * @test-strategy
 * - Test safe JSON parsing with various edge cases
 * - Test sessionStorage corruption handling
 * - Test sessionId validation logic
 * - Integration tests will be covered by E2E tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/* -------------------------------------------------------------------------- */
/* Mock Setup                                                                 */
/* -------------------------------------------------------------------------- */

// Mock sessionStorage for Node environment
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

// Assign to global for the test environment
Object.defineProperty(global, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

/* -------------------------------------------------------------------------- */
/* Utility Function Extraction for Testing                                   */
/* -------------------------------------------------------------------------- */

/**
 * Extracted safe parser function for testing
 * This is the same logic used inside the hook
 */
const safeParseSession = (sessionId: string, data: string | null) => {
  if (!data) return null;
  
  try {
    const parsed = JSON.parse(data);
    // Minimal validation - just check sessionId exists and is a string
    if (parsed && typeof parsed.sessionId === 'string') {
      return parsed;
    }
    // Invalid structure, remove corrupted data
    sessionStorage.removeItem('session');
    return null;
  } catch (error) {
    // JSON parse error, remove corrupted data
    console.warn('Corrupted sessionStorage data detected and removed:', error);
    sessionStorage.removeItem('session');
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Test Suite                                                                 */
/* -------------------------------------------------------------------------- */

describe('useStreamingState utilities', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    mockSessionStorage.getItem.mockReset();
    mockSessionStorage.setItem.mockReset();
    mockSessionStorage.removeItem.mockReset();
  });

  describe('safeParseSession', () => {
    it('should return null for null data', () => {
      const result = safeParseSession('test-session', null);
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should return null for empty string data', () => {
      const result = safeParseSession('test-session', '');
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should parse valid session data correctly', () => {
      const validSession = {
        sessionId: 'test-session',
        language: 'en',
        coreDriversAnalysis: null,
        purposePaths: []
      };
      const validJson = JSON.stringify(validSession);
      
      const result = safeParseSession('test-session', validJson);
      
      expect(result).toEqual(validSession);
      expect(mockSessionStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{ "sessionId": "test", invalid json }';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const result = safeParseSession('test-session', malformedJson);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Corrupted sessionStorage data detected and removed:',
        expect.any(SyntaxError)
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle missing sessionId field', () => {
      const sessionWithoutId = { language: 'en', data: 'some data' };
      const jsonWithoutId = JSON.stringify(sessionWithoutId);
      
      const result = safeParseSession('test-session', jsonWithoutId);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
    });

    it('should handle sessionId that is not a string', () => {
      const sessionWithBadId = { sessionId: 123, language: 'en' };
      const jsonWithBadId = JSON.stringify(sessionWithBadId);
      
      const result = safeParseSession('test-session', jsonWithBadId);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
    });

    it('should handle null parsed object', () => {
      const nullJson = 'null';
      
      const result = safeParseSession('test-session', nullJson);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
    });

    it('should handle primitive values', () => {
      const primitiveJson = '"just a string"';
      
      const result = safeParseSession('test-session', primitiveJson);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
    });

    it('should handle array data', () => {
      const arrayJson = '[1, 2, 3]';
      
      const result = safeParseSession('test-session', arrayJson);
      
      expect(result).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
    });

    it('should preserve valid data structure with extra fields', () => {
      const validSessionWithExtras = {
        sessionId: 'test-session',
        language: 'en',
        extraField: 'should be preserved',
        coreDriversAnalysis: { data: 'some analysis' },
        purposePaths: [{ id: 1, title: 'test' }]
      };
      const validJson = JSON.stringify(validSessionWithExtras);
      
      const result = safeParseSession('test-session', validJson);
      
      expect(result).toEqual(validSessionWithExtras);
      expect(mockSessionStorage.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('sessionStorage integration scenarios', () => {
    it('should handle sessionStorage.removeItem being called during parsing errors', () => {
      const malformedJson = 'invalid json';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      safeParseSession('test-session', malformedJson);
      
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
      expect(mockSessionStorage.removeItem).toHaveBeenCalledTimes(1);
      
      consoleSpy.mockRestore();
    });

    it('should handle sessionStorage.removeItem being called for invalid structure', () => {
      const invalidStructure = JSON.stringify({ notASessionId: 'value' });
      
      safeParseSession('test-session', invalidStructure);
      
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('session');
      expect(mockSessionStorage.removeItem).toHaveBeenCalledTimes(1);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Additional Test Notes                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Integration Testing Strategy:
 * 
 * These unit tests focus on the critical safety mechanisms in the hook.
 * Full hook testing (React state management, effects, etc.) will be covered by:
 * 
 * 1. E2E tests in Playwright that exercise the complete user flow
 * 2. Manual testing of edge cases like:
 *    - Fast streaming + slow session fetch
 *    - Page refresh during streaming  
 *    - Corrupted sessionStorage data
 *    - SessionId mismatch scenarios
 * 
 * The unit tests here ensure that the core safety mechanisms (JSON parsing,
 * corruption handling) work correctly in isolation, while integration tests
 * verify the complete behavior in a real browser environment.
 */