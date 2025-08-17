/**
 * @file purpose-discovery.spec.tsx
 * @description E2E tests for the Purpose Discovery user story
 * 
 * Tests the complete flow from questionnaire submission to purpose path results
 * as described in section 3.1 of the tech spec.
 */

/* @vitest-environment jsdom */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Home } from '@/pages/home';
import { Results } from '@/pages/results';
import { renderWithProviders, mockSessionStorage, generateMockSessionId, typeInTextarea } from './utils/test-helpers';
import { mockQuestionnaireResponses, mockAnalyzeResponse } from './utils/mock-data';

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
  exportToPDF: vi.fn(() => Promise.resolve()),
}));

// Import mocked functions with proper typing
import { apiRequest } from '@/lib/queryClient';
const mockApiRequest = vi.mocked(apiRequest);

describe('Purpose Discovery E2E Flow', () => {
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

  describe('Complete Questionnaire to Results Flow', () => {
    it('should complete the full purpose discovery journey', async () => {
      const user = userEvent.setup();

      // Mock successful API response for assessment analysis
      mockApiRequest.mockResolvedValueOnce(mockAnalyzeResponse);

      // Step 1: Render the Home page with questionnaire
      const { queryClient } = renderWithProviders(
        <Home language="en" sessionId={mockSessionId} />
      );

      // Verify the questionnaire is rendered
      expect(screen.getByText(/Find Your Purpose/i)).toBeInTheDocument();
      expect(screen.getByText(/What activities make you lose track of time/i)).toBeInTheDocument();

      // Step 2: Fill out all questionnaire fields
      // Fill Passions section
      const passionTextarea1 = screen.getByLabelText(/What activities make you lose track of time/i);
      await typeInTextarea(passionTextarea1, mockQuestionnaireResponses.passions[0].answer);

      const passionTextarea2 = screen.getByLabelText(/What topics do you find yourself reading about/i);
      await typeInTextarea(passionTextarea2, mockQuestionnaireResponses.passions[1].answer);

      // Fill Skills section
      const skillTextarea1 = screen.getByLabelText(/What are you naturally good at/i);
      await typeInTextarea(skillTextarea1, mockQuestionnaireResponses.skills[0].answer);

      const skillTextarea2 = screen.getByLabelText(/What skills have you developed/i);
      await typeInTextarea(skillTextarea2, mockQuestionnaireResponses.skills[1].answer);

      // Fill Values section
      const valueTextarea1 = screen.getByLabelText(/What kind of impact do you want to have/i);
      await typeInTextarea(valueTextarea1, mockQuestionnaireResponses.values[0].answer);

      const valueTextarea2 = screen.getByLabelText(/What work environment brings out your best/i);
      await typeInTextarea(valueTextarea2, mockQuestionnaireResponses.values[1].answer);

      // Fill Economic section
      const economicTextarea1 = screen.getByLabelText(/What are your financial goals/i);
      await typeInTextarea(economicTextarea1, mockQuestionnaireResponses.economic[0].answer);

      const economicTextarea2 = screen.getByLabelText(/How important is job security/i);
      await typeInTextarea(economicTextarea2, mockQuestionnaireResponses.economic[1].answer);

      // Step 3: Submit the questionnaire
      const submitButton = screen.getByRole('button', { name: /Find My Purpose/i });
      expect(submitButton).toBeEnabled();
      
      await user.click(submitButton);

      // Step 4: Verify API call was made with correct data
      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: mockSessionId,
            language: 'en',
            responses: expect.objectContaining({
              passions: expect.arrayContaining([
                expect.objectContaining({
                  question: expect.stringMatching(/What activities make you lose track of time/i),
                  answer: mockQuestionnaireResponses.passions[0].answer
                })
              ]),
              skills: expect.arrayContaining([
                expect.objectContaining({
                  answer: mockQuestionnaireResponses.skills[0].answer
                })
              ]),
              values: expect.arrayContaining([
                expect.objectContaining({
                  answer: mockQuestionnaireResponses.values[0].answer
                })
              ]),
              economic: expect.arrayContaining([
                expect.objectContaining({
                  answer: mockQuestionnaireResponses.economic[0].answer
                })
              ])
            })
          })
        });
      });

      // Step 5: Verify navigation to Results page (simulated)
      // In a real e2e test, this would be handled by the router
      // For now, we'll verify the session storage was updated
      await waitFor(() => {
        const storedSession = mockStorage.getItem('session');
        expect(storedSession).toBeTruthy();
        if (storedSession) {
          const parsedSession = JSON.parse(storedSession);
          expect(parsedSession.responses).toEqual(expect.objectContaining({
            passions: expect.any(Array),
            skills: expect.any(Array),
            values: expect.any(Array),
            economic: expect.any(Array)
          }));
        }
      });
    });


  });

  describe('Results Page Display', () => {
    it('should display purpose paths with proper structure', async () => {
      // Set up session storage with mock data
      mockStorage.setItem('session', JSON.stringify(mockAnalyzeResponse));

      const mockOnOpenChat = vi.fn();
      const mockOnStartOver = vi.fn();

      renderWithProviders(
        <Results 
          onOpenChat={mockOnOpenChat}
          onStartOver={mockOnStartOver}
          language="en"
          sessionId={mockSessionId}
        />
      );

      // Verify core drivers summary is displayed
      await waitFor(() => {
        expect(screen.getByText(/What's popping out/i)).toBeInTheDocument();
      });

      // Verify purpose paths are displayed
      await waitFor(() => {
        expect(screen.getByText('Full-Stack Developer at Tech Startup')).toBeInTheDocument();
        expect(screen.getByText('Technical Product Manager')).toBeInTheDocument();
        expect(screen.getByText('Technology Consultant & Trainer')).toBeInTheDocument();
      });

      // Verify ikigai alignment sections are displayed
      expect(screen.getByText(/Perfect match for your love of web development/i)).toBeInTheDocument();
      expect(screen.getByText(/Leverages your JavaScript skills/i)).toBeInTheDocument();

      // Verify salary information is integrated into paths
      expect(screen.getByText(/\$75,000-\$95,000 annually/i)).toBeInTheDocument();

      // Verify action strategy is displayed
      expect(screen.getByText(/Start with modern JavaScript frameworks/i)).toBeInTheDocument();
    });




  });


});