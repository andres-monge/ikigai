/**
 * @file use-streaming-state.ts
 * 
 * @description
 * Shared hook that extracts common session management and streaming detection logic
 * from Results and Action Plan pages. Handles session fetching, storage management,
 * and race condition prevention while keeping page-specific streaming logic separate.
 * 
 * @key-features
 * - Safe sessionStorage parsing with auto-healing for corrupted data
 * - Synchronous fetch tracking to prevent race conditions
 * - One-shot streaming control to prevent duplicate submissions
 * - Session validation and mismatch detection
 * 
 * @safety-measures
 * - Uses both state and ref for fetch tracking to prevent premature navigation
 * - Try-catch wrapper around JSON.parse with automatic data cleanup
 * - No navigation decisions - pages remain in control
 */

import { useState, useEffect, useRef } from 'react';
import type { FullAssessment, Language } from '@/types/assessment';
import { apiRequest } from '@/lib/queryClient';

interface UseStreamingStateOptions {
  sessionId: string | null;
  language: Language;
}

interface UseStreamingStateResult {
  // Session data
  session: FullAssessment | null;
  setSession: (session: FullAssessment | null) => void;
  
  // Fetch state (both state and ref for race condition prevention)
  isFetchingSession: boolean;
  isFetchingRef: React.MutableRefObject<boolean>;
  
  // One-shot streaming control
  hasInitiatedStreamingRef: React.MutableRefObject<boolean>;
  
  // Session storage utilities
  clearSessionStorage: () => void;
}

/**
 * Safe JSON parser for sessionStorage that automatically heals corrupted data
 */
const safeParseSession = (sessionId: string, data: string | null): FullAssessment | null => {
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

/**
 * Extract common session management logic from Results and Action Plan pages
 */
export function useStreamingState({
  sessionId,
  language
}: UseStreamingStateOptions): UseStreamingStateResult {
  // Safe session storage with auto-healing
  const [session, setSessionInternal] = useState<FullAssessment | null>(() => {
    if (!sessionId) return null;
    const stored = sessionStorage.getItem('session');
    return safeParseSession(sessionId, stored);
  });
  
  const [isFetchingSession, setIsFetchingSession] = useState(false);
  
  // Synchronous refs to prevent race conditions
  const isFetchingRef = useRef(false);
  const hasInitiatedStreamingRef = useRef(false);

  // Session setter that also updates sessionStorage
  const setSession = (newSession: FullAssessment | null) => {
    setSessionInternal(newSession);
    if (newSession) {
      sessionStorage.setItem('session', JSON.stringify(newSession));
    } else {
      sessionStorage.removeItem('session');
    }
  };

  // Clear session storage utility
  const clearSessionStorage = () => {
    sessionStorage.removeItem('session');
    setSessionInternal(null);
  };

  // Session fetching and management
  useEffect(() => {
    // Reset streaming ref if sessionId changes (new assessment)
    if (!sessionId || (session && session.sessionId !== sessionId)) {
      hasInitiatedStreamingRef.current = false;
    }

    // No sessionId means we can't proceed
    if (!sessionId) {
      return;
    }

    // Clear stale session data if sessionId mismatch
    if (session && session.sessionId !== sessionId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('SessionId mismatch detected, clearing stale session data');
      }
      setSession(null);
      return; // Let the effect re-run with cleared session
    }

    // Need to fetch from server if session is missing or has wrong sessionId
    if (!isFetchingSession && (!session || session.sessionId !== sessionId)) {
      // Set both state and ref synchronously to prevent race conditions
      setIsFetchingSession(true);
      isFetchingRef.current = true;
      
      apiRequest('GET', `/api/session/${sessionId}`)
        .then(async (res) => {
          if (res.ok) {
            const serverSession = await res.json();
            setSession(serverSession);
          } else if (res.status === 404) {
            // Session doesn't exist on server - let pages handle navigation
            setSession(null);
          } else {
            throw new Error(`Server returned ${res.status}`);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch session from server:', error);
          // Set session to null to trigger error handling in pages
          setSession(null);
        })
        .finally(() => {
          setIsFetchingSession(false);
          isFetchingRef.current = false;
        });
    }
  }, [
    sessionId,
    session?.sessionId,
    isFetchingSession
  ]);

  return {
    session,
    setSession,
    isFetchingSession,
    isFetchingRef,
    hasInitiatedStreamingRef,
    clearSessionStorage
  };
}