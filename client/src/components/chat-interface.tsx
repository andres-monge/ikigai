/**
 * @file chat-interface.tsx
 *
 * @description
 * A reusable chat component that provides a conversational interface with Nami,
 * the AI assistant. It is displayed in a side sheet and manages the state
 * of the conversation, including message history and user input.
 *
 * ✨ **2025-06-26 CORRECTION (Step 23)** ✨
 * - **FIX 1: Module Path:** Corrected the import path for shared types from
 * `@/shared/schema` to `@shared/schema` to align with the project's
 * tsconfig path aliases.
 * - **FIX 2: ScrollArea Ref:** Removed the invalid `viewportRef` prop. The component
 * now uses a `ref` on the `<ScrollArea>` root and a `querySelector` to find the
 * underlying Radix UI viewport. This is the correct, robust way to programmatically
 * scroll the component.
 * - **FIX 3: Type Safety & Logic:**
 * - New `ChatMessage` objects created on the client now include all required
 * fields (`id`, `assessmentId`, `createdAt`) with client-side-appropriate
 * values, satisfying the strict `ChatMessage` type and fixing a potential
 * TypeScript error.
 * - The streaming logic now updates the assistant's message by its unique `id`
 * instead of relying on its position in the array, making the state updates
 * more robust.
 * - The `handleSubmit` function still uses the `fetch` API's `ReadableStream` to
 * provide a real-time "typing" effect for the AI's response.
 *
 * @dependencies
 * - lucide-react: For icons.
 * - Shadcn UI components: Sheet, Button, Input, ScrollArea.
 * - @shared/schema: For shared TypeScript types like `ChatMessage`.
 * - @/lib/i18n for translations.
 * - @/hooks/use-session-storage for persisting chat history.
 */
import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { t, type Language } from '@/lib/i18n';
import { useSessionStorage } from '@/hooks/use-session-storage';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@shared/schema';

export interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  language: Language;
  /** Determines the conversational context for the AI. */
  context: 'discovery' | 'action_plan';
  /** Optional ID for refining a specific Purpose Path. */
  pathId?: number | null;
}

export function ChatInterface({
  isOpen,
  onClose,
  sessionId,
  language,
  context,
  pathId = null,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Chat history is persisted in session storage, keyed by context
  const storageKey = `chatHistory_${context}`;
  const [messages, setMessages] = useSessionStorage<ChatMessage[]>(
    storageKey,
    [],
  );

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    // The viewport is a child of the root element we get from the ref.
    // Radix UI adds a specific data attribute to the viewport element.
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
      'div[data-radix-scroll-area-viewport]',
    );
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isSending]); // Also trigger on isSending to scroll for the placeholder

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const userMessageContent = inputValue;
    setInputValue('');
    setIsSending(true);

    const assistantMessageId = Date.now() + 1;

    // 1. Create fully-typed user message and assistant placeholder
    const userMessage: ChatMessage = {
      id: Date.now(),
      assessmentId: 0, // Not used on client, but required by type
      role: 'user',
      content: userMessageContent,
      context: context,
      createdAt: new Date(),
    };
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      assessmentId: 0, // Not used on client, but required by type
      role: 'assistant',
      content: '', // Starts empty, will be populated by stream
      context: context,
      createdAt: new Date(),
    };

    // 2. Add both to state immediately for a responsive UI
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    try {
      // 3. Initiate the streaming fetch call to the SSE endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message: userMessageContent,
          context,
          // Only include pathId if refining a single path
          ...(pathId !== null ? { pathId } : {}),
        }),
      });

      if (!response.body || !response.ok) {
        throw new Error(
          response.statusText || 'Failed to connect to the server.',
        );
      }

      // 4. Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break; // Stream finished
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; // Keep any incomplete message part

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const dataString = part.substring(6).trim();
            if (dataString === '[DONE]') continue;

            try {
              const jsonData = JSON.parse(dataString);
              if (jsonData.content) {
                // Find placeholder by ID and append content
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + jsonData.content }
                      : msg,
                  ),
                );
              }
            } catch (error) {
              console.error('Failed to parse SSE JSON data:', dataString, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat stream error:', error);
      // Update placeholder with an error message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: t('common.error', language) }
            : msg,
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="text-left">
          <SheetTitle>{t('chat.title', language)}</SheetTitle>
          <SheetDescription>
            {t('chat.subtitle', language)}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow my-4 -mx-6" ref={scrollAreaRef}>
          <div className="px-6 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex items-start gap-4',
                  msg.role === 'user' && 'flex-row-reverse',
                )}
              >
                <Avatar
                  className={cn(
                    'w-8 h-8',
                    msg.role === 'assistant' && 'gradient-primary text-white',
                  )}
                >
                  {msg.role === 'assistant' && (
                    <AvatarImage src="/nami-avatar.png" alt="Nami" />
                  )}
                  <AvatarFallback
                    className={cn(
                      msg.role === 'assistant' &&
                        'bg-transparent text-white font-bold',
                    )}
                  >
                    {msg.role === 'user' ? 'U' : <Sparkles size={18} />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'p-3 rounded-lg max-w-[80%]',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-100 text-slate-800',
                  )}
                >
                  {/* Show pulsing for empty assistant message during stream */}
                  {msg.role === 'assistant' && msg.content === '' && isSending ? (
                    <Sparkles size={18} className="animate-pulse" />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex gap-2 p-1 border rounded-lg">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('chat.placeholder', language)}
            className="flex-grow border-none focus-visible:ring-0"
            disabled={isSending}
            autoFocus
          />
          <Button type="submit" disabled={isSending || !inputValue.trim()}>
            <Send size={16} />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}