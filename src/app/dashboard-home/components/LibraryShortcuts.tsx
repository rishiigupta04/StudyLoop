import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/AppIcon';

const topics = [
  { id: 'topic-algorithms', label: 'Algorithms', count: 4, color: 'bg-primary/15 text-primary border-primary/20' },
  { id: 'topic-ml', label: 'Machine Learning', count: 3, color: 'bg-accent/15 text-accent border-accent/20' },
  { id: 'topic-sysdesign', label: 'System Design', count: 2, color: 'bg-highlight/15 text-highlight border-highlight/20' },
  { id: 'topic-ds', label: 'Data Structures', count: 3, color: 'bg-success/15 text-success border-success/20' },
  { id: 'topic-webdev', label: 'Web Dev', count: 2, color: 'bg-muted text-muted-foreground border-border' },
];

export default function LibraryShortcuts() {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Topics</h3>
          <p className="text-xs text-muted-foreground">Quick access / त्वरित पहुंच</p>
        </div>
        <Link
          to="/library"
          className="text-xs font-semibold text-primary hover:text-accent transition-colors duration-150 flex items-center gap-1"
        >
          View All
          <Icon name="ArrowRightIcon" size={12} />
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {topics?.map((topic) => (
          <Link key={topic?.id} to="/library">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-all duration-150 hover:opacity-80 ${topic?.color}`}>
              {topic?.label}
              <span className="text-xs opacity-70">{topic?.count}</span>
            </span>
          </Link>
        ))}
      </div>
      {/* AI Agents Status */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">AI Pipeline Status</p>
        <div className="space-y-1.5">
          {[
            { id: 'agent-whisper', label: 'Whisper ASR', status: 'ready' },
            { id: 'agent-distilbert', label: 'DistilBERT Intent', status: 'ready' },
            { id: 'agent-qwen', label: 'Qwen2.5 LLM', status: 'ready' },
            { id: 'agent-bge', label: 'BGE-M3 RAG', status: 'idle' },
          ]?.map((agent) => (
            <div key={agent?.id} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{agent?.label}</span>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${agent?.status === 'ready' ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className={`text-xs font-medium ${agent?.status === 'ready' ? 'text-success' : 'text-muted-foreground'}`}>
                  {agent?.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}