/**
 * @file use-sse-stream.ts
 * 
 * @description
 * Reusable SSE (Server-Sent Events) hook for handling streaming AI responses.
 * Supports both purpose discovery and action plan streaming with phase tracking.
 * 
 * ✨ **New in Step 13** ✨
 * - Handles AI thinking time with explicit phase feedback
 * - Simple buffer management for raw streaming text
 * - Auto-retry on connection errors
 * - Clean EventSource lifecycle management
 * 
 * @dependencies
 * - React hooks for state management
 * - Native EventSource API for SSE
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export enum StreamingPhase {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  THINKING = 'thinking',      // Connected but AI still processing
  STREAMING = 'streaming',    // Receiving data chunks
  ENRICHING = 'enriching',    // YouTube video fetch (action plan only)
  COMPLETE = 'complete',
  ERROR = 'error'
}

export interface StreamingState {
  phase: StreamingPhase;
  buffer: string;            // Raw accumulated text
  error: string | null;
  isComplete: boolean;
  completedSections: string[]; // Track which sections are complete
}

export interface UseSSEStreamOptions {
  enabled: boolean;          // Whether to start streaming
  endpoint: string;          // SSE endpoint URL
  onComplete?: (finalBuffer: string) => void;
  onError?: (error: string) => void;
}

/* -------------------------------------------------------------------------- */
/* SSE Events Constants                                                       */
/* -------------------------------------------------------------------------- */

const SSE_EVENTS = {
  STREAM_START: '[STREAM_START]',
  STREAM_END: '[STREAM_END]',
  ENRICH_START: '[ENRICH_START]',
  SAVE_SUCCESS: '[SAVE_SUCCESS]',
  ERROR: '[ERROR]'
} as const;

/* -------------------------------------------------------------------------- */
/* Helper Functions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Detects if a section is complete in the buffer
 */
function hasCompleteSection(buffer: string, sectionName: string): boolean {
  const startTag = `[SECTION:${sectionName}]`;
  const endTag = `[END_SECTION]`;
  const startIdx = buffer.indexOf(startTag);
  const endIdx = buffer.indexOf(endTag, startIdx);
  return startIdx >= 0 && endIdx > startIdx;
}

/**
 * Gets all completed sections from the buffer
 */
function getCompletedSections(buffer: string): string[] {
  const sections: string[] = [];
  
  // Check for core drivers section
  if (hasCompleteSection(buffer, 'CORE_DRIVERS')) {
    sections.push('CORE_DRIVERS');
  }
  
  // Check for purpose paths
  for (let i = 1; i <= 3; i++) {
    if (hasCompleteSection(buffer, `PATH_${i}`)) {
      sections.push(`PATH_${i}`);
    }
  }
  
  // Check for milestones (action plan)
  for (let i = 1; i <= 10; i++) {
    if (hasCompleteSection(buffer, `MILESTONE_${i}`)) {
      sections.push(`MILESTONE_${i}`);
    }
  }
  
  return sections;
}

/* -------------------------------------------------------------------------- */
/* Hook Implementation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Reusable SSE streaming hook with phase tracking and error handling
 */
export function useSSEStream(options: UseSSEStreamOptions): StreamingState {
  const { enabled, endpoint, onComplete, onError } = options;
  
  const [state, setState] = useState<StreamingState>({
    phase: StreamingPhase.IDLE,
    buffer: '',
    error: null,
    isComplete: false,
    completedSections: []
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  
  // Clean up function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    isStreamingRef.current = false;
  }, []);
  
  // Start streaming
  const startStream = useCallback(() => {
    if (!enabled || eventSourceRef.current || isStreamingRef.current) return;
    
    isStreamingRef.current = true;
    setState(prev => ({
      ...prev,
      phase: StreamingPhase.CONNECTING,
      error: null,
      buffer: '',
      completedSections: []
    }));
    
    try {
      const eventSource = new EventSource(endpoint);
      eventSourceRef.current = eventSource;
      
      // Set thinking timer - if no data after 3 seconds, show thinking state
      thinkingTimerRef.current = setTimeout(() => {
        setState(prev => 
          prev.phase === StreamingPhase.CONNECTING 
            ? { ...prev, phase: StreamingPhase.THINKING }
            : prev
        );
      }, 3000);
      
      eventSource.onmessage = (event) => {
        const data = event.data;
        
        // Clear thinking timer on first message
        if (thinkingTimerRef.current) {
          clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = null;
        }
        
        setState(prev => {
          let newPhase = prev.phase;
          let newBuffer = prev.buffer;
          let newError = prev.error;
          let isComplete = prev.isComplete;
          
          if (data === SSE_EVENTS.STREAM_START) {
            newPhase = StreamingPhase.STREAMING;
          } else if (data === SSE_EVENTS.STREAM_END) {
            // Keep streaming phase, wait for save success
          } else if (data === SSE_EVENTS.ENRICH_START) {
            newPhase = StreamingPhase.ENRICHING;
          } else if (data === SSE_EVENTS.SAVE_SUCCESS) {
            newPhase = StreamingPhase.COMPLETE;
            isComplete = true;
            isStreamingRef.current = false;
            onComplete?.(newBuffer);
          } else if (data.startsWith(SSE_EVENTS.ERROR)) {
            newPhase = StreamingPhase.ERROR;
            newError = data.replace(SSE_EVENTS.ERROR, '').trim();
            isStreamingRef.current = false;
            onError?.(newError || 'Unknown error');
          } else {
            // Regular text chunk
            newBuffer = prev.buffer + data;
            if (prev.phase === StreamingPhase.CONNECTING || prev.phase === StreamingPhase.THINKING) {
              newPhase = StreamingPhase.STREAMING;
            }
          }
          
          const completedSections = getCompletedSections(newBuffer);
          
          return {
            ...prev,
            phase: newPhase,
            buffer: newBuffer,
            error: newError,
            isComplete,
            completedSections
          };
        });
      };
      
      eventSource.onerror = () => {
        isStreamingRef.current = false;
        setState(prev => ({
          ...prev,
          phase: StreamingPhase.ERROR,
          error: 'Connection lost. Retrying...'
        }));
        
        // Auto-retry after 2 seconds
        retryTimerRef.current = setTimeout(() => {
          cleanup();
          startStream();
        }, 2000);
      };
      
    } catch (error) {
      isStreamingRef.current = false;
      setState(prev => ({
        ...prev,
        phase: StreamingPhase.ERROR,
        error: error instanceof Error ? error.message : 'Failed to connect'
      }));
      onError?.(error instanceof Error ? error.message : 'Failed to connect');
    }
  }, [enabled, endpoint, onComplete, onError, cleanup]);
  
  // Effect to start/stop streaming
  useEffect(() => {
    if (enabled && !isStreamingRef.current) {
      startStream();
    }
    
    if (!enabled && isStreamingRef.current) {
      cleanup();
      setState(prev => ({ ...prev, phase: StreamingPhase.IDLE }));
    }
    
    return () => {
      if (!enabled) {
        cleanup();
      }
    };
  }, [enabled, startStream, cleanup]);
  
  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  return state;
}