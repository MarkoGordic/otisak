import React from 'react';

type BadgeVariant = 'accent' | 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'custom';

const variantStyles: Record<Exclude<BadgeVariant, 'custom'>, string> = {
  accent: 'bg-accent-light text-accent',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  info: 'bg-info-light text-info',
};

export function Badge({
  children,
  variant = 'accent',
  size = 'sm',
  dot,
  customBg,
  customColor,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  customBg?: string;
  customColor?: string;
}) {
  const sizeClass = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  const style = variant === 'custom' && customBg ? { backgroundColor: customBg, color: customColor } : undefined;
  const className = `inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClass} ${variant !== 'custom' ? variantStyles[variant] : ''}`;

  return (
    <span className={className} style={style}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}
