import React, { useState } from 'react';
import TranscriptTab from './TranscriptTab';
import QAChatTab from './QAChatTab';
import NotesTab from './NotesTab';
import Icon from '@/components/ui/AppIcon';

type Tab = 'transcript' | 'qa' | 'notes';

interface AIAgentPanelProps {
  activeTimestamp: string;
  onTimestampClick: (ts: string) => void;
}

const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
  { id: 'transcript', label: 'Transcript', icon: 'DocumentMagnifyingGlassIcon' },
  { id: 'qa', label: 'Q&A Chat', icon: 'ChatBubbleLeftRightIcon', badge: 3 },
  { id: 'notes', label: 'Notes', icon: 'PencilSquareIcon', badge: 5 },
];

export default function AIAgentPanel({ activeTimestamp, onTimestampClick }: AIAgentPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('transcript');

  return (
    <div className="flex flex-col h-full bg-secondary/30">
      {/* Tab Bar */}
      <div className="flex border-b border-border flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all duration-150 relative ${
              activeTab === tab.id
                ? 'tab-active' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
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
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'transcript' && (
          <TranscriptTab
            activeTimestamp={activeTimestamp}
            onTimestampClick={onTimestampClick}
          />
        )}
        {activeTab === 'qa' && (
          <QAChatTab onTimestampClick={onTimestampClick} />
        )}
        {activeTab === 'notes' && (
          <NotesTab />
        )}
      </div>
    </div>
  );
}