import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  lang: 'EN';
  videoTimestamp?: string;
  isBookmarked: boolean;
}

const initialMessages: Message[] = [
  {
    id: 'msg-001',
    role: 'user',
    text: 'What is peak finding?',
    timestamp: '2:31 PM',
    lang: 'EN',
    isBookmarked: false,
  },
  {
    id: 'msg-002',
    role: 'ai',
    text: 'Peak finding is the problem of finding an element in an array that is greater than or equal to its neighbors. For a 1D array of n elements, an efficient algorithm runs in O(log n) time using divide and conquer.',
    timestamp: '2:31 PM',
    lang: 'EN',
    videoTimestamp: '24:10',
    isBookmarked: true,
  },
  {
    id: 'msg-003',
    role: 'user',
    text: 'How does 1D peak finding work?',
    timestamp: '2:35 PM',
    lang: 'EN',
    isBookmarked: false,
  },
  {
    id: 'msg-004',
    role: 'ai',
    text: 'In 1D peak finding, we examine the middle element. If it is smaller than its left neighbor, we recurse on the left half; if smaller than its right neighbor, we recurse on the right half. Otherwise, it is a peak.',
    timestamp: '2:35 PM',
    lang: 'EN',
    videoTimestamp: '24:10',
    isBookmarked: true,
  },
  {
    id: 'msg-005',
    role: 'user',
    text: "What's the time complexity of 2D peak finding?",
    timestamp: '2:42 PM',
    lang: 'EN',
    isBookmarked: false,
  },
  {
    id: 'msg-006',
    role: 'ai',
    text: 'The 2D peak finding algorithm using divide and conquer runs in O(n log n) time. The greedy ascent algorithm, while simpler, can be O(n²) in the worst case.',
    timestamp: '2:42 PM',
    lang: 'EN',
    videoTimestamp: '38:45',
    isBookmarked: false,
  },
];

// BACKEND INTEGRATION: POST /api/qa/ask { videoId, question, lang, timestamp } → { answer, sourceTimestamp, lang }
const mockAIResponses: Record<string, string> = {
  default: "That's a great question! Based on the lecture content, this topic is covered in detail around the 24-minute mark. The key insight is using divide and conquer to achieve logarithmic time complexity.",
};

interface QAChatTabProps {
  onTimestampClick: (ts: string) => void;
  onOpenVoiceModal?: () => void;
}

export default function QAChatTab({ onTimestampClick, onOpenVoiceModal }: QAChatTabProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleBookmark = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isBookmarked: !m.isBookmarked } : m))
    );
  };

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      lang: 'EN',
      isBookmarked: false,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsThinking(true);

    // BACKEND INTEGRATION: WebSocket /ws/qa or POST /api/qa/ask
    setTimeout(() => {
      const aiMsg: Message = {
        id: `msg-${Date.now()}-ai`,
        role: 'ai',
        text: mockAIResponses.default,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        lang: 'EN',
        videoTimestamp: '24:10',
        isBookmarked: false,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 1800);
  };

  return (
    <div className="flex flex-col h-full">
      {/* AI Status Bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Qwen2.5 LLM Active</span>
        </div>
        <span className="text-muted-foreground text-xs">·</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-xs text-muted-foreground">BGE-M3 RAG Ready</span>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">&lt;150ms</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            {msg.role === 'ai' && (
              <div className="w-7 h-7 rounded-full gradient-purple-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name="SparklesIcon" size={12} className="text-white" />
              </div>
            )}
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold">
                A
              </div>
            )}

            <div className={`flex flex-col gap-1.5 max-w-[78%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Bubble */}
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user' ?'message-bubble-user text-white rounded-tr-sm' :'message-bubble-ai text-foreground rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>

              {/* Meta row */}
              <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <span className="text-xs text-muted-foreground tabular-nums">{msg.timestamp}</span>
                {msg.role === 'ai' && msg.videoTimestamp && (
                  <button
                    onClick={() => onTimestampClick(msg.videoTimestamp!)}
                    className="text-xs font-semibold text-primary hover:text-accent transition-colors duration-150 flex items-center gap-0.5"
                  >
                    <Icon name="PlayIcon" size={10} />
                    {msg.videoTimestamp} →
                  </button>
                )}
                {msg.role === 'ai' && (
                  <button
                    onClick={() => toggleBookmark(msg.id)}
                    className={`transition-colors duration-150 ${
                      msg.isBookmarked ? 'text-highlight' : 'text-muted-foreground hover:text-highlight'
                    }`}
                    aria-label={msg.isBookmarked ? 'Remove bookmark' : 'Bookmark this answer'}
                  >
                    <Icon name={msg.isBookmarked ? 'StarIcon' : 'StarIcon'} size={12} variant={msg.isBookmarked ? 'solid' : 'outline'} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full gradient-purple-blue flex items-center justify-center flex-shrink-0">
              <Icon name="SparklesIcon" size={12} className="text-white" />
            </div>
            <div className="message-bubble-ai rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={`dot-${i}`}
                  className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask anything about this video…"
              rows={1}
              className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={() => {
              if (onOpenVoiceModal) {
                onOpenVoiceModal();
              } else {
                toast.info('Voice input — hold ~ key or click Voice Copilot in header');
              }
            }}
            className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/30 transition-all duration-150 flex-shrink-0"
            aria-label="Voice input"
            title="Voice question (hold ~ key)"
          >
            <Icon name="MicrophoneIcon" size={18} className="text-indigo-400" />
          </button>
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isThinking}
            className="p-2.5 rounded-xl btn-primary text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send message"
          >
            <Icon name="PaperAirplaneIcon" size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}