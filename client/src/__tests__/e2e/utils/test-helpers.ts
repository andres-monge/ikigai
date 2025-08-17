/**
 * @file test-helpers.ts
 * @description Utility functions and helpers for e2e testing
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import React from 'react';

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  }

  return { 
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient
  };
}

/**
 * Utility to wait for async operations to complete
 */
export const waitForAsyncOperations = () => 
  new Promise(resolve => setTimeout(resolve, 0));

/**
 * Simulates typing in a textarea with realistic delays
 */
export async function typeInTextarea(element: HTMLElement, text: string) {
  const { fireEvent } = await import('@testing-library/react');
  
  // Clear existing content
  fireEvent.change(element, { target: { value: '' } });
  
  // Type character by character to simulate real user input
  for (let i = 0; i <= text.length; i++) {
    const partialText = text.substring(0, i);
    fireEvent.change(element, { target: { value: partialText } });
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between characters
  }
}

/**
 * Mock session storage for testing
 */
export function mockSessionStorage() {
  const storage: Record<string, string> = {};
  
  return {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
    clear: () => {
      Object.keys(storage).forEach(key => delete storage[key]);
    },
    get storage() {
      return { ...storage };
    }
  };
}

/**
 * Utility to generate a mock session ID for testing
 */
export function generateMockSessionId(): string {
  return `test-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}