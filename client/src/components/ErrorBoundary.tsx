import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

// Top-level error boundary. React renders this fallback for any uncaught
// throw inside the route tree; without it the user gets a blank page and
// no way to recover. The "Pocetna" button lets them get back to a known-
// good state; "Osvezi" reloads in case the failure was transient.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-6 text-center">
          <h1 className="text-xl font-display font-bold text-[var(--text-primary)] mb-2">
            Doslo je do greske
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Nesto je poslo po zlu. Pokusaj da osvezis stranicu ili se vrati na pocetnu.
          </p>
          <div className="text-xs text-[var(--text-muted)] font-mono mb-4 break-all">
            {this.state.error.message}
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
            >
              Osvezi
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-lg border border-[var(--border-default)] text-sm font-medium text-[var(--text-primary)]"
            >
              Pocetna
            </button>
          </div>
        </div>
      </div>
    );
  }
}
