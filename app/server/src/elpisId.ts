import { getSetting } from './db/settings';

// ---------------------------------------------------------------------------
// Optional ELPIS ID (OAuth 2.0 / OIDC) integration.
//
// The ENTIRE feature is dormant unless an operator explicitly turns it on. When
// `ELPIS_ID_ENABLED` is not truthy, or the OAuth client credentials are absent,
// `getElpisConfig()` returns null and:
//   - the "Continue with ELPIS ID" button never renders (GET /status → false),
//   - the /api/auth/elpis/* login routes return 404,
//   - the /integration/* federation endpoints are not mounted.
//
// This keeps otisak's core universal and infra-agnostic: no ELPIS/gordic.rs
// specifics live in committed code — only in env. Every existing deployment
// that ships zero ELPIS_ID_* vars behaves exactly as it did before.
// ---------------------------------------------------------------------------

function envFlag(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function envStr(name: string): string {
  return (process.env[name] || '').trim();
}

function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

export type ElpisConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Canonical redirect URI. Empty unless ELPIS_ID_REDIRECT_URI is set explicitly;
   *  otherwise the login route derives it per-request from the incoming Host so a
   *  user on otisak.gordic.ch stays on .ch (each derived URI must be registered
   *  with ELPIS ID). */
  redirectUri: string;
  scopes: string;
  jwksUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  /** Optional allowlist of caller client_ids permitted to hit the /integration
   *  WRITE endpoints (create/link/unlink). Empty → any valid scope=client token
   *  is accepted (parity with the read-only summary endpoint). */
  allowedClients: string[];
  /** HMAC secret for the push-webhook receiver (POST /integration/events).
   *  Empty → the receiver stays 404 (dormant-unless-configured). */
  webhookSecret: string;
};

/**
 * Returns the resolved ELPIS ID config, or null when the feature is not enabled
 * / not fully configured. Cheap enough to call per-request (pure env reads).
 */
export function getElpisConfig(): ElpisConfig | null {
  if (!envFlag('ELPIS_ID_ENABLED')) return null;

  const issuer = trimTrailingSlash(envStr('ELPIS_ID_ISSUER'));
  const clientId = envStr('ELPIS_ID_CLIENT_ID');
  const clientSecret = envStr('ELPIS_ID_CLIENT_SECRET');
  if (!issuer || !clientId || !clientSecret) return null;

  const scopes = envStr('ELPIS_ID_SCOPES') || 'openid profile email';
  const jwksUrl = envStr('ELPIS_ID_JWKS_URL') || `${issuer}/.well-known/jwks.json`;
  const allowedClients = envStr('ELPIS_ID_INTEGRATION_ALLOWED_CLIENTS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri: envStr('ELPIS_ID_REDIRECT_URI'),
    scopes,
    jwksUrl,
    authorizeUrl: `${issuer}/oauth/authorize`,
    tokenUrl: `${issuer}/oauth/token`,
    userinfoUrl: `${issuer}/oauth/userinfo`,
    allowedClients,
    webhookSecret: envStr('ELPIS_ID_WEBHOOK_SECRET'),
  };
}

export function isElpisConfigured(): boolean {
  return getElpisConfig() !== null;
}

// Soft, admin-controlled runtime toggle layered on top of the env config. Lets
// an admin hide the ELPIS ID login button without a redeploy. Defaults to ON
// when the env is configured (so enabling env is enough); an admin can flip it
// off in Settings. Effective login = env configured AND setting !== 'false'.
export const ELPIS_LOGIN_SETTING_KEY = 'elpis_id_login_enabled';

export async function elpisLoginEnabled(): Promise<boolean> {
  if (!isElpisConfigured()) return false;
  const setting = await getSetting(ELPIS_LOGIN_SETTING_KEY);
  return setting !== 'false';
}
