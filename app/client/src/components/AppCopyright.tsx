

// Small footer line. Rendered inside the sidebar on admin pages and inline at
// the bottom of public pages (login, home). The author name is kept a touch
// more prominent than the rest of the line.
export function AppCopyright({ className = '' }: { className?: string }) {
  return (
    <div
      className={`text-[13px] tracking-wide text-[var(--text-secondary)] opacity-90 select-none ${className}`}
    >
      © <span className="font-semibold">Marko Gordić</span>
    </div>
  );
}
