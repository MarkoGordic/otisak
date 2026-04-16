'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface QuestionNavProps {
  totalQuestions: number;
  currentIndex: number;
  answeredQuestions: Set<number>;
  onSelect: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function QuestionNav({
  totalQuestions,
  currentIndex,
  answeredQuestions,
  onSelect,
  onNext,
  onPrev,
}: QuestionNavProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mt-6 sm:mt-8 mb-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="p-1.5 sm:p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors flex-shrink-0"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5 max-w-[calc(100vw-6rem)] sm:max-w-2xl">
        {Array.from({ length: totalQuestions }).map((_, idx) => {
          const isCurrent = currentIndex === idx;
          const isAnswered = answeredQuestions.has(idx);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect(idx)}
              className={`
                w-7 h-7 sm:w-8 sm:h-8 rounded text-xs sm:text-sm font-medium transition-all duration-200 relative
                ${isCurrent
                  ? 'bg-blue-600 text-white scale-110'
                  : isAnswered
                    ? 'bg-blue-900/40 text-blue-300 border border-blue-500/30'
                    : 'bg-[#2a2d3d] text-gray-400 hover:bg-[#35394b] hover:text-white'
                }
              `}
            >
              {idx + 1}
              {isAnswered && !isCurrent && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex === totalQuestions - 1}
        className="p-1.5 sm:p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors flex-shrink-0"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
    </div>
  );
}
