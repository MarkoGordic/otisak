import React from 'react';
import { reportError } from '../lib/logger';

type Props = { children: React.ReactNode };
type State = { error: Error | null; ref: string | null };

// Short reference code the user can quote to support. Sent to the server as the
// report's requestId, so an admin can look the crash up in /admin/errors by it.
// crypto.randomUUID needs a secure context (https or localhost); fall back to a
// random slug on plain-http LAN deployments.
function makeRef(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through to the slug
  }
  return Array.from({ length: 2 }, () => Math.random().toString(36).slice(2, 8)).join('-');
}

// Top-level error boundary. React renders this fallback for any uncaught
// throw inside the route tree; without it the user gets a blank page and
// no way to recover. The "Pocetna" button lets them get back to a known-
// good state; "Osvezi" reloads in case the failure was transient.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, ref: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const ref = makeRef();
    this.setState({ ref });
    reportError(error, {
      source: 'react-boundary',
      requestId: ref,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { ref } = this.state;
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
          {ref && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(ref)}
              title="Kopiraj kod greske"
              className="text-xs text-[var(--text-muted)] font-mono mb-4 underline decoration-dotted"
            >
              Kod greske: {ref}
            </button>
          )}
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
            >
              Osvezi
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
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
