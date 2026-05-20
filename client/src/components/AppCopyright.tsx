

// Small unobtrusive footer line. Rendered inside the sidebar on admin pages
// and inline at the bottom of public pages (login, home).
export function AppCopyright({ className = '' }: { className?: string }) {
  return (
    <div
      className={`text-[10px] tracking-wide text-[var(--text-muted)] opacity-70 select-none ${className}`}
    >
      © Marko Gordić
    </div>
  );
}
