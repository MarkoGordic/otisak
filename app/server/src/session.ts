import { randomUUID } from 'crypto';
import { base64Url, signValue, timingSafeEqual } from './crypto';

export type SessionUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  avatar_url?: string;
  index_number?: string;
};

export type SessionRecord = {
  id: string;
  createdAt: number;
  expiresAt: number;
  user: SessionUser;
};

export const SESSION_COOKIE = 'otisak_session';
export const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type SealedPayload = {
  data: Record<string, unknown>;
  issuedAt: number;
};

// The well-known placeholder that ships in docker-compose.yml. Treat as empty
// because anyone reading the repo would already know it.
const KNOWN_DEFAULT_SECRETS = new Set([
  '',
  'change-me-to-a-random-64-char-string-in-production',
]);

function getSecret(): string {
  const raw = process.env.SESSION_SECRET || '';
  if (KNOWN_DEFAULT_SECRETS.has(raw)) return '';
  if (raw.length < 16) return '';
  return raw;
}

// Public — server startup calls this once and exits if secret is unsafe.
export function assertSessionSecretIsSafe(): void {
  if (!getSecret()) {
    throw new Error(
      'SESSION_SECRET must be set to a non-default value of at least 16 characters. ' +
      'Generate one with: openssl rand -hex 32',
    );
  }
}

export function seal(payload: Record<string, unknown>) {
  const secret = getSecret();
  const body: SealedPayload = { data: payload, issuedAt: Date.now() };
  const encoded = base64Url(JSON.stringify(body));
  // No fallback to unsigned cookies. If secret is missing the server should
  // have refused to start; this is a safety net so we never emit a cookie
  // an attacker could replay.
  if (!secret) throw new Error('Cannot seal session: SESSION_SECRET is unsafe');
  const signature = signValue(encoded, secret);
  return `${encoded}.${signature}`;
}

export function unseal<T extends Record<string, unknown>>(value: string): T | null {
  if (!value) return null;
  const secret = getSecret();
  if (!secret) return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = signValue(encoded, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as SealedPayload;
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function createSessionCookie(user: SessionUser): string {
  const session: SessionRecord = {
    id: randomUUID(),
    createdAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    user,
  };
  return seal({ session });
}

export function parseSessionCookie(cookieValue: string | undefined): SessionRecord | null {
  const payload = unseal<{ session?: SessionRecord }>(cookieValue || '');
  const session = payload?.session || null;
  if (session && session.expiresAt < Date.now()) return null;
  return session;
}
