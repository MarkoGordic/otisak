import { transaction } from '../db/client';
import { getSetting, setSetting } from '../db/settings';
import type { UserRole } from '../db/types';
import { terminateUserSockets } from '../ws/events';
import {
  ldapEnabled,
  ldapFallbackEmail,
  ldapReadAccountConfigured,
  listLdapUsers,
  looksLikeStudentUid,
  type LdapDirectoryEntry,
} from './ldap';
import { logger } from './logger';
import { reportError } from './reportError';

// Directory sync: keeps an OTISAK account for every FreeIPA account, so the whole directory is
// visible (and manageable) in OTISAK before anyone signs in.
//
//   - New directory accounts get an LDAP-only account (password_hash '!', like a first LDAP login).
//     Unknown role (anonymous search hides groups) -> 'student', the least privileged; the real
//     role arrives with the first login.
//   - Existing accounts are matched by ldap_uid, then email, then (students) index number, so CSV
//     imports and pre-LDAP accounts get linked instead of duplicated.
//   - Accounts that left the directory are archived: is_active = FALSE + ldap_archived_at. Nothing
//     is ever deleted, so attempts and results stay. Disabled (locked) directory accounts are
//     archived the same way. The sync reactivates only accounts it archived itself.
//   - Local admins are never demoted, mirroring findOrCreateLdapUser.
//
// Safety: a failed or empty listing changes nothing, all writes run in one transaction, and if the
// run would archive more than LDAP_SYNC_MAX_ARCHIVE_PERCENT of the linked accounts (a directory
// outage or a wrong base DN looks exactly like "everyone left") the archive step is skipped until
// an admin confirms it with force.

const STATUS_KEY = 'ldap_sync_status';
const INTERVAL_MINUTES = Number(process.env.LDAP_SYNC_INTERVAL_MINUTES ?? 60);
const MAX_ARCHIVE_PERCENT = Number(process.env.LDAP_SYNC_MAX_ARCHIVE_PERCENT ?? 10);
// Small directories would trip a pure percentage on a single departure.
const MIN_ARCHIVE_LIMIT = 5;

export type LdapSyncStats = {
  directory: number;
  created: number;
  updated: number;
  linked: number;
  archived: number;
  reactivated: number;
  conflicts: number;
};

export type LdapSyncStatus = {
  started_at: string;
  finished_at: string;
  trigger: 'schedule' | 'manual';
  ok: boolean;
  error?: string;
  read_account: boolean;
  stats?: LdapSyncStats;
  // Set when the archive step was skipped by the safety limit.
  archive_blocked?: { count: number; limit: number };
};

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  index_number: string | null;
  is_active: boolean;
  ldap_uid: string | null;
  ldap_archived_at: Date | null;
  ldap_archived_reason: string | null;
};

const normIndex = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '');

let running = false;

export function ldapSyncRunning(): boolean {
  return running;
}

export function ldapSyncSettings() {
  return {
    interval_minutes: INTERVAL_MINUTES > 0 ? INTERVAL_MINUTES : 0,
    max_archive_percent: MAX_ARCHIVE_PERCENT,
  };
}

export async function getLdapSyncStatus(): Promise<LdapSyncStatus | null> {
  const raw = await getSetting(STATUS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LdapSyncStatus;
  } catch {
    return null;
  }
}

export class LdapSyncBusyError extends Error {}

export async function runLdapSync(opts: {
  trigger: 'schedule' | 'manual';
  force?: boolean;
}): Promise<LdapSyncStatus> {
  if (running) throw new LdapSyncBusyError('directory sync already running');
  running = true;
  const startedAt = new Date().toISOString();
  const base = {
    started_at: startedAt,
    trigger: opts.trigger,
    read_account: ldapReadAccountConfigured(),
  };
  let status: LdapSyncStatus;
  try {
    const entries = await listLdapUsers();
    if (entries.length === 0) {
      // Never treat an empty listing as "everyone left".
      status = {
        ...base,
        finished_at: new Date().toISOString(),
        ok: false,
        error: 'The directory returned no accounts. Nothing was changed.',
      };
    } else {
      const result = await applyDirectory(entries, !!opts.force);
      status = { ...base, finished_at: new Date().toISOString(), ok: true, ...result };
    }
  } catch (err) {
    reportError(err, { source: 'job', context: { job: 'ldapSync', trigger: opts.trigger } });
    status = {
      ...base,
      finished_at: new Date().toISOString(),
      ok: false,
      error: 'The directory could not be read. Nothing was changed.',
    };
  } finally {
    running = false;
  }
  await setSetting(STATUS_KEY, JSON.stringify(status)).catch((err) =>
    reportError(err, { source: 'job', context: { job: 'ldapSync', phase: 'save-status' } }),
  );
  return status;
}

async function applyDirectory(
  entries: LdapDirectoryEntry[],
  force: boolean,
): Promise<Pick<LdapSyncStatus, 'stats' | 'archive_blocked'>> {
  const stats: LdapSyncStats = {
    directory: entries.length,
    created: 0,
    updated: 0,
    linked: 0,
    archived: 0,
    reactivated: 0,
    conflicts: 0,
  };
  let archiveBlocked: LdapSyncStatus['archive_blocked'];
  const archivedIds: string[] = [];
  const archivedUids: string[] = [];

  await transaction(async (client) => {
    const rows = (
      await client.query<Row>(
        `SELECT id, email, name, role, index_number, is_active, ldap_uid,
                ldap_archived_at, ldap_archived_reason
           FROM users`,
      )
    ).rows;
    const byUid = new Map<string, Row>();
    const byEmail = new Map<string, Row>();
    const byIndex = new Map<string, Row>();
    for (const r of rows) {
      if (r.ldap_uid) byUid.set(r.ldap_uid, r);
      byEmail.set(r.email.toLowerCase(), r);
      if (r.index_number) byIndex.set(normIndex(r.index_number), r);
    }

    const seen = new Set<string>();
    for (const e of entries) {
      const studentish = e.role ? e.role === 'student' : looksLikeStudentUid(e.uid);
      const email = e.email ?? ldapFallbackEmail(e.uid);
      const candidate =
        byUid.get(e.uid) ??
        byEmail.get(email.toLowerCase()) ??
        (studentish ? byIndex.get(e.uid) : undefined);

      // A candidate already linked to another directory account, or already claimed in this run,
      // is a data conflict for an admin to resolve, not something to guess at.
      if (
        candidate &&
        ((candidate.ldap_uid && candidate.ldap_uid !== e.uid) || seen.has(candidate.id))
      ) {
        stats.conflicts++;
        logger.warn({ uid: e.uid, userId: candidate.id }, 'ldapSync: account conflict, skipped');
        continue;
      }

      if (!candidate) {
        if (e.locked) continue; // a disabled directory account has nothing to do in OTISAK yet
        const created = (
          await client.query<Row>(
            `INSERT INTO users (email, password_hash, name, role, index_number, ldap_uid, ldap_synced_at)
             VALUES ($1, '!', $2, $3, $4, $5, NOW())
             RETURNING id, email, name, role, index_number, is_active, ldap_uid,
                       ldap_archived_at, ldap_archived_reason`,
            [email, e.name, e.role ?? 'student', studentish ? e.uid : null, e.uid],
          )
        ).rows[0];
        byUid.set(e.uid, created);
        byEmail.set(created.email.toLowerCase(), created);
        if (created.index_number) byIndex.set(normIndex(created.index_number), created);
        seen.add(created.id);
        stats.created++;
        continue;
      }

      seen.add(candidate.id);
      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (col: string, v: unknown) => {
        values.push(v);
        sets.push(`${col} = $${values.length}`);
      };

      if (!candidate.ldap_uid) {
        set('ldap_uid', e.uid);
        stats.linked++;
      }
      if (e.name && e.name !== candidate.name) set('name', e.name);
      // Only a real directory mail replaces the stored one, and only when no other account owns it.
      if (e.email && e.email !== candidate.email.toLowerCase() && !byEmail.has(e.email)) {
        byEmail.delete(candidate.email.toLowerCase());
        byEmail.set(e.email, candidate);
        set('email', e.email);
      }
      const role = e.role && candidate.role !== 'admin' ? e.role : candidate.role;
      if (role !== candidate.role) set('role', role);
      // The login doubles as the index number, but only on what ends up a student account.
      if (role === 'student' && studentish && !candidate.index_number) set('index_number', e.uid);

      if (e.locked) {
        if (candidate.is_active) {
          set('is_active', false);
          set('ldap_archived_at', new Date());
          set('ldap_archived_reason', 'locked');
          archivedIds.push(candidate.id);
          archivedUids.push(e.uid);
          stats.archived++;
        } else if (candidate.ldap_archived_at && candidate.ldap_archived_reason !== 'locked') {
          set('ldap_archived_reason', 'locked'); // back in the directory, but disabled there
        }
      } else if (!candidate.is_active && candidate.ldap_archived_at) {
        set('is_active', true);
        set('ldap_archived_at', null);
        set('ldap_archived_reason', null);
        stats.reactivated++;
      }

      if (sets.length) {
        values.push(candidate.id);
        await client.query(
          `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
          values,
        );
        stats.updated++;
      }
    }

    if (seen.size) {
      await client.query('UPDATE users SET ldap_synced_at = NOW() WHERE id = ANY($1::uuid[])', [
        [...seen],
      ]);
    }

    // Linked, active accounts the directory no longer lists.
    const linkedActive = rows.filter((r) => r.ldap_uid && r.is_active);
    const gone = linkedActive.filter((r) => !seen.has(r.id));
    const limit = Math.max(
      MIN_ARCHIVE_LIMIT,
      Math.ceil((linkedActive.length * MAX_ARCHIVE_PERCENT) / 100),
    );
    if (gone.length > limit && !force) {
      archiveBlocked = { count: gone.length, limit };
      logger.warn(archiveBlocked, 'ldapSync: archive step skipped by the safety limit');
    } else if (gone.length) {
      await client.query(
        `UPDATE users SET is_active = FALSE, ldap_archived_at = NOW(),
                ldap_archived_reason = 'removed', updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [gone.map((r) => r.id)],
      );
      for (const r of gone) {
        archivedIds.push(r.id);
        archivedUids.push(r.ldap_uid as string);
      }
      stats.archived += gone.length;
    }
  });

  // Deactivated accounts lose HTTP access on the next request (findUserById filters is_active);
  // this drops the sockets that are already open.
  for (const id of archivedIds) terminateUserSockets(id);
  if (archivedUids.length) logger.info({ uids: archivedUids }, 'ldapSync: accounts archived');
  logger.info({ ...stats, archiveBlocked }, 'ldapSync: done');
  return { stats, archive_blocked: archiveBlocked };
}

let timer: ReturnType<typeof setInterval> | null = null;
let firstRun: ReturnType<typeof setTimeout> | null = null;

function scheduledRun(): void {
  if (running) return;
  runLdapSync({ trigger: 'schedule' }).catch((err) =>
    reportError(err, { source: 'job', context: { job: 'ldapSync', phase: 'schedule' } }),
  );
}

export function startLdapSyncJob(): void {
  if (timer || !ldapEnabled() || !(INTERVAL_MINUTES > 0)) return;
  // First run shortly after boot rather than inside it, so startup is not held up by the directory.
  firstRun = setTimeout(scheduledRun, 15_000);
  timer = setInterval(scheduledRun, INTERVAL_MINUTES * 60_000);
}

export function stopLdapSyncJob(): void {
  if (firstRun) clearTimeout(firstRun);
  if (timer) clearInterval(timer);
  firstRun = null;
  timer = null;
}
