-- OTISAK Standalone Database Schema
-- ========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- USERS & AUTH
-- ========================================

CREATE TYPE user_role AS ENUM ('admin', 'assistant', 'student');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  index_number TEXT,
  role user_role NOT NULL DEFAULT 'student',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ========================================
-- OTISAK SUBJECTS
-- ========================================

CREATE TABLE otisak_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subject assignments (professor/assistant per subject)
CREATE TABLE subject_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES otisak_subjects(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('professor', 'assistant')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, subject_id)
);

-- ========================================
-- OTISAK EXAMS
-- ========================================

CREATE TABLE otisak_exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  subject_id UUID REFERENCES otisak_subjects(id) ON DELETE SET NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  allow_review BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_answers BOOLEAN NOT NULL DEFAULT FALSE,
  pass_threshold NUMERIC NOT NULL DEFAULT 50,
  max_points NUMERIC NOT NULL DEFAULT 0,
  exam_mode TEXT NOT NULL DEFAULT 'real' CHECK (exam_mode IN ('real', 'practice')),
  self_service BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_interval_minutes INTEGER,
  auto_activate BOOLEAN NOT NULL DEFAULT FALSE,
  uses_question_bank BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  parent_exam_id UUID REFERENCES otisak_exams(id) ON DELETE CASCADE,
  negative_points_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  negative_points_value NUMERIC NOT NULL DEFAULT 0,
  negative_points_threshold INTEGER NOT NULL DEFAULT 1,
  partial_scoring BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otisak_exams_status ON otisak_exams(status);
CREATE INDEX idx_otisak_exams_subject ON otisak_exams(subject_id);
CREATE INDEX idx_otisak_exams_parent ON otisak_exams(parent_exam_id);

-- ========================================
-- OTISAK QUESTIONS
-- ========================================

CREATE TABLE otisak_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'code', 'image', 'open_text', 'ordering', 'matching', 'fill_blank')),
  text TEXT NOT NULL,
  content TEXT,
  points NUMERIC NOT NULL DEFAULT 2,
  position INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  ai_grading_instructions TEXT,
  bank_question_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otisak_questions_exam ON otisak_questions(exam_id);

-- ========================================
-- OTISAK ANSWERS
-- ========================================

CREATE TABLE otisak_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES otisak_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_otisak_answers_question ON otisak_answers(question_id);

-- ========================================
-- OTISAK ENROLLMENTS
-- ========================================

CREATE TABLE otisak_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id, user_id)
);

-- ========================================
-- OTISAK ATTEMPTS
-- ========================================

CREATE TABLE otisak_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  submitted BOOLEAN NOT NULL DEFAULT FALSE,
  total_points NUMERIC NOT NULL DEFAULT 0,
  max_points NUMERIC NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  ai_grading_status TEXT CHECK (ai_grading_status IN ('pending', 'grading', 'graded', 'partial')),
  ip_address TEXT,
  user_agent TEXT,
  is_practice BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_seed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_otisak_attempts_exam ON otisak_attempts(exam_id);
CREATE INDEX idx_otisak_attempts_user ON otisak_attempts(user_id);

-- ========================================
-- OTISAK ATTEMPT ANSWERS
-- ========================================

CREATE TABLE otisak_attempt_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES otisak_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES otisak_questions(id) ON DELETE CASCADE,
  selected_answer_id UUID REFERENCES otisak_answers(id) ON DELETE SET NULL,
  selected_answer_ids UUID[] NOT NULL DEFAULT '{}',
  points_awarded NUMERIC NOT NULL DEFAULT 0,
  text_answer TEXT,
  ai_grading_status TEXT CHECK (ai_grading_status IN ('pending', 'grading', 'graded', 'error')),
  ai_feedback TEXT,
  ai_graded_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attempt_id, question_id)
);

-- ========================================
-- QUESTION BANK
-- ========================================

CREATE TABLE otisak_question_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES otisak_subjects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'code', 'image', 'open_text')),
  text TEXT NOT NULL,
  points NUMERIC NOT NULL DEFAULT 1,
  tags TEXT[] NOT NULL DEFAULT '{}',
  code_snippet TEXT,
  code_language TEXT,
  image_url TEXT,
  ai_grading_instructions TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otisak_qb_subject ON otisak_question_bank(subject_id);
CREATE INDEX idx_otisak_qb_tags ON otisak_question_bank USING GIN(tags);

CREATE TABLE otisak_question_bank_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES otisak_question_bank(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0
);

-- ========================================
-- EXAM TAG RULES
-- ========================================

CREATE TABLE otisak_exam_tag_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 5,
  points_per_question NUMERIC NOT NULL DEFAULT 2,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- AI GRADING SETTINGS
-- ========================================

CREATE TABLE otisak_exam_ai_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID UNIQUE NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  ai_provider TEXT NOT NULL DEFAULT 'claude',
  api_key_encrypted TEXT,
  grading_mode TEXT NOT NULL DEFAULT 'deferred',
  allow_student_api_keys BOOLEAN NOT NULL DEFAULT FALSE,
  max_student_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_ai_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_provider TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ai_provider)
);

CREATE TABLE ai_credit_allowances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  max_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_credit_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES otisak_exams(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES otisak_attempts(id) ON DELETE SET NULL,
  ai_provider TEXT NOT NULL,
  key_source TEXT NOT NULL DEFAULT 'server',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- GROUPS (for student enrollment)
-- ========================================

CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  year INTEGER NOT NULL,
  academic_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

CREATE TABLE subject_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES otisak_subjects(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  UNIQUE(subject_id, group_id)
);

-- ========================================
-- EXAM EVENTS (activity tracking)
-- ========================================

CREATE TABLE otisak_exam_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES otisak_exams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exam_events_exam ON otisak_exam_events(exam_id);

-- ========================================
-- SEED: Default admin user
-- Password: admin123 (bcrypt hash)
-- ========================================

-- Default admin: admin@otisak.local / admin123
-- Generate new hash: node -e "require('bcryptjs').hash('admin123',10).then(console.log)"
INSERT INTO users (email, password_hash, name, role) VALUES
  ('admin@otisak.local', '$2a$10$O0OB15ON/cB19RiHEC/SXOTs/Zz4gc6WANwYaDz.zCFuTlBuOBz7.', 'Admin', 'admin');
