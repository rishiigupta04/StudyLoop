import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { useGamification } from '@/context/GamificationContext';

interface QuizQuestion {
  id: string;
  videoTitle: string;
  timestamp: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const mockQuizQuestions: QuizQuestion[] = [
  {
    id: 'quiz-1',
    videoTitle: 'MIT 6.006 Intro to Algorithms',
    timestamp: '24:10',
    question: 'What is the worst-case time complexity of 1D Peak Finding using Divide & Conquer?',
    options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
    correctIndex: 1,
    explanation: 'Divide and conquer splits the 1D array in half at each step, yielding T(n) = T(n/2) + O(1), which solves to O(log n).',
  },
  {
    id: 'quiz-2',
    videoTitle: 'Stanford CS229 Machine Learning',
    timestamp: '42:10',
    question: 'What does gradient descent minimize during model training?',
    options: ['Learning Rate', 'Cost Function J(θ)', 'Batch Size', 'Eigenvalues'],
    correctIndex: 1,
    explanation: 'Gradient descent iteratively updates parameters θ to find the minimum of the cost function J(θ).',
  },
  {
    id: 'quiz-3',
    videoTitle: 'Harvard CS50 Memory & Pointers',
    timestamp: '1:12:05',
    question: 'Where is dynamically allocated memory stored in C/C++ execution?',
    options: ['Call Stack', 'Heap Memory', 'CPU Register', 'ROM'],
    correctIndex: 1,
    explanation: 'Heap memory stores dynamically allocated data created via malloc()/new, requiring manual release.',
  },
  {
    id: 'quiz-4',
    videoTitle: 'MIT 6.006 Intro to Algorithms',
    timestamp: '38:45',
    question: 'What is the worst-case complexity of 2D Peak Finding using 2D Divide & Conquer?',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'],
    correctIndex: 1,
    explanation: 'Finding the 1D max in middle column takes O(n), and recursing on half matrix of size n x (m/2) yields O(n log m).',
  },
];

export default function AIQuizWidget() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const { awardXP } = useGamification();
  const navigate = useNavigate();

  const q = mockQuizQuestions[currentIndex];
  const selectedOption = userAnswers[currentIndex] !== undefined ? userAnswers[currentIndex] : null;
  const isAnswered = selectedOption !== null;

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: idx }));
    if (idx === q.correctIndex) {
      setScore((prev) => prev + 1);
      awardXP(10, 'Correct Active Recall Answer');
    } else {
      toast.error('Incorrect. Review concept at timestamp below.');
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < mockQuizQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      toast.success(`Daily Recall Completed! Total Score: ${score}/${mockQuizQuestions.length}`);
    }
  };

  const jumpToLectureTimestamp = () => {
    toast.success(`Opening ${q.videoTitle} @ ${q.timestamp}`);
    navigate('/video-study-page', {
      state: { timestamp: q.timestamp, videoTitle: q.videoTitle },
    });
  };

  return (
    <div className="glass-card rounded-3xl border border-indigo-500/20 p-5 relative overflow-hidden shadow-glow-indigo-sm">
      {/* Header with Forward & Backward Arrows */}
      <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Icon name="AcademicCapIcon" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">AI Daily Active Recall</h3>
            <p className="text-[11px] text-muted-foreground">Generated from your video study notes</p>
          </div>
        </div>

        {/* Forward & Backward Arrow Controls */}
        <div className="flex items-center gap-1.5 bg-surface-card border border-border/60 rounded-xl p-1">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="p-1 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Previous question"
            aria-label="Previous question"
          >
            <Icon name="ChevronLeftIcon" size={14} />
          </button>
          <span className="text-xs font-mono font-bold text-cyan-400 px-1.5">
            {currentIndex + 1}/{mockQuizQuestions.length}
          </span>
          <button
            onClick={handleNext}
            disabled={currentIndex === mockQuizQuestions.length - 1}
            className="p-1 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Next question"
            aria-label="Next question"
          >
            <Icon name="ChevronRightIcon" size={14} />
          </button>
        </div>
      </div>

      {/* Interactive Timestamp Jump Button Container */}
      <button
        onClick={jumpToLectureTimestamp}
        className="w-full flex items-center justify-between text-xs p-2.5 rounded-xl bg-surface-card/90 border border-indigo-500/25 hover:border-indigo-500/60 hover:bg-indigo-500/10 transition-all group mb-3 cursor-pointer shadow-sm"
        title={`Click to open lecture video at ${q.timestamp}`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <Icon name="PlayCircleIcon" size={16} className="text-indigo-400 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
          <span className="truncate text-indigo-300 font-bold group-hover:text-white transition-colors">{q.videoTitle}</span>
        </div>
        <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-indigo-600/30 text-cyan-300 border border-indigo-500/30 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/40 transition-colors flex items-center gap-1 flex-shrink-0">
          <Icon name="PlayIcon" size={10} />
          <span>@{q.timestamp}</span>
        </span>
      </button>

      {/* Question */}
      <p className="text-sm font-bold text-foreground mb-4 leading-relaxed">
        {q.question}
      </p>

      {/* Options */}
      <div className="space-y-2 mb-4">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correctIndex;
          const isSelected = idx === selectedOption;

          let btnStyle = 'bg-surface-card border-border/60 text-foreground hover:border-indigo-500/40';
          if (isAnswered) {
            if (isCorrect) btnStyle = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold';
            else if (isSelected) btnStyle = 'bg-red-500/20 border-red-500/50 text-red-300';
            else btnStyle = 'bg-surface-card/40 border-border/30 opacity-50';
          }

          return (
            <button
              key={`opt-${idx}`}
              onClick={() => handleSelectOption(idx)}
              disabled={isAnswered}
              className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between ${btnStyle}`}
            >
              <span>{opt}</span>
              {isAnswered && isCorrect && (
                <Icon name="CheckIcon" size={14} className="text-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation & Seek Button */}
      {isAnswered && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3.5 mb-4 space-y-2">
          <p className="text-xs text-foreground/90 leading-relaxed">
            <span className="font-bold text-indigo-400">Explanation: </span>
            {q.explanation}
          </p>
          <button
            onClick={jumpToLectureTimestamp}
            className="text-xs font-bold text-indigo-300 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            <Icon name="PlayIcon" size={12} />
            <span>Watch concept video @ {q.timestamp} →</span>
          </button>
        </div>
      )}

      {/* Bottom Navigation Buttons */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-3 py-1.5 rounded-xl border border-border/60 text-xs font-bold text-muted-foreground hover:text-foreground hover:border-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
        >
          <Icon name="ChevronLeftIcon" size={12} />
          <span>Prev</span>
        </button>

        <span className="text-[11px] font-mono text-muted-foreground">
          Score: <strong className="text-indigo-400">{score}</strong> / {mockQuizQuestions.length}
        </span>

        <button
          onClick={handleNext}
          disabled={currentIndex === mockQuizQuestions.length - 1}
          className="btn-primary px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-glow-indigo-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
        >
          <span>Next</span>
          <Icon name="ChevronRightIcon" size={12} />
        </button>
      </div>
    </div>
  );
}
