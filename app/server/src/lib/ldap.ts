import { readFileSync } from 'fs';
import { Client, InvalidCredentialsError } from 'ldapts';
import { logger } from './logger';
import type { UserRole } from '../db/types';

// Direct FreeIPA/LDAP authentication. We bind AS the user (uid=<login>,cn=users,...) with the
// supplied password — a successful bind proves the credentials, no service/bind account needed.
// While bound, we self-read the entry (cn/mail/memberOf) to provision an OTISAK account and derive
// the role from IPA group membership. Enable by setting LDAP_ENABLED + LDAP_URL + LDAP_BASE_DN.

export type LdapProfile = {
  uid: string;
  name: string | null;
  email: string;
  role: UserRole;
  indexNumber: string | null;
};

export class LdapUnavailableError extends Error {}

const bool = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v || '');
const csv = (v: string | undefined) =>
  (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const URL = process.env.LDAP_URL || '';                       // ldaps://192.168.1.247:636
const BASE_DN = process.env.LDAP_BASE_DN || '';               // dc=labs,dc=acs,dc=uns,dc=ac,dc=rs
const DN_TEMPLATE = process.env.LDAP_USER_DN_TEMPLATE || 'uid={uid},cn=users,cn=accounts,{base}';
const DOMAIN = process.env.LDAP_DOMAIN || '';                 // labs.acs.uns.ac.rs (email fallback)
const CA_FILE = process.env.LDAP_CA_FILE || '';               // /etc/otisak/ipa-ca.crt (verifies ldaps)
const TLS_INSECURE = bool(process.env.LDAP_TLS_INSECURE);     // skip cert verify (dev only)
const ADMIN_GROUPS = csv(process.env.LDAP_ADMIN_GROUPS) .length ? csv(process.env.LDAP_ADMIN_GROUPS) : ['admins'];
const PROFESSOR_GROUPS = csv(process.env.LDAP_PROFESSOR_GROUPS).length ? csv(process.env.LDAP_PROFESSOR_GROUPS) : ['professors'];
const ASSISTANT_GROUPS = csv(process.env.LDAP_ASSISTANT_GROUPS).length ? csv(process.env.LDAP_ASSISTANT_GROUPS) : ['assistants'];
const TIMEOUT = Number(process.env.LDAP_TIMEOUT_MS || 8000);
// Directory lookup without the user's password (the index-number exam join, see lookupLdapStudent).
// Optional read account (FreeIPA sysaccount): without it the search is anonymous, and FreeIPA then
// hides group membership, mail and the lock flag.
const BIND_DN = process.env.LDAP_BIND_DN || '';
const BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD || '';
const USERS_BASE = process.env.LDAP_USERS_BASE || '';         // default cn=users,cn=accounts,<base>
// What a student login (= index number) looks like, e.g. e223-2026, in15-2023. Used to tell students
// from staff when the anonymous search cannot see groups.
const STUDENT_UID_RE = new RegExp(process.env.LDAP_STUDENT_UID_PATTERN || '^[a-z]{1,6}[0-9]{1,6}-[0-9]{4}$');

export function ldapEnabled(): boolean {
  return bool(process.env.LDAP_ENABLED) && !!URL && !!BASE_DN;
}

// FreeIPA login names: letters, digits, dot, underscore, dash. Reject anything that could inject
// into the bind DN (commas, equals, parens, spaces, ...).
const UID_RE = /^[a-zA-Z0-9._-]{1,64}$/;

const TLS_SERVERNAME = process.env.LDAP_TLS_SERVERNAME || ''; // SNI / cert-hostname override (when URL uses an IP)

function tlsOptions(): Record<string, unknown> | undefined {
  if (!URL.startsWith('ldaps://')) return undefined;
  const opts: Record<string, unknown> = {};
  // When LDAP_URL is an IP but the server cert is issued for the hostname, verification fails on the
  // hostname check. Setting LDAP_TLS_SERVERNAME makes TLS verify against that name instead (like
  // connecting by hostname). Preferred: just use the hostname in LDAP_URL so DNS + SNI line up.
  if (TLS_SERVERNAME) opts.servername = TLS_SERVERNAME;
  if (TLS_INSECURE) {
    opts.rejectUnauthorized = false;
    return opts;
  }
  if (CA_FILE) {
    try {
      opts.ca = readFileSync(CA_FILE);
    } catch (err) {
      logger.error({ err, CA_FILE }, 'ldap: cannot read LDAP_CA_FILE, falling back to system CAs');
    }
  }
  return Object.keys(opts).length ? opts : undefined; // else verify against the system trust store
}

const first = (v: unknown): string | undefined =>
  Array.isArray(v) ? (v[0] as string | undefined) : (v as string | undefined);

function groupCns(memberOf: unknown): string[] {
  const arr = Array.isArray(memberOf) ? memberOf : memberOf ? [memberOf] : [];
  return (arr as string[])
    .map((dn) => {
      const m = /^cn=([^,]+)/i.exec(String(dn));
      return m ? m[1].toLowerCase() : '';
    })
    .filter(Boolean);
}

function roleFor(cns: string[]): UserRole {
  // Precedence high -> low: admin, professor, assistant, else student.
  if (cns.some((g) => ADMIN_GROUPS.includes(g))) return 'admin';
  if (cns.some((g) => PROFESSOR_GROUPS.includes(g))) return 'professor';
  if (cns.some((g) => ASSISTANT_GROUPS.includes(g))) return 'assistant';
  return 'student';
}

// Index number as typed ("IN 15/2023") -> FreeIPA login ("in15-2023").
export function indexToUid(raw: string): string {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\//g, '-');
}

// Finds a STUDENT in the directory by index number, without their password. Used when a student
// joins an exam by index and has no OTISAK account yet, so the account can be created on the spot.
// Returns null when there is no such student, when the entry belongs to staff, or when it is locked.
// With LDAP_BIND_DN set the role comes from group membership like at login; on an anonymous search
// FreeIPA hides the groups, so only a login shaped like an index number counts as a student.
// Throws LdapUnavailableError if the directory can't be reached or the read account is rejected.
export async function lookupLdapStudent(rawIndex: string): Promise<LdapProfile | null> {
  if (!ldapEnabled()) return null;
  const uid = indexToUid(rawIndex);
  if (!UID_RE.test(uid)) return null;

  const client = new Client({ url: URL, timeout: TIMEOUT, connectTimeout: TIMEOUT, tlsOptions: tlsOptions() });
  try {
    if (BIND_DN && BIND_PASSWORD) await client.bind(BIND_DN, BIND_PASSWORD);
    // uid passed UID_RE (no parentheses, asterisks or backslashes), so it is safe in the filter.
    const { searchEntries } = await client.search(USERS_BASE || `cn=users,cn=accounts,${BASE_DN}`, {
      scope: 'one',
      filter: `(uid=${uid})`,
      sizeLimit: 1,
      attributes: ['uid', 'cn', 'displayName', 'mail', 'memberOf', 'nsAccountLock'],
    });
    const e = searchEntries[0] as Record<string, unknown> | undefined;
    if (!e) return null;
    if (/^true$/i.test(String(first(e.nsAccountLock) || ''))) return null;

    const groups = groupCns(e.memberOf);
    if (groups.length) {
      if (roleFor(groups) !== 'student') return null;
    } else if (!STUDENT_UID_RE.test(uid)) {
      return null;
    }
    const name = first(e.displayName) || first(e.cn) || null;
    const email = (first(e.mail) || (DOMAIN ? `${uid}@${DOMAIN}` : `${uid}@ldap.local`)).toLowerCase();
    return { uid, name, email, role: 'student', indexNumber: uid };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 32) return null; // no such object
    logger.error({ err }, 'ldap: student lookup failed');
    throw new LdapUnavailableError('directory service unavailable');
  } finally {
    try {
      await client.unbind();
    } catch {
      /* ignore unbind errors */
    }
  }
}

// Returns the profile on valid credentials, null on bad credentials / unknown user.
// Throws LdapUnavailableError if the directory can't be reached (so the route can 502, not 401).
export async function authenticateLdap(rawUid: string, password: string): Promise<LdapProfile | null> {
  if (!ldapEnabled()) return null;
  const uid = (rawUid || '').trim().toLowerCase();
  if (!UID_RE.test(uid) || !password) return null;

  const userDN = DN_TEMPLATE.replace('{uid}', uid).replace('{base}', BASE_DN);
  const client = new Client({ url: URL, timeout: TIMEOUT, connectTimeout: TIMEOUT, tlsOptions: tlsOptions() });

  try {
    await client.bind(userDN, password); // throws on bad password / missing DN
    const { searchEntries } = await client.search(userDN, {
      scope: 'base',
      filter: '(objectClass=*)',
      attributes: ['uid', 'cn', 'displayName', 'mail', 'memberOf'],
    });
    const e = (searchEntries[0] || {}) as Record<string, unknown>;
    const name = first(e.displayName) || first(e.cn) || null;
    const email = (first(e.mail) || (DOMAIN ? `${uid}@${DOMAIN}` : `${uid}@ldap.local`)).toLowerCase();
    const role = roleFor(groupCns(e.memberOf));
    return { uid, name, email, role, indexNumber: role === 'student' ? uid : null };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // 49 = invalid credentials, 32 = no such object (unknown uid) -> plain auth failure
    if (err instanceof InvalidCredentialsError || code === 49 || code === 32) return null;
    logger.error({ err }, 'ldap: directory unreachable / bind error');
    throw new LdapUnavailableError('directory service unavailable');
  } finally {
    try {
      await client.unbind();
    } catch {
      /* ignore unbind errors */
    }
  }
}
