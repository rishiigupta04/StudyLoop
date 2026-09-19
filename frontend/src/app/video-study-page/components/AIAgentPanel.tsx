import React, { useState } from 'react';
import TranscriptTab from './TranscriptTab';
import QAChatTab, { type ChatMessage } from './QAChatTab';
import NotesTab from './NotesTab';
import Icon from '@/components/ui/AppIcon';
import type { Lang } from '@/hooks/useStudySocket';
import type { VideoTranscriptState } from '@/hooks/useVideoTranscript';

type Tab = 'transcript' | 'qa' | 'notes';

interface AIAgentPanelProps {
  transcript: VideoTranscriptState;
  chat: ChatMessage[];
  chatBusy: boolean;
  onSendChat: (text: string) => void;
  currentTime: number;
  language: Lang;
  onTimestampClick: (ts: string) => void;
  onOpenVoiceModal?: () => void;
}

const baseTabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
  { id: 'transcript', label: 'Transcript', icon: 'DocumentMagnifyingGlassIcon' },
  { id: 'qa', label: 'Q&A Chat', icon: 'ChatBubbleLeftRightIcon' },
  { id: 'notes', label: 'Notes', icon: 'PencilSquareIcon', badge: 5 },
];

export default function AIAgentPanel({
  transcript,
  chat,
  chatBusy,
  onSendChat,
  currentTime,
  language,
  onTimestampClick,
  onOpenVoiceModal,
}: AIAgentPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('transcript');
  const answers = chat.filter((m) => m.role === 'ai' && !m.streaming).length;
  const tabs = baseTabs.map((t) => (t.id === 'qa' ? { ...t, badge: answers || undefined } : t));

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-card/40">
      {/* Tab Bar */}
      <div className="flex border-b border-border flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all duration-150 relative ${
              activeTab === tab.id
                ? 'tab-active' : 'text-muted-foreground hover:text-foreground hover:bg-surface-elevated/40'
            }`}
          >
            <Icon
              name={tab.icon as Parameters<typeof Icon>[0]['name']}
              size={14}
            />
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                activeTab === tab.id
                  ? 'bg-indigo-500 text-white'
                  : 'bg-surface-elevated text-muted-foreground'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'transcript' && (
          <TranscriptTab
            transcript={transcript}
            currentTime={currentTime}
            language={language}
            onTimestampClick={onTimestampClick}
          />
        )}
        {activeTab === 'qa' && (
          <QAChatTab
            messages={chat}
            busy={chatBusy}
            onSend={onSendChat}
            onTimestampClick={onTimestampClick}
            onOpenVoiceModal={onOpenVoiceModal}
            language={language}
            transcriptStatus={transcript.status}
          />
        )}
        {activeTab === 'notes' && (
          <NotesTab />
        )}
      </div>
    </div>
  );
}