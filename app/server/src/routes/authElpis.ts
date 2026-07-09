import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes, createHash } from 'crypto';
import { base64Url, timingSafeEqual } from '../crypto';
import { seal, unseal, createSessionCookie, SESSION_COOKIE, DEFAULT_TTL_MS } from '../session';
import { requireAuth } from '../middleware';
import { getElpisConfig, elpisLoginEnabled, isElpisConfigured, ElpisConfig } from '../elpisId';
import { findUserByElpisId, linkElpisId, unlinkElpisId, updateLastLogin, syncProfileFromElpis } from '../db/users';

// ---------------------------------------------------------------------------
// "Continue with ELPIS ID" — OAuth 2.0 Authorization Code + PKCE against the
// ELPIS ID provider. Link-only: an ELPIS ID account (`sub`) that isn't already
// linked to an otisak user is refused — never auto-created, never matched by
// email. On success we mint the SAME signed-cookie session that local login
// uses (createSessionCookie), so ELPIS ID and local logins coexist and nobody
// is logged out when the feature is toggled on/off.
//
// The whole router is inert unless the ELPIS_ID_* env is configured: every
// handler short-circuits to 404 via requireElpisEnabled / getElpisConfig.
// ---------------------------------------------------------------------------

const router = Router();

const OAUTH_COOKIE = 'otisak_oauth';
const OAUTH_TTL_MS = 10 * 60 * 1000; // 10 min to complete the round-trip

type OAuthState = {
  v: 1;
  mode: 'login' | 'link';
  state: string;
  verifier: string;
  redirectUri: string;
  returnTo: string;
  // For 'link': the otisak user id that initiated linking, re-checked on callback.
  linkUserId?: string;
  exp: number;
};

type UserInfo = {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
};

// Only allow redirecting back to a local, absolute path — never an absolute URL
// or protocol-relative target (open-redirect guard).
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '';
  return raw;
}

function requestOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  return `${proto.split(',')[0].trim()}://${host}`;
}

// Redirect URI otisak sends to ELPIS ID. Derived per-request from the Host so a
// user on otisak.gordic.ch stays on .ch (every derived URI must be registered
// with the ELPIS ID client). ELPIS_ID_REDIRECT_URI, if set, hard-overrides the
// LOGIN callback only (edge deployments behind a path prefix / fixed origin).
function loginRedirectUri(req: Request, cfg: ElpisConfig): string {
  return cfg.redirectUri || `${requestOrigin(req)}/api/auth/elpis/callback`;
}
function linkRedirectUri(req: Request): string {
  return `${requestOrigin(req)}/api/auth/elpis/link/callback`;
}

function makePkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32)); // 43-char RFC 7636 verifier
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function setOAuthCookie(req: Request, res: Response, state: OAuthState): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(OAUTH_COOKIE, seal(state as unknown as Record<string, unknown>), {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax', // sent on the top-level GET navigation back from the IdP
    maxAge: OAUTH_TTL_MS,
    path: '/api/auth/elpis',
  });
}

function clearOAuthCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/elpis' });
}

function buildAuthorizeUrl(cfg: ElpisConfig, redirectUri: string, state: string, challenge: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: cfg.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${cfg.authorizeUrl}?${p.toString()}`;
}

// Exchange the authorization code for tokens (confidential client:
// client_secret_post) and fetch the user's identity from /oauth/userinfo. We
// trust the server-to-server TLS token response — no local JWT verification is
// needed for login because otisak mints its own session afterwards.
async function exchangeAndFetchUser(
  cfg: ElpisConfig,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<UserInfo> {
  const tokenResp = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: verifier,
    }).toString(),
  });
  if (!tokenResp.ok) {
    throw new Error(`token endpoint returned ${tokenResp.status}`);
  }
  const tokens = (await tokenResp.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('token response missing access_token');

  const userResp = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userResp.ok) {
    throw new Error(`userinfo endpoint returned ${userResp.status}`);
  }
  const info = (await userResp.json()) as UserInfo;
  if (!info.sub) throw new Error('userinfo response missing sub');
  return info;
}

function landingFor(role: string): string {
  return role === 'admin' || role === 'assistant' ? '/admin/home' : '/dashboard';
}

// --- Public status ------------------------------------------------------------
// `enabled`   → env configured AND admin soft-toggle on (drives the login button).
// `configured`→ env configured, regardless of the soft-toggle (lets the admin
//               Settings page tell "not configured" apart from "toggled off").
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ enabled: await elpisLoginEnabled(), configured: isElpisConfigured() });
  } catch (error) {
    return next(error);
  }
});

// --- Begin login -------------------------------------------------------------
router.get('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await elpisLoginEnabled())) return res.status(404).json({ error: 'ELPIS ID login is not enabled' });
    const cfg = getElpisConfig()!;

    const redirectUri = loginRedirectUri(req, cfg);
    const { verifier, challenge } = makePkce();
    const state = base64Url(randomBytes(16));
    const returnTo = safeReturnTo(req.query.returnTo);

    setOAuthCookie(req, res, {
      v: 1, mode: 'login', state, verifier, redirectUri, returnTo, exp: Date.now() + OAUTH_TTL_MS,
    });
    return res.redirect(302, buildAuthorizeUrl(cfg, redirectUri, state, challenge));
  } catch (error) {
    return next(error);
  }
});

// --- Login callback ----------------------------------------------------------
router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = getElpisConfig();
    if (!cfg) return res.redirect(302, '/admin?elpis_error=disabled');

    const sealed = unseal<OAuthState>(req.cookies?.[OAUTH_COOKIE] || '');
    clearOAuthCookie(res);

    if (!sealed || sealed.mode !== 'login' || sealed.exp < Date.now()) {
      return res.redirect(302, '/admin?elpis_error=state');
    }
    if (req.query.error) return res.redirect(302, '/admin?elpis_error=denied');
    if (typeof req.query.state !== 'string' || !timingSafeEqual(req.query.state, sealed.state)) {
      return res.redirect(302, '/admin?elpis_error=state');
    }
    if (typeof req.query.code !== 'string') return res.redirect(302, '/admin?elpis_error=code');

    let info: UserInfo;
    try {
      info = await exchangeAndFetchUser(cfg, req.query.code, sealed.redirectUri, sealed.verifier);
    } catch (e) {
      req.log?.warn({ err: (e as Error).message }, 'elpis: token/userinfo exchange failed');
      return res.redirect(302, '/admin?elpis_error=exchange');
    }

    // Link-only: refuse a sub that isn't already attached to an otisak account.
    const linked = await findUserByElpisId(info.sub);
    if (!linked) return res.redirect(302, '/admin?elpis_error=not_linked');

    // Pull-side profile re-sync: refresh name/email/avatar from ELPIS ID on
    // every login so the local copy can't drift between webhook deliveries.
    // The session cookie below is minted from the refreshed row.
    const user = (await syncProfileFromElpis(info.sub, {
      name: info.name,
      email: info.email,
      avatarUrl: info.picture,
    })) || linked;

    await updateLastLogin(user.id);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(SESSION_COOKIE, createSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
      avatar_url: user.avatar_url || undefined,
      index_number: user.index_number || undefined,
    }), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: DEFAULT_TTL_MS,
      path: '/',
    });

    return res.redirect(302, sealed.returnTo || landingFor(user.role));
  } catch (error) {
    return next(error);
  }
});

// --- Whether the current user already has an ELPIS ID linked -----------------
router.get('/link-status', requireAuth, (req: Request, res: Response) => {
  return res.json({ linked: !!req.user!.elpis_id, configured: isElpisConfigured() });
});

// --- Begin self-link (logged-in user attaches their own ELPIS ID) ------------
router.get('/link', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = getElpisConfig();
    if (!cfg) return res.status(404).json({ error: 'ELPIS ID is not enabled' });

    const redirectUri = linkRedirectUri(req);
    const { verifier, challenge } = makePkce();
    const state = base64Url(randomBytes(16));
    const returnTo = safeReturnTo(req.query.returnTo);

    setOAuthCookie(req, res, {
      v: 1, mode: 'link', state, verifier, redirectUri, returnTo,
      linkUserId: req.user!.id, exp: Date.now() + OAUTH_TTL_MS,
    });
    return res.redirect(302, buildAuthorizeUrl(cfg, redirectUri, state, challenge));
  } catch (error) {
    return next(error);
  }
});

// --- Self-link callback ------------------------------------------------------
router.get('/link/callback', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = getElpisConfig();
    const sealed = unseal<OAuthState>(req.cookies?.[OAUTH_COOKIE] || '');
    clearOAuthCookie(res);

    // Where to send the user afterwards — back where they started self-linking.
    const back = (sealed && sealed.returnTo) || '/dashboard';
    const withParam = (p: string) => (back.includes('?') ? `${back}&${p}` : `${back}?${p}`);

    if (!cfg) return res.redirect(302, withParam('elpis_error=disabled'));
    if (!sealed || sealed.mode !== 'link' || sealed.exp < Date.now()) {
      return res.redirect(302, '/dashboard?elpis_error=state');
    }
    // The user completing the link must be the one who started it.
    if (sealed.linkUserId !== req.user!.id) return res.redirect(302, withParam('elpis_error=state'));
    if (req.query.error) return res.redirect(302, withParam('elpis_error=denied'));
    if (typeof req.query.state !== 'string' || !timingSafeEqual(req.query.state, sealed.state)) {
      return res.redirect(302, withParam('elpis_error=state'));
    }
    if (typeof req.query.code !== 'string') return res.redirect(302, withParam('elpis_error=code'));

    let info: UserInfo;
    try {
      info = await exchangeAndFetchUser(cfg, req.query.code, sealed.redirectUri, sealed.verifier);
    } catch (e) {
      req.log?.warn({ err: (e as Error).message }, 'elpis: link exchange failed');
      return res.redirect(302, withParam('elpis_error=exchange'));
    }

    const result = await linkElpisId(req.user!.id, info.sub);
    if (result === 'already_linked_other') return res.redirect(302, withParam('elpis_error=taken'));
    return res.redirect(302, withParam('elpis_linked=1'));
  } catch (error) {
    return next(error);
  }
});

// --- Unlink own ELPIS ID -----------------------------------------------------
router.post('/unlink', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await unlinkElpisId(req.user!.id);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
