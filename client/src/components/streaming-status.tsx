/**
 * @file streaming-status.tsx
 * 
 * @description
 * Simple reusable component for showing streaming status with appropriate icons.
 * Used by both Results and Action Plan pages during AI streaming phases.
 * 
 * ✨ **New in Step 13** ✨
 * - Minimal, focused component for streaming feedback
 * - No complex animations or transitions
 * - Clear visual indicators for different phases
 */

import { Brain, Loader, Youtube } from 'lucide-react';
import { StreamingPhase } from '@/hooks/use-sse-stream';

interface StreamingStatusProps {
  phase: StreamingPhase;
  message: string;
}

export function StreamingStatus({ phase, message }: StreamingStatusProps) {
  const getIcon = () => {
    switch (phase) {
      case StreamingPhase.THINKING:
        return <Brain className="w-8 h-8 text-purple-600 animate-pulse" />;
      case StreamingPhase.ENRICHING:
        return <Youtube className="w-8 h-8 text-red-600 animate-pulse" />;
      default:
        return <Loader className="w-8 h-8 text-purple-600 animate-spin" />;
    }
  };

  return (
    <div className="flex items-center justify-center mb-6">
      {getIcon()}
      <span className="ml-3 text-lg font-medium text-slate-700">
        {message}
      </span>
    </div>
  );
}