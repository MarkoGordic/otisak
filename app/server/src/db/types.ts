export type UserRole = 'admin' | 'assistant' | 'student';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  avatar_url: string | null;
  index_number: string | null;
  role: UserRole;
  is_active: boolean;
  /** Optional ELPIS ID (OAuth/OIDC) account link — the OIDC `sub`. NULL for
   *  local-only accounts. Present only when the ELPIS ID feature is used. */
  elpis_id: string | null;
  /** Optional FreeIPA/LDAP account link — the IPA login (uid). NULL for
   *  accounts that never signed in via LDAP. Present only when LDAP is used. */
  ldap_uid: string | null;
  /** Per-user session cutoff: signed cookies minted before this instant are
   *  refused by requireAuth. Set by remote revocation (ELPIS ID webhooks);
   *  NULL when no revocation ever happened. */
  sessions_revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}
