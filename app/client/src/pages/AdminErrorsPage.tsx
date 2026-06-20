import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ScrollText, Search, RefreshCw } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { AppCopyright } from '../components/AppCopyright';
import { api } from '../lib/api';

type UserInfo = { name?: string; role?: string };

type ErrorRow = {
  id: string;
  request_id: string | null;
  source: string;
  status_code: number | null;
  code: string | null;
  name: string | null;
  message: string | null;
  route: string | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
};

type ErrorDetail = ErrorRow & { stack: string | null };

const SOURCE_STYLE: Record<string, string> = {
  http: 'bg-red-500/15 text-red-400',
  client: 'bg-amber-500/15 text-amber-400',
  job: 'bg-blue-500/15 text-blue-400',
  ws: 'bg-purple-500/15 text-purple-400',
  process: 'bg-rose-500/15 text-rose-400',
  db: 'bg-orange-500/15 text-orange-400',
};

function fmtTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AdminErrorsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [queryStr, setQueryStr] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ErrorDetail | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || data.user?.role !== 'admin') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setUser({ name: data.user?.name, role: data.user?.role });
    })();
  }, [navigate]);

  const load = useCallback(async (requestId?: string) => {
    setLoading(true);
    try {
      const q = requestId && requestId.trim() ? `?requestId=${encodeURIComponent(requestId.trim())}` : '?limit=100';
      const data = await api.get<{ errors: ErrorRow[] }>(`/api/admin/errors${q}`);
      setRows(data.errors || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const toggleRow = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    try {
      const data = await api.get<{ entry: ErrorDetail }>(`/api/admin/errors/${id}`);
      setDetail(data.entry);
    } catch {
      setDetail(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                <ScrollText className="w-6 h-6 text-accent" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">Greske i logovi</h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Server i klijent greske. Pretrazi po kodu za prijavu (requestId) koji ti korisnik da.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  value={queryStr}
                  onChange={(e) => setQueryStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') load(queryStr);
                  }}
                  placeholder="Pretrazi po requestId..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm"
                />
              </div>
              <button
                onClick={() => load(queryStr)}
                className="h-10 px-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Osvezi
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-7 h-7 animate-spin text-accent" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)] text-sm">Nema zabelezenih gresaka.</div>
            ) : (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] overflow-hidden">
                {rows.map((r) => (
                  <div key={r.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <button
                      onClick={() => toggleRow(r.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <span className="text-xs text-[var(--text-muted)] font-mono w-[120px] shrink-0">
                        {fmtTime(r.created_at)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                          SOURCE_STYLE[r.source] || 'bg-gray-500/15 text-gray-400'
                        } shrink-0`}
                      >
                        {r.source}
                      </span>
                      <span className="text-xs font-mono text-[var(--text-secondary)] w-[44px] shrink-0">
                        {r.status_code ?? ''}
                      </span>
                      <span className="text-sm text-[var(--text-primary)] truncate flex-1">
                        {r.message || r.code || r.name || '(bez poruke)'}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] hidden sm:block shrink-0">
                        {r.request_id ? r.request_id.slice(0, 8) : ''}
                      </span>
                    </button>
                    {expandedId === r.id && (
                      <div className="px-4 py-3 bg-[var(--bg-tertiary)] text-xs font-mono space-y-2">
                        <Field label="errorId" value={r.id} />
                        <Field label="requestId" value={r.request_id} />
                        <Field label="route" value={r.route} />
                        <Field label="code" value={r.code} />
                        <Field label="user_id" value={r.user_id} />
                        {r.context && Object.keys(r.context).length > 0 && (
                          <Field label="context" value={JSON.stringify(r.context)} />
                        )}
                        <div>
                          <div className="text-[var(--text-muted)] mb-1">stack</div>
                          <pre className="whitespace-pre-wrap break-all text-[var(--text-secondary)] bg-[var(--bg-primary)] rounded p-2 max-h-72 overflow-auto">
                            {detail ? detail.stack || detail.message || '(nema stack-a)' : 'Ucitavanje...'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center">
            <AppCopyright />
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-[var(--text-muted)] w-[80px] shrink-0">{label}</span>
      <span className="text-[var(--text-secondary)] break-all">{value}</span>
    </div>
  );
}
