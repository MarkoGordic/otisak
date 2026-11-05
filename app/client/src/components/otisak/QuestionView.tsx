import { AnswerOption } from './AnswerOption';
import { CodeBlock } from './CodeBlock';
import { useLang } from '../LangProvider';
import { useTheme } from '../ThemeProvider';
import { parseCodeContent } from '../../lib/codeQuestion';
import type { OtisakQuestionWithAnswers } from '../../lib/types';

const ANSWER_LABELS = 'ABCDEFGHIJ';

// One exam question exactly as the student sees it: prompt, media and the answer controls for every
// question type. Purely presentational: the parent owns the answers. Shared by the live exam
// (ExamPage) and the staff preview (ExamPreviewPage), so the preview cannot drift from the real thing.
export function QuestionView({
  question: currentQuestion,
  index,
  total,
  selected,
  textAnswer,
  onSelectAnswer,
  onTextAnswer,
  matchingSelectedLeft,
  setMatchingSelectedLeft,
}: {
  question: OtisakQuestionWithAnswers;
  index: number;
  total: number;
  // Selected answer ids (choice questions).
  selected: string[];
  // Free-form answer: the text itself, or JSON for ordering / matching / fill_blank.
  textAnswer: string | undefined;
  onSelectAnswer: (answerId: string) => void;
  onTextAnswer: (value: string) => void;
  matchingSelectedLeft: string | null;
  setMatchingSelectedLeft: (left: string | null) => void;
}) {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-gray-400' : 'text-slate-500';
  const blueLabel = isDark ? 'text-blue-400/80' : 'text-blue-600/80';
  const surfaceCard = isDark
    ? 'bg-[#131520]/80 border-blue-500/20'
    : 'bg-white border-slate-200 shadow-sm';

  return (
    <>
      <div
        className={`text-[10px] sm:text-xs uppercase tracking-widest mb-3 sm:mb-4 font-medium ${blueLabel}`}
      >
        {t('exam.question', { current: index + 1, total: total })}
        {currentQuestion.points && (
          <span className={`ml-2 ${subText}`}>
            &#8226; {currentQuestion.points}{' '}
            {currentQuestion.points === 1 ? t('exam.point') : t('exam.points')}
          </span>
        )}
      </div>

      <h2 className={`text-lg sm:text-2xl mb-4 sm:mb-6 font-light leading-relaxed ${titleText}`}>
        {currentQuestion.text}
      </h2>

      {currentQuestion.type === 'image' && currentQuestion.content && (
        <div className="mb-6 bg-white p-2 rounded-lg max-w-2xl mx-auto shadow-2xl">
          <img
            src={currentQuestion.content}
            alt="Question content"
            className="w-full h-auto rounded"
          />
        </div>
      )}

      {currentQuestion.type === 'code' &&
        currentQuestion.content &&
        (() => {
          const { snippet, language } = parseCodeContent(currentQuestion.content);
          return <CodeBlock code={snippet} language={language} />;
        })()}

      <div className="space-y-1.5 sm:space-y-2 mb-6 sm:mb-8">
        {currentQuestion.type === 'open_text' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-500/15 flex items-center justify-center">
                  <svg
                    className="w-3.5 h-3.5 text-purple-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <p className="text-purple-300/80 text-xs font-medium uppercase tracking-wider">
                  {t('exam.typeAnswer')}
                </p>
              </div>
              <span className="text-[10px] text-purple-400/40 font-mono">{t('exam.aiGraded')}</span>
            </div>
            <div className="relative">
              <textarea
                value={textAnswer || ''}
                onChange={(e) => onTextAnswer(e.target.value)}
                className={`w-full rounded-xl px-5 py-4 text-sm leading-relaxed focus:outline-none focus:border-purple-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.1)] resize-none min-h-[180px] transition-all border ${isDark ? 'bg-[#131520]/80 border-purple-500/20 text-white placeholder-white/15' : 'bg-white border-purple-200 text-slate-900 placeholder:text-slate-400'}`}
                placeholder={t('exam.answerPlaceholder')}
                rows={8}
              />
              <div className="absolute bottom-3 right-4 text-[10px] text-purple-400/30 font-mono">
                {(textAnswer || '').length} {t('exam.characters')}
              </div>
            </div>
          </div>
        ) : currentQuestion.type === 'ordering' ? (
          (() => {
            const cData = (() => {
              try {
                return JSON.parse(currentQuestion.content || '{}');
              } catch {
                return {};
              }
            })();
            const items: string[] = cData.items || [];
            const currentOrder: string[] = (() => {
              try {
                const p = JSON.parse(textAnswer || '');
                if (Array.isArray(p)) return p;
              } catch {}
              const sh = [...items];
              let s = 0;
              for (let c = 0; c < currentQuestion.id.length; c++)
                s = ((s << 5) - s + currentQuestion.id.charCodeAt(c)) | 0;
              for (let i = sh.length - 1; i > 0; i--) {
                s = (s * 1103515245 + 12345) & 0x7fffffff;
                const j = s % (i + 1);
                [sh[i], sh[j]] = [sh[j], sh[i]];
              }
              return sh;
            })();
            const moveItem = (from: number, to: number) => {
              const o = [...currentOrder];
              const [it] = o.splice(from, 1);
              o.splice(to, 0, it);
              onTextAnswer(JSON.stringify(o));
            };
            return (
              <div className="space-y-2">
                <p className={`text-xs italic mb-2 ${blueLabel}`}>{t('exam.orderItems')}</p>
                {currentOrder.map((item, i) => (
                  <div
                    key={`${item}-${i}`}
                    className={`flex items-center gap-2 rounded-lg px-4 py-3 border ${surfaceCard}`}
                  >
                    <span
                      className={`font-mono text-sm w-6 text-center flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                    >
                      {i + 1}.
                    </span>
                    <span className={`text-sm flex-1 ${titleText}`}>{item}</span>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveItem(i, i - 1)}
                        className={`p-1 rounded disabled:opacity-20 transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                      >
                        <svg
                          className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={i === currentOrder.length - 1}
                        onClick={() => moveItem(i, i + 1)}
                        className={`p-1 rounded disabled:opacity-20 transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                      >
                        <svg
                          className={`w-3.5 h-3.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : currentQuestion.type === 'matching' ? (
          (() => {
            const cData = (() => {
              try {
                return JSON.parse(currentQuestion.content || '{}');
              } catch {
                return {};
              }
            })();
            const left: string[] = cData.left || [];
            const right: string[] = cData.right || [];
            const curMatches: Record<string, string> = (() => {
              try {
                return JSON.parse(textAnswer || '{}');
              } catch {
                return {};
              }
            })();
            const selLeft = matchingSelectedLeft;
            const usedRight = new Set(Object.values(curMatches));
            return (
              <div className="space-y-4">
                <p className={`text-xs italic mb-2 ${blueLabel}`}>{t('exam.matchItems')}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {left.map((item, i) => {
                      const matched = curMatches[item] !== undefined;
                      const active = selLeft === item;
                      // Three styling states (active/matched/idle) × two themes = six combinations.
                      const baseIdle = isDark
                        ? 'border-gray-700 bg-[#131520]/80 text-white hover:border-blue-500/50'
                        : 'border-slate-300 bg-white text-slate-900 hover:border-blue-400';
                      const activeStyle = isDark
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-blue-500 bg-blue-50 text-blue-700';
                      const matchedStyle = isDark
                        ? 'border-green-500/30 bg-green-500/[0.06] text-green-300'
                        : 'border-green-300 bg-green-50 text-green-700';
                      return (
                        <button
                          key={`left-${i}`}
                          type="button"
                          onClick={() => {
                            if (matched) {
                              const nm = { ...curMatches };
                              delete nm[item];
                              onTextAnswer(JSON.stringify(nm));
                              setMatchingSelectedLeft(null);
                            } else {
                              setMatchingSelectedLeft(active ? null : item);
                            }
                          }}
                          className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${active ? activeStyle : matched ? matchedStyle : baseIdle}`}
                        >
                          {item}
                          {matched && (
                            <span
                              className={`block text-[10px] mt-1 ${isDark ? 'text-green-400/60' : 'text-green-600/70'}`}
                            >
                              &#8594; {curMatches[item]}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    {right.map((item, i) => {
                      const used = usedRight.has(item);
                      const usedStyle = isDark
                        ? 'border-green-500/30 bg-green-500/[0.06] text-green-300/50'
                        : 'border-green-200 bg-green-50/70 text-green-600/60';
                      const armedStyle = isDark
                        ? 'border-gray-600 bg-[#131520]/80 text-white hover:border-blue-500/50 cursor-pointer'
                        : 'border-slate-300 bg-white text-slate-900 hover:border-blue-400 cursor-pointer';
                      const idleStyle = isDark
                        ? 'border-gray-700 bg-[#131520]/80 text-gray-400'
                        : 'border-slate-200 bg-slate-50 text-slate-500';
                      return (
                        <button
                          key={`right-${i}`}
                          type="button"
                          disabled={!selLeft || used}
                          onClick={() => {
                            if (selLeft && !used) {
                              const nm = { ...curMatches, [selLeft]: item };
                              onTextAnswer(JSON.stringify(nm));
                              setMatchingSelectedLeft(null);
                            }
                          }}
                          className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${used ? usedStyle : selLeft ? armedStyle : idleStyle}`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        ) : currentQuestion.type === 'fill_blank' ? (
          (() => {
            const cData = (() => {
              try {
                return JSON.parse(currentQuestion.content || '{}');
              } catch {
                return {};
              }
            })();
            const blanks: Array<{ id: string }> = cData.blanks || [];
            const curFills: Record<string, string> = (() => {
              try {
                return JSON.parse(textAnswer || '{}');
              } catch {
                return {};
              }
            })();
            const parts = currentQuestion.text.split(/(___[A-Z0-9_]+___)/g);
            return (
              <div className="space-y-4">
                <div
                  className={`rounded-xl px-5 py-4 text-sm leading-loose border ${surfaceCard} ${titleText}`}
                >
                  {parts.map((part, i) => {
                    const m = part.match(/^___([A-Z0-9_]+)___$/);
                    if (m) {
                      const bid = m[1];
                      return (
                        <input
                          key={`blank-${bid}-${i}`}
                          type="text"
                          value={curFills[bid] || ''}
                          onChange={(e) => {
                            const nf = { ...curFills, [bid]: e.target.value };
                            onTextAnswer(JSON.stringify(nf));
                          }}
                          className={`inline-block w-32 sm:w-40 mx-1 px-3 py-1 border-b-2 text-sm focus:outline-none focus:border-blue-500 transition-colors rounded-t ${isDark ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 placeholder-blue-300/30' : 'bg-blue-50 border-blue-300 text-blue-700 placeholder:text-blue-400/40'}`}
                          placeholder="..."
                        />
                      );
                    }
                    return <span key={`text-${i}`}>{part}</span>;
                  })}
                </div>
                <p className={`text-[10px] ${blueLabel}`}>
                  {blanks.length} {t('exam.blanksToFill')}
                </p>
              </div>
            );
          })()
        ) : (
          <>
            {currentQuestion.multi_answer && (
              <p className={`text-xs italic mb-1 ${blueLabel}`}>{t('exam.selectAll')}</p>
            )}
            {currentQuestion.answers.map((answer, i) => (
              <AnswerOption
                key={answer.id}
                id={answer.id}
                text={answer.text}
                label={ANSWER_LABELS[i] || String(i + 1)}
                selected={selected.includes(answer.id)}
                onSelect={onSelectAnswer}
                multiSelect={currentQuestion.multi_answer}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
