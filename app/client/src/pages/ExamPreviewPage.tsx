import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, X, CheckCircle2 } from 'lucide-react';
import { OtisakHeader, OtisakFooter, QuestionNav, QuestionView } from '../components/otisak';
import { useLang } from '../components/LangProvider';
import { useTheme } from '../components/ThemeProvider';
import { ToggleCluster } from '../components/ToggleCluster';
import type { OtisakExamWithSubject, OtisakQuestionWithAnswers } from '../lib/types';

const ANSWER_LABELS = 'ABCDEFGHIJ';
const TEXT_TYPES = ['open_text', 'ordering', 'matching', 'fill_blank'];

// Staff preview of an exam as students see it. Renders the same QuestionView as the live exam, but
// everything stays in this page: no attempt is created, nothing is saved or sent, no timer runs.
// Questions come from the staff questions endpoint, in canonical order, so "show correct answers"
// can reveal the solution next to each question.
export default function ExamPreviewPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const pageBg = isDark ? 'bg-[#0a0a14]' : 'bg-[#F8FAFC]';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<OtisakExamWithSubject | null>(null);
  const [questions, setQuestions] = useState<OtisakQuestionWithAnswers[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [matchingSelectedLeft, setMatchingSelectedLeft] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const session = await fetch('/api/auth/session', { credentials: 'include' }).then((r) =>
          r.json(),
        );
        if (!session.authenticated || session.user?.role === 'student') {
          navigate('/dashboard', { replace: true });
          return;
        }
        const [examsRes, qRes] = await Promise.all([
          fetch('/api/otisak/exams', { credentials: 'include' }),
          fetch(`/api/otisak/exams/${examId}/questions`, { credentials: 'include' }),
        ]);
        if (!examsRes.ok || !qRes.ok) {
          navigate('/manage', { replace: true });
          return;
        }
        const found = ((await examsRes.json()).exams || []).find(
          (e: OtisakExamWithSubject) => e.id === examId,
        );
        if (!found) {
          navigate('/manage', { replace: true });
          return;
        }
        setExam(found);
        setQuestions((await qRes.json()).questions || []);
      } catch {
        navigate('/manage', { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [examId, navigate]);

  const close = () => navigate(`/manage/${examId}/edit`);

  if (loading || !exam) {
    return (
      <div className={`min-h-screen ${pageBg} flex items-center justify-center transition-colors`}>
        <ToggleCluster variant="solid" position="fixed" />
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const question = questions[index];
  const answeredIndices = new Set<number>();
  questions.forEach((q, i) => {
    if (TEXT_TYPES.includes(q.type) ? textAnswers[q.id]?.trim() : answers[q.id]?.length)
      answeredIndices.add(i);
  });

  const selectAnswer = (answerId: string) => {
    if (!question) return;
    setAnswers((prev) => {
      const current = prev[question.id] || [];
      const deselecting = current.includes(answerId);
      const next = question.multi_answer
        ? deselecting
          ? current.filter((id) => id !== answerId)
          : [...current, answerId]
        : deselecting
          ? []
          : [answerId];
      return { ...prev, [question.id]: next };
    });
  };

  const goTo = (i: number) => {
    setIndex(i);
    setMatchingSelectedLeft(null);
  };

  return (
    <div
      className={`min-h-screen ${pageBg} flex flex-col relative overflow-hidden transition-colors`}
    >
      <div className="fixed inset-0 pointer-events-none">
        <div
          className={`absolute top-0 left-0 w-full h-full blur-[120px] ${isDark ? 'bg-[radial-gradient(circle_at_0%_50%,_rgba(59,130,246,0.15),_transparent_50%)]' : 'bg-[radial-gradient(circle_at_0%_50%,_rgba(96,165,250,0.18),_transparent_50%)]'}`}
        />
        <div
          className={`absolute bottom-0 right-0 w-full h-full blur-[120px] ${isDark ? 'bg-[radial-gradient(circle_at_100%_50%,_rgba(59,130,246,0.15),_transparent_50%)]' : 'bg-[radial-gradient(circle_at_100%_50%,_rgba(99,102,241,0.18),_transparent_50%)]'}`}
        />
      </div>

      <OtisakHeader
        centerContent={
          <div
            title={`${t('preview.banner')}${exam.shuffle_questions || exam.shuffle_answers ? ` ${t('preview.shuffleNote')}` : ''}`}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-full border text-xs font-semibold uppercase tracking-wider ${isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
          >
            <Eye className="w-3.5 h-3.5" />
            {t('preview.title')} · {exam.duration_minutes} {t('manage.minShort')}
          </div>
        }
        actionButton={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-pressed={reveal}
              title={t('preview.showCorrect')}
              className={`inline-flex items-center gap-1.5 h-9 sm:h-10 px-3 rounded-lg border text-xs font-medium transition-colors ${
                reveal
                  ? isDark
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : isDark
                    ? 'border-white/10 bg-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    : 'border-slate-200 bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">{t('preview.answersToggle')}</span>
            </button>
            <button
              type="button"
              onClick={close}
              className={`inline-flex items-center gap-1.5 h-9 sm:h-10 px-3 sm:px-4 rounded-lg border text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors ${isDark ? 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('preview.close')}</span>
            </button>
          </div>
        }
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 z-10 flex flex-col justify-center min-h-[400px] sm:min-h-[500px]">
        {question ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <QuestionView
                  question={question}
                  index={index}
                  total={questions.length}
                  selected={answers[question.id] || []}
                  textAnswer={textAnswers[question.id]}
                  onSelectAnswer={selectAnswer}
                  onTextAnswer={(value) =>
                    setTextAnswers((prev) => ({ ...prev, [question.id]: value }))
                  }
                  matchingSelectedLeft={matchingSelectedLeft}
                  setMatchingSelectedLeft={setMatchingSelectedLeft}
                />
                {reveal && <Solution question={question} isDark={isDark} />}
              </motion.div>
            </AnimatePresence>

            <QuestionNav
              totalQuestions={questions.length}
              currentIndex={index}
              answeredQuestions={answeredIndices}
              onSelect={goTo}
              onNext={() => index < questions.length - 1 && goTo(index + 1)}
              onPrev={() => index > 0 && goTo(index - 1)}
            />
          </>
        ) : (
          <div className={`text-center py-20 ${subText}`}>
            <p>{t('exam.noQuestions')}</p>
          </div>
        )}
      </main>

      <OtisakFooter />
    </div>
  );
}

function parseContent(content: string | null): Record<string, unknown> {
  try {
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

// The answer key for one question, shown under it when "show correct answers" is on.
function Solution({ question, isDark }: { question: OtisakQuestionWithAnswers; isDark: boolean }) {
  const { t } = useLang();
  const c = parseContent(question.content);
  let title = t('preview.correct');
  let body: ReactNode;

  if (question.type === 'open_text') {
    title = t('preview.manualGrading');
    body = question.ai_grading_instructions ? (
      <p className="whitespace-pre-wrap">{question.ai_grading_instructions}</p>
    ) : null;
  } else if (question.type === 'ordering') {
    title = t('preview.correctOrder');
    body = (
      <ol className="list-decimal pl-5 space-y-0.5">
        {((c.items as string[]) || []).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    );
  } else if (question.type === 'matching') {
    const left = (c.left as string[]) || [];
    const right = (c.right as string[]) || [];
    title = t('preview.correctPairs');
    body = (
      <ul className="space-y-0.5">
        {left.map((l, i) => (
          <li key={i}>
            {l} &#8594; {right[i]}
          </li>
        ))}
      </ul>
    );
  } else if (question.type === 'fill_blank') {
    title = t('preview.correctBlanks');
    body = (
      <ul className="space-y-0.5">
        {((c.blanks as Array<{ id: string; correct?: string }>) || []).map((b) => (
          <li key={b.id}>
            <span className="font-mono">{b.id}</span>: {b.correct}
          </li>
        ))}
      </ul>
    );
  } else {
    const correct = question.answers
      .map((a, i) => (a.is_correct ? `${ANSWER_LABELS[i] || i + 1}. ${a.text}` : null))
      .filter(Boolean);
    body = (
      <ul className="space-y-0.5">
        {correct.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className={`-mt-2 mb-6 rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-green-500/25 bg-green-500/[0.06] text-green-200' : 'border-green-200 bg-green-50 text-green-800'}`}
    >
      <div className="flex items-center gap-2 font-semibold mb-1">
        <CheckCircle2 className="w-4 h-4" />
        {title}
      </div>
      {body}
      {question.explanation && (
        <p
          className={`mt-2 text-xs whitespace-pre-wrap ${isDark ? 'text-green-200/70' : 'text-green-900/70'}`}
        >
          {question.explanation}
        </p>
      )}
    </div>
  );
}
