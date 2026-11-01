import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';
import { Button } from '../ui/Button';

type LdapSyncInfo = {
  enabled: boolean;
  read_account: boolean;
  running: boolean;
  interval_minutes: number;
  last: {
    finished_at: string;
    ok: boolean;
    stats?: {
      directory: number;
      created: number;
      updated: number;
      archived: number;
      reactivated: number;
      conflicts: number;
    };
    archive_blocked?: { count: number; limit: number };
  } | null;
};

// ----- IPA directory sync -----
// Hidden unless LDAP is enabled on the server. Shows the outcome of the last run and lets the admin
// run it now, or confirm an archive step the server's safety limit held back.
export function LdapSyncPanel({ onSynced }: { onSynced: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [info, setInfo] = useState<LdapSyncInfo | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ldap-sync', { credentials: 'include' });
      if (res.ok) setInfo(await res.json());
    } catch {
      /* panel just stays hidden */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (force: boolean) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/ldap-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) toast.error(t('ldapSync.busy'));
      else if (!res.ok || !d.status?.ok) toast.error(t('ldapSync.error'));
      else toast.success(t('ldapSync.done'));
      onSynced();
    } catch {
      toast.error(t('ldapSync.error'));
    } finally {
      setSyncing(false);
      load();
    }
  };

  if (!info?.enabled) return null;
  const last = info.last;
  const busy = syncing || info.running;

  return (
    <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--text-primary)]">{t('ldapSync.title')}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {last
              ? t('ldapSync.lastRun', { time: new Date(last.finished_at).toLocaleString() })
              : t('ldapSync.never')}
            {' · '}
            {info.interval_minutes > 0
              ? t('ldapSync.schedule', { minutes: info.interval_minutes })
              : t('ldapSync.manualOnly')}
          </div>
        </div>
        <Button
          variant="secondary"
          leftIcon={<RefreshCw size={14} className={busy ? 'animate-spin' : ''} />}
          disabled={busy}
          onClick={() => run(false)}
        >
          {busy ? t('ldapSync.running') : t('ldapSync.run')}
        </Button>
      </div>

      {last?.ok && last.stats && (
        <div className="mt-2 text-xs text-[var(--text-secondary)]">
          {t('ldapSync.stats', { ...last.stats })}
        </div>
      )}
      {last && !last.ok && <div className="mt-2 text-xs text-danger">{t('ldapSync.failed')}</div>}
      {last?.ok && !!last.stats?.conflicts && (
        <div className="mt-2 text-xs text-warning">
          {t('ldapSync.conflicts', { count: last.stats.conflicts })}
        </div>
      )}
      {last?.ok && last.archive_blocked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-light p-3 text-xs text-warning">
          <span className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t('ldapSync.blocked', { ...last.archive_blocked })}
          </span>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(true)}>
            {t('ldapSync.confirmArchive')}
          </Button>
        </div>
      )}
      {!info.read_account && (
        <div className="mt-2 text-xs text-[var(--text-muted)]">{t('ldapSync.noReadAccount')}</div>
      )}
    </div>
  );
}
