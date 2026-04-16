import React from 'react';

export function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-4 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div>
        <div className="text-xl font-display font-bold text-[var(--text-primary)] leading-tight">
          {value}
        </div>
        <div className="text-xs text-[var(--text-muted)]">{label}</div>
      </div>
    </div>
  );
}
