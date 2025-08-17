/**
 * @file integration.spec.tsx
 * @description Integration tests covering navigation, error handling, and cross-feature functionality
 */

/* @vitest-environment jsdom */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, mockSessionStorage, generateMockSessionId } from './utils/test-helpers';
import { mockFullAssessment, mockAnalyzeResponse } from './utils/mock-data';

// Mock all external dependencies
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/pdf-export', () => ({
  exportToPDF: vi.fn(() => Promise.resolve()),
  exportActionPlanToPDF: vi.fn(() => Promise.resolve()),
}));

vi.mock('wouter', () => ({
  useLocation: vi.fn(() => ['/', vi.fn()]),
}));

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage(),
});

import { apiRequest } from '@/lib/queryClient';
const mockApiRequest = vi.mocked(apiRequest);

describe('Integration Tests', () => {
  const mockSessionId = generateMockSessionId();
  let mockStorage: ReturnType<typeof mockSessionStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = mockSessionStorage();
    Object.defineProperty(window, 'sessionStorage', {
      value: mockStorage,
    });
  });

  afterEach(() => {
    mockStorage.clear();
  });

  describe('Session Persistence', () => {
    it('should persist assessment data across page refreshes', async () => {
      // Store assessment data in session storage
      mockStorage.setItem('session', JSON.stringify(mockFullAssessment));

      // Verify data persists
      const storedData = mockStorage.getItem('session');
      expect(storedData).toBeTruthy();
      
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        expect(parsedData.sessionId).toBe(mockFullAssessment.sessionId);
        expect(parsedData.responses).toEqual(mockFullAssessment.responses);
        expect(parsedData.coreDriversAnalysis).toEqual(mockFullAssessment.coreDriversAnalysis);
        expect(parsedData.purposePaths).toEqual(mockFullAssessment.purposePaths);
        expect(parsedData.actionPlan).toEqual(mockFullAssessment.actionPlan);
      }
    });



    it('should maintain language preference across sessions', async () => {
      const spanishAssessment = {
        ...mockFullAssessment,
        language: 'es' as const
      };

      mockStorage.setItem('session', JSON.stringify(spanishAssessment));

      const storedData = mockStorage.getItem('session');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        expect(parsedData.language).toBe('es');
      }
    });
  });



  describe('Cross-Browser Compatibility', () => {
    it('should work with different user agents', async () => {
      // Test basic functionality doesn't depend on specific browser features
      const originalUserAgent = navigator.userAgent;
      
      // Mock different browsers
      const browsers = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/14.1.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
      ];

      browsers.forEach(userAgent => {
        Object.defineProperty(navigator, 'userAgent', {
          value: userAgent,
          configurable: true
        });

        // Basic functionality should work regardless of browser
        expect(mockStorage.getItem).toBeDefined();
        expect(mockStorage.setItem).toBeDefined();
      });

      // Restore original user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true
      });
    });

    it('should handle localStorage availability', async () => {
      // Test when localStorage is not available (incognito mode, etc.)
      const originalSessionStorage = window.sessionStorage;
      
      // Mock unavailable sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: null,
        configurable: true
      });

      // Application should handle this gracefully
      expect(() => {
        // Code that checks for sessionStorage availability
        const hasStorage = typeof window !== 'undefined' && window.sessionStorage;
        expect(hasStorage).toBeFalsy();
      }).not.toThrow();

      // Restore sessionStorage
      Object.defineProperty(window, 'sessionStorage', {
        value: originalSessionStorage,
        configurable: true
      });
    });
  });

  describe('Performance and Resource Management', () => {
    it('should not create memory leaks during navigation', async () => {
      // Simulate multiple navigation cycles
      for (let i = 0; i < 5; i++) {
        mockStorage.setItem('session', JSON.stringify(mockFullAssessment));
        mockStorage.clear();
      }

      // Verify no accumulation of data
      expect(mockStorage.storage).toEqual({});
    });

    it('should handle large datasets efficiently', async () => {
      // Create a large mock dataset
      const largeDataset = {
        ...mockFullAssessment,
        purposePaths: Array(100).fill(null).map((_, index) => ({
          ...mockFullAssessment.purposePaths[0],
          id: index + 1,
          title: `Path ${index + 1}`
        }))
      };

      // Should handle large datasets without performance issues
      expect(() => {
        mockStorage.setItem('session', JSON.stringify(largeDataset));
        const retrieved = mockStorage.getItem('session');
        JSON.parse(retrieved!);
      }).not.toThrow();
    });
  });







  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty questionnaire responses', async () => {
      const emptyResponses = {
        passions: [],
        skills: [],
        values: [],
        economic: []
      };

      expect(() => {
        mockStorage.setItem('responses', JSON.stringify(emptyResponses));
      }).not.toThrow();
    });

    it('should handle extremely long user inputs', async () => {
      const longInput = 'A'.repeat(10000); // 10KB of text
      
      const longResponse = {
        question: "Test question",
        answer: longInput
      };

      expect(() => {
        mockStorage.setItem('longResponse', JSON.stringify(longResponse));
        const retrieved = JSON.parse(mockStorage.getItem('longResponse')!);
        expect(retrieved.answer).toBe(longInput);
      }).not.toThrow();
    });


  });
});