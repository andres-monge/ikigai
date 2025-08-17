/*
 * @file use-create-action-plan.test.tsx
 *
 * Unit tests for the `useCreateActionPlan` React-Query hook. The goal is to
 * verify that the hook:
 *   1. Calls the underlying `apiRequest` helper with the right HTTP method,
 *      endpoint and payload.
 *   2. Invokes the provided `onSuccess` callback with the JSON-parsed response
 *      from the mocked API request.
 *
 * The hook itself contains no DOM logic, but React-Query requires a React
 * context.  We therefore render the hook with Testing-Library's `renderHook`
 * utility and wrap it in a `QueryClientProvider`.
 *
 * The environment is set to **jsdom** to satisfy React's expectations even
 * though we never touch the DOM in this test suite.
 */

/* @vitest-environment jsdom */

import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';

// ————————————————————————————————————————————————————————————————
// Test Subject & Mocks
// ————————————————————————————————————————————————————————————————

import { useCreateActionPlan } from '../use-create-action-plan';

// Mock the `apiRequest` helper so no real network request is ever made.
vi.mock('@/lib/queryClient', () => {
  return {
    apiRequest: vi.fn(),
  };
});

// Import the mocked helper with typed access.
import { apiRequest } from '@/lib/queryClient';

// ————————————————————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————————————————————

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // React-Query requires a provider in the component tree.
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ————————————————————————————————————————————————————————————————
// Tests
// ————————————————————————————————————————————————————————————————

describe('useCreateActionPlan', () => {
  it('triggers onSuccess with the JSON payload returned by apiRequest', async () => {
    const sessionId = 'session-123';
    const chosenPathId = 42;

    // Mocked payload returned from the backend.
    const mockedResponsePayload = {
      id: 1,
      sessionId,
      language: 'en',
      responses: null,
      coreDriversAnalysis: null,
      chosenPathId,
      actionPlan: {
        milestones: [
          {
            title: 'Kick-off Project',
            timeline: 'Week 1',
            actions: ['Set up development environment', 'Create repo'],
            skills: [
              {
                skill: 'React',
                youtubeLinks: [
                  {
                    title: 'React Tutorial for Beginners',
                    url: 'https://www.youtube.com/watch?v=dGcsHMXbSOA',
                    thumbnailUrl: 'https://img.youtube.com/vi/dGcsHMXbSOA/mqdefault.jpg',
                  },
                ],
              },
            ],
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      purposePaths: [],
    } as const;

    // A minimal mock that matches the subset of the Fetch `Response` interface
    // consumed by the hook: includes status, ok, and json() method.
    const mockedFetchResponse = {
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(mockedResponsePayload),
    } as unknown as Response;

    // Configure the mocked helper to resolve with the fake response when called.
    (apiRequest as any).mockResolvedValue(mockedFetchResponse);

    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useCreateActionPlan({
          sessionId,
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    // Act: trigger the mutation.
    act(() => {
      result.current.createActionPlan(chosenPathId);
    });

    // Assert: wait until the callback is fired with the expected data.
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockedResponsePayload);
    });

    // Also verify that the helper was called with the correct params.
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/action-plan', {
      sessionId,
      chosenPathId,
    });
  });
}); 