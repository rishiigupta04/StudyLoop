'use client';
import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface TranscriptChunk {
  id: string;
  timestamp: string;
  text: string;
  lang: 'EN' | 'HI';
}

const transcriptChunks: TranscriptChunk[] = [
  {
    id: 'tc-0000',
    timestamp: '0:00',
    text: 'Welcome to 6.006, Introduction to Algorithms. My name is Erik Demaine and this is my co-lecturer, Jason Ku.',
    lang: 'EN',
  },
  {
    id: 'tc-0432',
    timestamp: '4:32',
    text: 'This course is about how to solve computational problems and how to communicate that you\'ve solved them correctly and efficiently.',
    lang: 'EN',
  },
  {
    id: 'tc-1215',
    timestamp: '12:15',
    text: 'An algorithm is a computational procedure for solving a problem. What makes a good algorithm? Correctness, efficiency, and clarity.',
    lang: 'EN',
  },
  {
    id: 'tc-2410',
    timestamp: '24:10',
    text: 'Let\'s talk about peak finding. A peak in a 1D array is an element greater than or equal to its neighbors. Every non-empty array has at least one peak.',
    lang: 'EN',
  },
  {
    id: 'tc-3845',
    timestamp: '38:45',
    text: 'For a 2D peak, we need a different approach. The greedy ascent algorithm walks uphill from any starting point but can be O(n²) in the worst case.',
    lang: 'EN',
  },
  {
    id: 'tc-5230',
    timestamp: '52:30',
    text: 'Time complexity: we analyze algorithms by counting operations as a function of input size n. Asymptotic notation captures the dominant term.',
    lang: 'EN',
  },
  {
    id: 'tc-10820',
    timestamp: '1:08:20',
    text: 'To summarize: peak finding demonstrates the difference between O(n) naive scan, O(log n) divide and conquer for 1D, and O(n log n) for 2D.',
    lang: 'EN',
  },
];

interface TranscriptTabProps {
  activeTimestamp: string;
  onTimestampClick: (ts: string) => void;
}

export default function TranscriptTab({ activeTimestamp, onTimestampClick }: TranscriptTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const activeRef = useRef<HTMLDivElement>(null);

  const filtered = transcriptChunks.filter(
    (c) =>
      c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.timestamp.includes(searchQuery)
  );

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeTimestamp]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="MagnifyingGlassIcon" size={14} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript… / ट्रांसक्रिप्ट खोजें…"
            className="input-field w-full rounded-lg pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <Icon name="XMarkIcon" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Chunks */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Icon name="MagnifyingGlassIcon" size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No results found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          </div>
        ) : (
          filtered.map((chunk) => {
            const isActive = chunk.timestamp === activeTimestamp;
            return (
              <div
                key={chunk.id}
                ref={isActive ? activeRef : null}
                onClick={() => onTimestampClick(chunk.timestamp)}
                className={`rounded-xl p-3 cursor-pointer transition-all duration-200 border ${
                  isActive
                    ? 'transcript-active border-primary/30' :'border-transparent hover:bg-muted/40 hover:border-border'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md flex-shrink-0 tabular-nums transition-colors duration-150 ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary'
                    }`}
                  >
                    {chunk.timestamp}
                  </button>
                  <p className={`text-sm leading-relaxed flex-1 ${
                    isActive ? 'text-foreground' : 'text-secondary-foreground'
                  }`}>
                    {searchQuery
                      ? chunk.text.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) =>
                          part.toLowerCase() === searchQuery.toLowerCase() ? (
                            <mark
                              key={`highlight-${chunk.id}-${i}`}
                              className="bg-highlight/30 text-highlight rounded px-0.5"
                            >
                              {part}
                            </mark>
                          ) : (
                            <span key={`text-${chunk.id}-${i}`}>{part}</span>
                          )
                        )
                      : chunk.text}
                  </p>
                </div>
                {isActive && (
                  <div className="flex items-center gap-1.5 mt-2 ml-14">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs text-primary font-medium">Currently playing</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}