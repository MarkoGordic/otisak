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
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}
