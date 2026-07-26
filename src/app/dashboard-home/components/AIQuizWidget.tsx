import React, { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';

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
];

export default function AIQuizWidget() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);

  const q = mockQuizQuestions[currentIndex];

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    if (idx === q.correctIndex) {
      setScore((prev) => prev + 1);
      toast.success('Correct answer! +10 XP');
    } else {
      toast.error('Incorrect. Review explanation below.');
    }
  };

  const handleNext = () => {
    if (currentIndex < mockQuizQuestions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      toast.success(`Daily Quiz Completed! Score: ${score + (selectedOption === q.correctIndex ? 1 : 0)}/${mockQuizQuestions.length}`);
    }
  };

  return (
    <div className="glass-card rounded-3xl border border-indigo-500/20 p-5 relative overflow-hidden shadow-glow-indigo-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Icon name="AcademicCapIcon" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">AI Daily Active Recall Quiz</h3>
            <p className="text-[11px] text-muted-foreground">Generated from your video study notes</p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
          Q{currentIndex + 1}/{mockQuizQuestions.length}
        </span>
      </div>

      {/* Video Context Tag */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span className="truncate max-w-[240px] text-indigo-300 font-semibold">{q.videoTitle}</span>
        <span className="font-mono text-muted-foreground">@{q.timestamp}</span>
      </div>

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

      {/* Explanation & Next */}
      {isAnswered && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 mb-3">
          <p className="text-xs text-foreground/90 leading-relaxed">
            <span className="font-bold text-indigo-400">Explanation: </span>
            {q.explanation}
          </p>
        </div>
      )}

      {isAnswered && currentIndex < mockQuizQuestions.length - 1 && (
        <button
          onClick={handleNext}
          className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-glow-indigo-sm flex items-center justify-center gap-1.5"
        >
          Next Question →
        </button>
      )}
    </div>
  );
}
