'use client';

import React from 'react';

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)] mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-display font-semibold text-[var(--text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="h-10 px-5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
