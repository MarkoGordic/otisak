export type BankSubject = { id: string; name: string; code: string | null };

export type BankQuestion = {
  id: string;
  subject_id: string;
  subject_name: string;
  type: string;
  text: string;
  points: number;
  tags: string[];
  code_snippet: string | null;
  code_language: string | null;
  image_url: string | null;
  answers: Array<{ id: string; text: string; is_correct: boolean }>;
  created_at: string;
};

export type BankTagCount = { tag: string; count: number };

// i18n key per question type, shared by the card and the filters.
export const typeLabelKey: Record<string, string> = {
  text: 'questions.multipleChoice',
  code: 'questions.code',
  image: 'questions.image',
  open_text: 'questions.openText',
};
