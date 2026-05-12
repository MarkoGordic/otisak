import React from 'react';
import { Check } from 'lucide-react';
import { useTheme } from '../ThemeProvider';

interface AnswerOptionProps {
  id: string;
  text: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
  showCorrect?: boolean;
  isCorrect?: boolean;
  disabled?: boolean;
  multiSelect?: boolean;
}

export function AnswerOption({
  id,
  text,
  label,
  selected,
  onSelect,
  showCorrect = false,
  isCorrect = false,
  disabled = false,
  multiSelect = false,
}: AnswerOptionProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const isWrong = showCorrect && selected && !isCorrect;
  const isRight = showCorrect && isCorrect;

  let borderClass = 'border-transparent';
  if (selected && !showCorrect) borderClass = isDark ? 'border-blue-500/50' : 'border-blue-500';
  else if (isRight) borderClass = isDark ? 'border-green-500/50' : 'border-green-500';
  else if (isWrong) borderClass = isDark ? 'border-red-500/50' : 'border-red-500';

  let bgClass = isDark
    ? 'bg-[#181a25] hover:bg-[#1e2030] hover:border-gray-700'
    : 'bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm';
  if (selected && !showCorrect) bgClass = isDark ? 'bg-[#1e2030]' : 'bg-blue-50';
  else if (isRight) bgClass = isDark ? 'bg-green-900/20' : 'bg-green-50';
  else if (isWrong) bgClass = isDark ? 'bg-red-900/20' : 'bg-red-50';

  const labelChipBase = selected ? 'bg-blue-600 text-white' : isDark ? 'bg-[#2a2d3d] text-gray-400' : 'bg-slate-100 text-slate-500';
  const textColor = selected
    ? (isDark ? 'text-white' : 'text-blue-900')
    : (isDark ? 'text-gray-300' : 'text-slate-700');

  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(id)}
      disabled={disabled}
      className={`
        w-full flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded cursor-pointer transition-all duration-200
        border ${borderClass} ${bgClass}
        ${disabled ? 'cursor-not-allowed opacity-80' : ''}
      `}
    >
      <div
        className={`
          w-6 h-6 ${multiSelect ? 'rounded-md' : 'rounded'} flex items-center justify-center flex-shrink-0 transition-colors text-[11px] font-bold
          ${labelChipBase}
          ${isRight ? 'bg-green-600 text-white' : ''}
          ${isWrong ? 'bg-red-600 text-white' : ''}
        `}
      >
        {selected && !showCorrect ? (
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        ) : isRight ? (
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        ) : (
          label
        )}
      </div>

      <span className={`text-xs sm:text-sm ${textColor}`}>
        {text}
      </span>
    </button>
  );
}
