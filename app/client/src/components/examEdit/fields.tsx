import React, { useState } from 'react';
import { X } from 'lucide-react';

export type Answer = { id?: string; text: string; is_correct: boolean; position?: number };
export type Question = {
  id: string;
  type: string;
  text: string;
  content: string | null;
  points: number;
  position: number;
  explanation: string | null;
  ai_grading_instructions: string | null;
  multi_answer: boolean;
  answers: Answer[];
};

export const inputClass =
  'w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:border-accent focus:ring-0';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}

// A switch row: the whole row is the hit target, the knob shows the state.
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
    >
      <span>{label}</span>
      <span
        className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${value ? 'bg-accent' : 'bg-[var(--bg-tertiary)] border border-[var(--border-default)]'}`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${value ? 'left-[15px]' : 'left-[2px]'}`}
        />
      </span>
    </button>
  );
}

// Chip-style tag editor. Tags are normalised on add (lowercase + trim) so the
// server sees the same canonical form as what the manage-page filter sends.
// Enter / comma commits the current draft; Backspace on an empty input removes
// the last chip. Duplicates are silently dropped.
export function TagChipsEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const norm = draft.trim().toLowerCase();
    if (!norm) return;
    if (value.includes(norm)) {
      setDraft('');
      return;
    }
    onChange([...value, norm]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] focus-within:border-accent">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-light text-accent text-xs font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-[color-mix(in_srgb,var(--accent)_70%,transparent)] hover:text-accent"
            aria-label={`Remove tag ${tag}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-[var(--text-primary)] focus:outline-none px-1 py-0.5"
      />
    </div>
  );
}

// A choice question with more than one correct answer must be multi-answer,
// or students get radio buttons and can never answer it fully.
export const needsMulti = (answers: Answer[]) => answers.filter((a) => a.is_correct).length > 1;
