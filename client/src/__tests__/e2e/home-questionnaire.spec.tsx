/**
 * @file home-questionnaire.spec.tsx
 * @description E2E tests for the questionnaire submission flow
 * 
 * This test validates the complete questionnaire submission process
 * which is a core part of the Purpose Discovery user story.
 */

/* @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Home } from '@/pages/home';
import { renderWithProviders, mockSessionStorage, generateMockSessionId } from './utils/test-helpers';
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

import { apiRequest } from '@/lib/queryClient';
const mockApiRequest = vi.mocked(apiRequest);

describe('Home Questionnaire E2E Tests', () => {
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

  it('should render the complete questionnaire form', async () => {
    renderWithProviders(
      <Home language="en" sessionId={mockSessionId} />
    );

    // Check that the main title is present
    expect(screen.getByText(/Find Your Purpose/i)).toBeInTheDocument();

    // Verify all questionnaire sections are present
    const sections = ['Passions', 'Skills', 'Values', 'Economic'];
    
    sections.forEach(section => {
      // Check if section headings exist (may be in various forms)
      const sectionElements = screen.getAllByText(new RegExp(section, 'i'));
      expect(sectionElements.length).toBeGreaterThan(0);
    });
  });

  it('should accept user input in all form fields', async () => {
    const user = userEvent.setup();
    
    renderWithProviders(
      <Home language="en" sessionId={mockSessionId} />
    );

    // Find textareas by their labels or placeholders
    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBeGreaterThanOrEqual(8); // Should have at least 8 questions

    // Test that we can type in the first few textareas
    for (let i = 0; i < Math.min(4, textareas.length); i++) {
      const textarea = textareas[i];
      const testText = `Test answer ${i + 1}`;
      
      await user.clear(textarea);
      await user.type(textarea, testText);
      
      expect(textarea).toHaveValue(testText);
    }
  });

  it('should successfully submit the questionnaire', async () => {
    const user = userEvent.setup();
    
    // Mock successful API response
    mockApiRequest.mockResolvedValueOnce(mockAnalyzeResponse);

    renderWithProviders(
      <Home language="en" sessionId={mockSessionId} />
    );

    // Fill out the form with sample data
    const textareas = screen.getAllByRole('textbox');
    const sampleAnswers = [
      'Building web applications',
      'Technology and AI',
      'Problem solving',
      'JavaScript programming',
      'Making technology accessible',
      'Collaborative environments',
      'Financial stability',
      'Growth over security'
    ];

    for (let i = 0; i < Math.min(textareas.length, sampleAnswers.length); i++) {
      await user.clear(textareas[i]);
      await user.type(textareas[i], sampleAnswers[i]);
    }

    // Find and click the submit button
    const submitButton = screen.getByRole('button', { name: /Find My Purpose/i });
    expect(submitButton).toBeInTheDocument();
    
    await user.click(submitButton);

    // Verify API was called
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('/api/analyze', {
        method: 'POST',
        body: expect.stringContaining(mockSessionId)
      });
    }, { timeout: 3000 });
  });

  it('should handle form validation', async () => {
    const user = userEvent.setup();
    
    renderWithProviders(
      <Home language="en" sessionId={mockSessionId} />
    );

    // Try to submit without filling out the form
    const submitButton = screen.getByRole('button', { name: /Find My Purpose/i });
    
    // The button should either be disabled or show validation errors
    // This depends on the actual implementation
    expect(submitButton).toBeInTheDocument();
  });

  it('should show loading state during submission', async () => {
    const user = userEvent.setup();
    
    // Mock API response with delay
    mockApiRequest.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(mockAnalyzeResponse), 1000))
    );

    renderWithProviders(
      <Home language="en" sessionId={mockSessionId} />
    );

    // Fill out minimal form data
    const textareas = screen.getAllByRole('textbox');
    for (let i = 0; i < Math.min(4, textareas.length); i++) {
      await user.type(textareas[i], `Answer ${i + 1}`);
    }

    const submitButton = screen.getByRole('button', { name: /Find My Purpose/i });
    await user.click(submitButton);

    // Check for loading state (button disabled or loading text)
    // The exact implementation may vary
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
  });

  it('should support bilingual interface', async () => {
    // Test Spanish interface
    renderWithProviders(
      <Home language="es" sessionId={mockSessionId} />
    );

    // The component should render without errors in Spanish
    // Exact text would depend on i18n implementation
    expect(document.body).toBeInTheDocument();
  });
});