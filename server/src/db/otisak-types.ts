// OTISAK Database Types
// ========================================

export type OtisakExamMode = 'real' | 'practice';

export interface OtisakSubject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OtisakExam {
  id: string;
  title: string;
  subject_id: string | null;
  description: string | null;
  duration_minutes: number;
  scheduled_at: Date | null;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'archived';
  created_by: string | null;
  allow_review: boolean;
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  pass_threshold: number;
  max_points: number;
  exam_mode: OtisakExamMode;
  self_service: boolean;
  repeat_interval_minutes: number | null;
  auto_activate: boolean;
  uses_question_bank: boolean;
  is_public: boolean;
  parent_exam_id: string | null;
  negative_points_enabled: boolean;
  negative_points_value: number;
  negative_points_threshold: number;
  partial_scoring: boolean;
  exam_started_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OtisakExamWithSubject extends OtisakExam {
  subject_name: string | null;
  subject_code: string | null;
  question_count: number;
}

export type OtisakQuestionType = 'text' | 'code' | 'image' | 'open_text' | 'ordering' | 'matching' | 'fill_blank';

export interface OtisakQuestion {
  id: string;
  exam_id: string;
  type: OtisakQuestionType;
  text: string;
  content: string | null;
  points: number;
  position: number;
  explanation: string | null;
  ai_grading_instructions: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OtisakAnswer {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number;
}

export interface OtisakQuestionWithAnswers extends OtisakQuestion {
  answers: OtisakAnswer[];
  multi_answer?: boolean;
}

export interface OtisakEnrollment {
  id: string;
  exam_id: string;
  user_id: string;
  enrolled_at: Date;
}

export type OtisakAiGradingStatus = 'pending' | 'grading' | 'graded' | 'error';
export type OtisakAttemptAiStatus = 'pending' | 'grading' | 'graded' | 'partial';

export interface OtisakAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  started_at: Date;
  finished_at: Date | null;
  submitted: boolean;
  total_points: number;
  max_points: number;
  time_spent_seconds: number;
  xp_earned: number;
  ai_grading_status: OtisakAttemptAiStatus | null;
  ip_address: string | null;
  user_agent: string | null;
  is_practice: boolean;
  shuffle_seed: number;
}

export interface OtisakAttemptWithExam extends OtisakAttempt {
  exam_title: string;
  subject_name: string | null;
  pass_threshold: number;
}

export interface OtisakAttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answer_id: string | null;
  selected_answer_ids: string[];
  points_awarded: number;
  text_answer: string | null;
  ai_grading_status: OtisakAiGradingStatus | null;
  ai_feedback: string | null;
  ai_graded_at: Date | null;
  answered_at: Date;
}

// DTOs

export interface CreateOtisakExamInput {
  title: string;
  subject_id?: string;
  description?: string;
  duration_minutes: number;
  scheduled_at?: string;
  allow_review?: boolean;
  shuffle_questions?: boolean;
  shuffle_answers?: boolean;
  pass_threshold?: number;
  exam_mode?: OtisakExamMode;
  self_service?: boolean;
  repeat_interval_minutes?: number;
  auto_activate?: boolean;
  uses_question_bank?: boolean;
  is_public?: boolean;
  negative_points_enabled?: boolean;
  negative_points_value?: number;
  negative_points_threshold?: number;
  partial_scoring?: boolean;
  tag_rules?: CreateOtisakExamTagRuleInput[];
}

export interface OtisakExamTagRule {
  id: string;
  exam_id: string;
  tag: string;
  question_count: number;
  points_per_question: number;
  position: number;
  created_at: Date;
}

export interface CreateOtisakExamTagRuleInput {
  tag: string;
  question_count: number;
  points_per_question?: number;
}

export interface CreateOtisakQuestionInput {
  type: OtisakQuestionType;
  text: string;
  content?: string;
  points?: number;
  position?: number;
  explanation?: string;
  ai_grading_instructions?: string;
  answers: Array<{
    text: string;
    is_correct: boolean;
    position?: number;
  }>;
}

export interface SubmitAttemptAnswerInput {
  question_id: string;
  selected_answer_id: string | null;
  selected_answer_ids?: string[];
  text_answer?: string;
}

export interface OtisakExamResults {
  attempt: OtisakAttempt;
  exam: OtisakExam;
  questions: Array<{
    question: OtisakQuestion;
    answers: OtisakAnswer[];
    selected_answer_id: string | null;
    selected_answer_ids: string[];
    points_awarded: number;
    correct_answer_id: string | null;
    correct_answer_ids: string[];
    text_answer: string | null;
    ai_grading_status: OtisakAiGradingStatus | null;
    ai_feedback: string | null;
  }>;
}

export type AiProvider = 'claude' | 'openai';
export type AiGradingMode = 'immediate' | 'deferred';

export interface OtisakExamAiSettings {
  id: string;
  exam_id: string;
  ai_provider: AiProvider;
  api_key_encrypted: string | null;
  grading_mode: AiGradingMode;
  allow_student_api_keys: boolean;
  max_student_credits: number;
  created_at: Date;
  updated_at: Date;
}
