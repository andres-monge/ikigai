import { useState, useRef, useEffect } from 'react';
import { X, Bot, Send, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type Language } from '@/lib/i18n';
import type { ChatMessage } from '@/types/assessment';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  language: Language;
}

export function ChatInterface({ isOpen, onClose, sessionId, language }: ChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${sessionId}`],
    enabled: isOpen && !!sessionId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest('POST', '/api/chat', {
        sessionId,
        message: content
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chat/${sessionId}`] });
    }
  });

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    
    const userMessage = message;
    setMessage('');
    
    // Add user message to local state immediately
    queryClient.setQueryData([`/api/chat/${sessionId}`], (old: ChatMessage[] = []) => [
      ...old,
      {
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date().toISOString()
      }
    ]);

    await sendMessageMutation.mutateAsync(userMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40" style={{ maxHeight: '500px' }}>
      {/* Chat Header */}
      <div className="gradient-primary p-4 rounded-t-2xl text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center mr-3">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold">{t('chat.title', language)}</h4>
              <p className="text-xs opacity-75">{t('chat.subtitle', language)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors text-white p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="text-white w-4 h-4" />
            </div>
            <div className="bg-slate-100 rounded-lg p-3 max-w-xs">
              <p className="text-sm text-slate-900">
                {language === 'en' 
                  ? "Hi! I see you've completed your ikigai assessment. I'm here to help you refine these results or explore any questions you might have about your purpose paths. What would you like to discuss?"
                  : "¡Hola! Veo que has completado tu evaluación ikigai. Estoy aquí para ayudarte a refinar estos resultados o explorar cualquier pregunta que puedas tener sobre tus caminos de propósito. ¿Qué te gustaría discutir?"
                }
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="text-white w-4 h-4" />
              </div>
            )}
            <div className={`rounded-lg p-3 max-w-xs ${
              msg.role === 'user' 
                ? 'bg-primary text-primary-foreground ml-auto' 
                : 'bg-slate-100 text-slate-900'
            }`}>
              <p className="text-sm">{msg.content}</p>
            </div>
          </div>
        ))}

        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="text-white w-4 h-4" />
            </div>
            <div className="bg-slate-100 rounded-lg p-3 max-w-xs">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex space-x-2">
          <Input
            type="text"
            placeholder={t('chat.placeholder', language)}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="gradient-primary text-white p-3 hover:shadow-lg transition-all duration-200"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center mt-2 text-xs text-slate-500">
          <Shield className="w-3 h-3 mr-1" />
          <span>{t('chat.poweredBy', language)}</span>
        </div>
      </div>
    </div>
  );
}
