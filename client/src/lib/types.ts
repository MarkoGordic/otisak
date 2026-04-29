// Client-side types matching the server OtisakExam types
// These are simplified versions used for rendering - actual data comes from API as JSON

export type OtisakExamMode = 'real' | 'practice';
export type OtisakQuestionType = 'text' | 'code' | 'image' | 'open_text' | 'ordering' | 'matching' | 'fill_blank';
export type OtisakAiGradingStatus = 'pending' | 'grading' | 'graded' | 'error';
export type OtisakAttemptAiStatus = 'pending' | 'grading' | 'graded' | 'partial';

export interface OtisakExam {
  id: string;
  title: string;
  subject_id: string | null;
  description: string | null;
  duration_minutes: number;
  scheduled_at: string | null;
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
  exam_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OtisakExamWithSubject extends OtisakExam {
  subject_name: string | null;
  subject_code: string | null;
  question_count: number;
}

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
  created_at: string;
  updated_at: string;
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

export interface OtisakAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
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
