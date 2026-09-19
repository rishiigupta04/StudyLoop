import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { Lang } from '@/hooks/useStudySocket';
import type { VideoStatus } from '@/services/transcriptService';
import AnswerText from './AnswerText';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  time: string;
  via: 'typed' | 'voice';
  streaming?: boolean;
  isError?: boolean;
}

interface QAChatTabProps {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  onTimestampClick: (ts: string) => void;
  onOpenVoiceModal?: () => void;
  language: Lang;
  transcriptStatus: VideoStatus;
}

const SUGGESTIONS: Record<Lang, string[]> = {
  en: ['Summarize so far', 'What is this lecture about?', 'Explain the last part again'],
  hi: ['अब तक का summary बताओ', 'यह lecture किस बारे में है?', 'पिछला हिस्सा फिर से समझाओ'],
};

export default function QAChatTab({
  messages,
  busy,
  onSend,
  onTimestampClick,
  onOpenVoiceModal,
  language,
  transcriptStatus,
}: QAChatTabProps) {
  const [inputText, setInputText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const hi = language === 'hi';

  // keep the newest message (and the streaming answer) in view, inside the list only
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setInputText('');
  };

  const status =
    transcriptStatus === 'ready'
      ? { dot: 'bg-emerald-400', text: hi ? 'आपने जितना देखा है, उसी से जवाब' : 'Answers come only from what you have watched' }
      : transcriptStatus === 'unavailable' || transcriptStatus === 'failed'
        ? { dot: 'bg-slate-400', text: hi ? 'Transcript नहीं है: Q&A बंद, playback चालू' : 'No transcript: Q&A is off, playback works' }
        : { dot: 'bg-amber-400 animate-pulse', text: hi ? 'Transcript तैयार हो रहा है…' : 'Preparing the transcript…' };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-shrink-0" role="status">
        <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
        <span className="text-xs text-muted-foreground">{status.text}</span>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
            <Icon name="ChatBubbleLeftRightIcon" size={28} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {hi ? 'Lecture के बारे में कुछ भी पूछें' : 'Ask anything about the lecture'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {hi
                ? 'Type करें या ~ दबाकर बोलें। जवाब में दिए समय पर click करके वहाँ पहुँचें।'
                : 'Type here or hold ~ and speak. Click a timestamp in an answer to jump there.'}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS[language].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy || transcriptStatus !== 'ready'}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/80 text-secondary-foreground hover:border-indigo-400/50 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'ai' && (
                <div className="w-7 h-7 rounded-full gradient-purple-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="SparklesIcon" size={12} className="text-white" />
                </div>
              )}
              <div className={`flex flex-col gap-1 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'message-bubble-user text-white rounded-tr-sm'
                      : `message-bubble-ai rounded-tl-sm ${msg.isError ? 'text-amber-200' : 'text-foreground'}`
                  }`}
                  aria-live={msg.streaming ? 'polite' : undefined}
                >
                  {msg.role === 'ai' && !msg.text && msg.streaming ? (
                    <span className="flex items-center gap-1.5 py-1" aria-label="Thinking">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </span>
                  ) : msg.role === 'ai' ? (
                    <AnswerText text={msg.text} onSeek={onTimestampClick} />
                  ) : (
                    msg.text
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                  {msg.via === 'voice' && <Icon name="MicrophoneIcon" size={10} />}
                  {msg.time}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(inputText);
              }
            }}
            placeholder={hi ? 'इस वीडियो के बारे में पूछें…' : 'Ask about this video…'}
            aria-label="Ask a question"
            rows={1}
            className="input-field flex-1 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          {onOpenVoiceModal && (
            <button
              onClick={onOpenVoiceModal}
              className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 border border-indigo-500/30 transition-all duration-150 flex-shrink-0"
              aria-label="Ask by voice"
              title="Ask by voice (hold ~)"
            >
              <Icon name="MicrophoneIcon" size={18} className="text-indigo-400" />
            </button>
          )}
          <button
            onClick={() => send(inputText)}
            disabled={!inputText.trim() || busy}
            className="p-2.5 rounded-xl btn-primary text-white disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            aria-label="Send question"
          >
            <Icon name="PaperAirplaneIcon" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
