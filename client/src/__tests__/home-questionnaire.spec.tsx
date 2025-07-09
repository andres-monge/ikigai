/* @vitest-environment jsdom */

// Home questionnaire smoke test – verifies that the inline single-page form
// renders, accepts user input, shows a loading overlay, and navigates to
// `/results` on successful submission.

import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  render,
  fireEvent,
  waitFor,
  screen,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// (jest-dom matchers are not installed; using basic truthy assertions instead)
// Component under test
import { Home } from '@/pages/home';
import type { FullAssessment } from '@/types/assessment';

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Stub `wouter` navigation so we can assert `navigate('/results')`.
// ─────────────────────────────────────────────────────────────────────────────
const navigateMock = vi.fn();
vi.mock('wouter', async () => {
  // We intentionally only mock `useLocation`; other exports fall back to the
  // real implementation (if ever imported elsewhere).
  return {
    // `useLocation` returns a tuple: [currentPathname, navigateFn]
    useLocation: () => ['', navigateMock],
  } as unknown;
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Stub `useCreateAssessment` so no real network request is made.
//    The stub sets `isPending` to `true` immediately so the LoadingOverlay
//    becomes visible, then triggers `onSuccess` on the next micro-task.
// ─────────────────────────────────────────────────────────────────────────────
const mockAssessment: FullAssessment = {
  id: 1,
  sessionId: 'session-123',
  language: 'en',
  responses: null,
  coreDriversAnalysis: null,
  chosenPathId: null,
  actionPlan: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  purposePaths: [],
};

vi.mock('@/hooks/use-create-assessment', () => {
  // Import React inside the factory so we can use hooks safely.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    useCreateAssessment: ({
      onSuccess,
    }: {
      onSuccess?: (data: FullAssessment) => void;
    }) => {
      const [isPending, setIsPending] = React.useState(false);
      const createAssessment = () => {
        setIsPending(true);
        // Simulate async backend + AI processing.
        Promise.resolve().then(() => {
          onSuccess?.(mockAssessment);
        });
      };
      return { createAssessment, isPending } as const;
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Helper – React-Query Provider                                               */
/* -------------------------------------------------------------------------- */
function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('Home inline questionnaire flow', () => {
  it('fills the form, shows loader and navigates to /results', async () => {
    render(withQueryClient(<Home language="en" sessionId="session-123" />));

    // 1. Fill all eight textareas.
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(8);
    textboxes.forEach((tb, idx) => {
      fireEvent.change(tb, {
        target: { value: `Sample answer ${idx + 1}` },
      });
    });

    // 2. Submit the form.
    fireEvent.click(
      screen.getByRole('button', { name: /complete assessment/i }),
    );

    // 3. The loading overlay should appear.
    const overlayHeading = await screen.findByText(/Nami is thinking/i);
    expect(overlayHeading).toBeTruthy();

    // 4. Eventually the app should navigate to the results page.
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/results');
    });
  });
}); 