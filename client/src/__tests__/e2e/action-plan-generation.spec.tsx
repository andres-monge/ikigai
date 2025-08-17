/**
 * @file action-plan-generation.spec.tsx
 * @description E2E tests for the Action Plan Generation user story
 * 
 * Tests the complete flow from path selection to detailed action plan display
 * as described in section 3.2 of the tech spec.
 */

/* @vitest-environment jsdom */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ActionPlan } from '@/pages/action-plan';
import { renderWithProviders, mockSessionStorage, generateMockSessionId } from './utils/test-helpers';
import { mockActionPlanResponse, mockFullAssessment } from './utils/mock-data';

// Mock the API client
vi.mock('@/lib/queryClient', () => {
  return {
    apiRequest: vi.fn(),
  };
});

// Mock session storage
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage(),
});

// Mock the PDF export utility
vi.mock('@/lib/pdf-export', () => ({
  exportActionPlanToPDF: vi.fn(() => Promise.resolve()),
}));

// Mock the useGetActionPlan hook
vi.mock('@/hooks/use-get-action-plan', () => ({
  useGetActionPlan: vi.fn(),
}));

// Import mocked functions with proper typing
import { apiRequest } from '@/lib/queryClient';
import { useGetActionPlan } from '@/hooks/use-get-action-plan';
const mockApiRequest = vi.mocked(apiRequest);
const mockUseGetActionPlan = vi.mocked(useGetActionPlan);

describe('Action Plan Generation E2E Flow', () => {
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

  describe('Action Plan Display and Structure', () => {
    it('should display detailed action plan with milestones and skills', async () => {
      // Mock the hook to return successful data
      mockUseGetActionPlan.mockReturnValue({
        data: mockActionPlanResponse,
        isLoading: false,
        isError: false,
      });

      const mockOnOpenChat = vi.fn();
      const mockOnStartOver = vi.fn();

      renderWithProviders(
        <ActionPlan 
          language="en"
          sessionId={mockSessionId}
          onOpenChat={mockOnOpenChat}
          onStartOver={mockOnStartOver}
        />
      );

      // Verify action plan has milestones and content
      await waitFor(() => {
        const milestones = screen.getAllByRole('heading');
        expect(milestones.length).toBeGreaterThan(0);
      });

      // Verify some actions or content is present
      const textElements = screen.getAllByText(/week|step|skill|learn|build|develop/i);
      expect(textElements.length).toBeGreaterThan(0);
    });




  });










});