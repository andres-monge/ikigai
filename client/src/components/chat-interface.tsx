/**
 * @file chat-interface.tsx
 *
 * @description
 * A reusable chat component that provides a conversational interface with Nami,
 * the AI assistant. It is displayed in a side sheet and manages the state
 * of the conversation, including message history and user input.
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
import TextareaAutosize from 'react-textarea-autosize';
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

  // Chat history is persisted in session storage, keyed by session + context
  const storageKey = `chatHistory_${sessionId}_${context}`;
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
    setMessages((prev) => {
      const updated = [...prev, userMessage, assistantPlaceholder];
      return updated;
    });

    try {
      // 3. Send a standard POST request (non-streaming)
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

      if (!response.ok) {
        throw new Error(response.statusText || 'Failed to connect to the server.');
      }

      // 4. Parse the JSON response { content: string }
      const data: { content: string } = await response.json();

      // 5. Update the assistant placeholder with the full response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId ? { ...msg, content: data.content } : msg,
        ),
      );
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
          <TextareaAutosize
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            placeholder={t('chat.placeholder', language)}
            minRows={1}
            maxRows={6}
            className="flex-grow border-none resize-none focus-visible:ring-0 px-3 py-2 rounded-md"
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