import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'crypto';
import { getElpisConfig } from '../elpisId';

// ---------------------------------------------------------------------------
// Verifies an ELPIS ID `client_credentials` **service token** for the optional
// /integration federation endpoints. This mirrors the guard morava/elpis-stage
// use (RS256 via the shared JWKS, iss + exp + scope==="client"), implemented
// with Node's built-in crypto so otisak pulls in NO extra runtime dependency
// and stays CommonJS-safe.
//
// Deliberately hand-rolled but narrow: only RS256 is accepted and the key is
// always an RSA public key from the JWKS — there is no path where an attacker
// could downgrade to HS256 and have a public key treated as an HMAC secret.
// ---------------------------------------------------------------------------

type Jwk = { kid?: string; kty: string; alg?: string; use?: string; n: string; e: string };
type JwksCache = { keys: Jwk[]; fetchedAt: number };

let cache: JwksCache | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000; // refetch keys at most every 10 min

async function getKeys(jwksUrl: string, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
  const resp = await fetch(jwksUrl);
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
  const body = (await resp.json()) as { keys?: Jwk[] };
  cache = { keys: body.keys || [], fetchedAt: Date.now() };
  return cache.keys;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64urlToJson<T>(s: string): T {
  return JSON.parse(b64urlToBuf(s).toString('utf8')) as T;
}

export type ServiceClaims = {
  iss?: string;
  sub?: string;
  aud?: string;
  scope?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  [k: string]: unknown;
};

export async function verifyServiceToken(token: string): Promise<ServiceClaims> {
  const cfg = getElpisConfig();
  if (!cfg) throw new Error('ELPIS ID not configured');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');

  const header = b64urlToJson<{ alg?: string; kid?: string }>(parts[0]);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');

  // Resolve the signing key by kid; refetch the JWKS once if the kid is unknown
  // (handles key rotation without waiting out the cache TTL).
  let keys = await getKeys(cfg.jwksUrl);
  let jwk = keys.find((k) => (header.kid ? k.kid === header.kid : true));
  if (!jwk) {
    keys = await getKeys(cfg.jwksUrl, true);
    jwk = keys.find((k) => (header.kid ? k.kid === header.kid : true));
  }
  if (!jwk || jwk.kty !== 'RSA') throw new Error('signing key not found');

  const pub = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64urlToBuf(parts[2]);
  if (!cryptoVerify('RSA-SHA256', signingInput, pub, signature)) {
    throw new Error('bad signature');
  }

  const claims = b64urlToJson<ServiceClaims>(parts[1]);
  if (claims.iss !== cfg.issuer) throw new Error('bad issuer');
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('token expired');
  if (claims.scope !== 'client') throw new Error('scope is not "client"');
  return claims;
}
