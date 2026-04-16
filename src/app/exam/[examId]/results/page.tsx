'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Check, X, ChevronDown, ChevronUp, Clock, Award, Target } from 'lucide-react';
import { OtisakHeader, OtisakFooter, CodeBlock } from '@/components/otisak';
import type { OtisakExamResults } from '@/lib/db/otisak-types';

type UserInfo = {
  name?: string;
  email?: string;
  avatar_url?: string;
  index_number?: string;
};

const ANSWER_LABELS = 'ABCDEFGHIJ';

export default function ResultsPage() {
  const router = useRouter();
  const { examId } = useParams<{ examId: string }>()!;

  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [results, setResults] = useState<OtisakExamResults | null>(null);
  const [expandedQ, setExpandedQ] = useState<Set<number>>(new Set());
  const [aiGradingStatus, setAiGradingStatus] = useState<string | null>(null);
  const [pollingAi, setPollingAi] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
        if (!sessionRes.ok) { router.replace('/login'); return; }
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated) { router.replace('/login'); return; }

        if (mounted) {
          setUser({
            name: sessionData.user?.name,
            email: sessionData.user?.email,
            avatar_url: sessionData.user?.avatar_url,
            index_number: sessionData.user?.index_number,
          });
        }

        const res = await fetch(`/api/otisak/exams/${examId}/results`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setResults(data.results);
            if (data.results?.attempt?.ai_grading_status === 'pending' || data.results?.attempt?.ai_grading_status === 'grading') {
              setAiGradingStatus(data.results.attempt.ai_grading_status);
              setPollingAi(true);
            } else if (data.results?.attempt?.ai_grading_status) {
              setAiGradingStatus(data.results.attempt.ai_grading_status);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load results:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [examId, router]);

  // Poll for AI grading
  useEffect(() => {
    if (!pollingAi || !results?.attempt?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/results`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const status = data.results?.attempt?.ai_grading_status;
          setAiGradingStatus(status);
          if (status === 'graded' || status === 'partial') {
            setPollingAi(false);
            setResults(data.results);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingAi, results?.attempt?.id, examId]);

  const toggleQuestion = (idx: number) => {
    setExpandedQ((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const expandAll = () => {
    if (!results) return;
    if (expandedQ.size === results.questions.length) setExpandedQ(new Set());
    else setExpandedQ(new Set(results.questions.map((_, i) => i)));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalPoints = Number(results?.attempt?.total_points ?? 0);
  const maxPoints = Number(results?.attempt?.max_points ?? 0);
  const percentage = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const passed = results?.exam ? percentage >= Number(results.exam.pass_threshold) : false;
  const correctCount = results?.questions?.filter((q) => q.points_awarded > 0).length ?? 0;
  const totalQuestions = results?.questions?.length ?? 0;
  const timeSpent = results?.attempt?.time_spent_seconds ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,_rgba(59,130,246,0.15),_transparent_40%)] blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_100%,_rgba(59,130,246,0.15),_transparent_40%)] blur-[100px]" />
      </div>

      <OtisakHeader
        user={user ? { name: user.name || null, index_number: user.index_number || null, avatar_url: user.avatar_url || null } : null}
        centerContent={
          results ? (
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className={`text-2xl sm:text-3xl font-light tracking-[0.2em] uppercase drop-shadow-lg ${
                passed ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]'
              }`}>
              {passed ? 'Passed' : 'Results'}
            </motion.span>
          ) : null
        }
        showDate={false}
      />

      <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-10 z-10 flex flex-col items-center">
        {!results ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">Results not available</p>
            <p className="text-gray-500 text-sm mb-6">Results are being processed...</p>
            <button onClick={() => router.push('/dashboard')} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-2 mx-auto">
              <ArrowLeft className="w-4 h-4" />Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            {/* Score Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="bg-[#1a1c26]/90 border border-gray-800 rounded-xl p-4 sm:p-6 w-full mb-6 shadow-[0_0_30px_rgba(0,0,0,0.3)] backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-gray-400 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium truncate">{results.exam.title}</span>
                  <span className="text-gray-500 text-[10px] sm:text-xs">
                    {percentage}% &#8226; {passed ? 'Passed' : 'Not Passed'}
                    {Number(results.exam.pass_threshold) > 0 && <span className="text-gray-600"> (Threshold {results.exam.pass_threshold}%)</span>}
                  </span>
                </div>
                <div className={`text-3xl sm:text-5xl font-mono tracking-wider font-bold drop-shadow-lg flex-shrink-0 ${
                  passed ? 'text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'text-red-400 drop-shadow-[0_0_15px_rgba(248,113,113,0.4)]'
                }`}>
                  {totalPoints}/{maxPoints}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-3 border-t border-gray-800/50">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Target className="w-3.5 h-3.5 text-blue-400" />
                  <span>{correctCount}/{totalQuestions} correct</span>
                </div>
                {timeSpent > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>{Math.floor(timeSpent / 60)}m {timeSpent % 60}s</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* AI Grading Banner */}
            {aiGradingStatus && aiGradingStatus !== 'graded' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 w-full mb-4 flex items-center gap-3">
                {(aiGradingStatus === 'pending' || aiGradingStatus === 'grading') ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-purple-300 font-medium">AI grading in progress</p>
                      <p className="text-xs text-purple-400/60">Open-text answers are being graded. Score will update automatically.</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-sm text-amber-300 font-medium">Partial AI grading</p>
                    <p className="text-xs text-amber-400/60">Some answers could not be graded automatically.</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Expand/Collapse */}
            <div className="w-full flex justify-end mb-3">
              <button onClick={expandAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {expandedQ.size === totalQuestions ? 'Collapse All' : 'Expand All'}
              </button>
            </div>

            {/* Questions Review */}
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="w-full space-y-2 mb-10">
              {results.questions.map((q, idx) => {
                const isOpenText = q.question.type === 'open_text';
                const qAiStatus = q.ai_grading_status;
                const isPendingAi = isOpenText && (qAiStatus === 'pending' || qAiStatus === 'grading');
                const isCorrect = isPendingAi ? false : q.points_awarded > 0;
                const isExpanded = expandedQ.has(idx);
                const selectedIds = new Set(q.selected_answer_ids || (q.selected_answer_id ? [q.selected_answer_id] : []));
                const correctIds = new Set(q.correct_answer_ids || (q.correct_answer_id ? [q.correct_answer_id] : []));
                const allowReview = results.exam.allow_review;

                return (
                  <div key={q.question.id}
                    className={`rounded-xl border overflow-hidden transition-colors ${
                      isPendingAi ? 'border-purple-500/20 bg-purple-500/[0.03]' : isCorrect ? 'border-green-500/20 bg-green-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'
                    }`}>
                    <button type="button" onClick={() => toggleQuestion(idx)}
                      className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-white/[0.02] transition-colors">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isPendingAi ? 'bg-purple-500/20' : isCorrect ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {isPendingAi ? <Loader2 className="w-3 h-3 text-purple-400 animate-spin" /> : isCorrect ? <Check className="w-3 h-3 text-green-400" /> : <X className="w-3 h-3 text-red-400" />}
                      </div>
                      <span className="text-gray-300 font-medium text-xs sm:text-sm flex-1 truncate">
                        <span className="text-gray-500 mr-2">{idx + 1}.</span>{q.question.text}
                      </span>
                      <span className={`font-mono text-xs font-bold flex-shrink-0 ${isPendingAi ? 'text-purple-400' : isCorrect ? 'text-green-500' : 'text-red-400'}`}>
                        {isPendingAi ? '...' : q.points_awarded}/{Number(q.question.points)}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 border-t border-white/[0.04]">
                        <p className="text-sm text-gray-300 mb-3 leading-relaxed">{q.question.text}</p>

                        {q.question.type === 'code' && q.question.content && <div className="mb-3"><CodeBlock code={q.question.content} /></div>}
                        {q.question.type === 'image' && q.question.content && (
                          <div className="mb-3 bg-white p-2 rounded-lg max-w-lg shadow-lg"><img src={q.question.content} alt="Question" className="w-full h-auto rounded" /></div>
                        )}

                        {q.question.type === 'open_text' ? (
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase mb-1">Your answer</p>
                              <div className="bg-[#181a25]/50 border border-gray-700 rounded-lg px-3 py-2">
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">{q.text_answer || <span className="italic text-gray-500">No answer provided</span>}</p>
                              </div>
                            </div>
                            {q.ai_grading_status === 'graded' && q.ai_feedback && (
                              <div className="bg-purple-500/[0.06] border border-purple-500/20 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] text-purple-400 uppercase font-medium">AI Feedback</span>
                                </div>
                                <p className="text-xs text-purple-300/80">{q.ai_feedback}</p>
                              </div>
                            )}
                            {q.ai_grading_status === 'pending' && (
                              <div className="flex items-center gap-2 text-xs text-purple-400/60"><Loader2 className="w-3 h-3 animate-spin" /><span>Waiting for AI grading...</span></div>
                            )}
                            {q.ai_grading_status === 'grading' && (
                              <div className="flex items-center gap-2 text-xs text-purple-400"><Loader2 className="w-3 h-3 animate-spin" /><span>AI is grading now...</span></div>
                            )}
                            {q.ai_grading_status === 'error' && (
                              <div className="bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2">
                                <p className="text-xs text-red-400">AI grading failed</p>
                                {q.ai_feedback && <p className="text-[10px] text-red-400/60 mt-1">{q.ai_feedback}</p>}
                              </div>
                            )}
                          </div>
                        ) : q.question.type === 'ordering' ? (() => {
                          const cData = (() => { try { return JSON.parse(q.question.content || '{}'); } catch { return {}; } })();
                          const correctOrder: string[] = cData.items || [];
                          const studentOrder: string[] = (() => { try { const p = JSON.parse(q.text_answer || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })();
                          return (
                            <div className="space-y-3">
                              <p className="text-[10px] text-gray-500 uppercase mb-1">Ordering</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[10px] text-blue-400/60 uppercase mb-1">Your order</p>
                                  {studentOrder.map((item, i) => {
                                    const isCorrectPos = allowReview && correctOrder[i] === item;
                                    return (<div key={`s-${i}`} className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${isCorrectPos ? 'border-green-500/30 bg-green-500/[0.06] text-green-300' : allowReview ? 'border-red-500/30 bg-red-500/[0.06] text-red-300' : 'border-gray-700 bg-[#181a25]/50 text-gray-300'}`}><span className="font-mono text-[10px] w-4">{i + 1}.</span>{item}</div>);
                                  })}
                                </div>
                                {allowReview && (
                                  <div>
                                    <p className="text-[10px] text-green-400/60 uppercase mb-1">Correct order</p>
                                    {correctOrder.map((item, i) => (<div key={`c-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded border border-green-500/20 bg-green-500/[0.04] text-xs text-green-300"><span className="font-mono text-[10px] w-4">{i + 1}.</span>{item}</div>))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })() : q.question.type === 'matching' ? (() => {
                          const cData = (() => { try { return JSON.parse(q.question.content || '{}'); } catch { return {}; } })();
                          const leftArr: string[] = cData.left || [];
                          const rightArr: string[] = cData.right || [];
                          const studentMatches: Record<string, string> = (() => { try { return JSON.parse(q.text_answer || '{}'); } catch { return {}; } })();
                          return (
                            <div className="space-y-3">
                              <p className="text-[10px] text-gray-500 uppercase mb-1">Matching</p>
                              <div className="space-y-1.5">
                                {leftArr.map((left, i) => {
                                  const studentRight = studentMatches[left] || '';
                                  const correctRight = rightArr[i] || '';
                                  const isMatch = studentRight === correctRight;
                                  return (
                                    <div key={`m-${i}`} className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${isMatch && allowReview ? 'border-green-500/30 bg-green-500/[0.06]' : !isMatch && allowReview ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-gray-700 bg-[#181a25]/50'}`}>
                                      <span className="text-gray-300 flex-1">{left}</span>
                                      <span className="text-gray-500">&#8594;</span>
                                      <span className={isMatch && allowReview ? 'text-green-300 flex-1' : !isMatch && allowReview ? 'text-red-300 flex-1' : 'text-gray-300 flex-1'}>{studentRight || '-'}</span>
                                      {allowReview && !isMatch && <span className="text-green-400/60 text-[10px]">({correctRight})</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })() : q.question.type === 'fill_blank' ? (() => {
                          const cData = (() => { try { return JSON.parse(q.question.content || '{}'); } catch { return {}; } })();
                          const blanks: Array<{ id: string; correct: string }> = cData.blanks || [];
                          const studentFills: Record<string, string> = (() => { try { return JSON.parse(q.text_answer || '{}'); } catch { return {}; } })();
                          return (
                            <div className="space-y-3">
                              <p className="text-[10px] text-gray-500 uppercase mb-1">Fill in the blanks</p>
                              <div className="space-y-1.5">
                                {blanks.map((blank) => {
                                  const sv = (studentFills[blank.id] || '').trim();
                                  const cv = (blank.correct || '').trim();
                                  const isMatch = sv.toLowerCase() === cv.toLowerCase();
                                  return (
                                    <div key={blank.id} className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${isMatch && allowReview ? 'border-green-500/30 bg-green-500/[0.06]' : !isMatch && allowReview ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-gray-700 bg-[#181a25]/50'}`}>
                                      <span className="text-gray-500 font-mono text-[10px]">{blank.id}:</span>
                                      <span className={isMatch && allowReview ? 'text-green-300' : !isMatch && allowReview ? 'text-red-300' : 'text-gray-300'}>{sv || '-'}</span>
                                      {allowReview && !isMatch && <span className="text-green-400/60 text-[10px] ml-auto">({cv})</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="space-y-1.5">
                            {q.answers.map((a, ai) => {
                              const wasSelected = selectedIds.has(a.id);
                              const isCorrectAnswer = allowReview && correctIds.has(a.id);
                              const isWrongSelection = wasSelected && allowReview && !correctIds.has(a.id);

                              let borderClass = 'border-transparent';
                              let bgClass = 'bg-[#181a25]/50';
                              let labelClass = 'bg-[#2a2d3d] text-gray-400';

                              if (allowReview && isCorrectAnswer) {
                                borderClass = 'border-green-500/30'; bgClass = 'bg-green-500/[0.06]';
                                labelClass = wasSelected ? 'bg-green-600 text-white' : 'bg-green-500/20 text-green-400';
                              } else if (isWrongSelection) {
                                borderClass = 'border-red-500/30'; bgClass = 'bg-red-500/[0.06]';
                                labelClass = 'bg-red-600 text-white';
                              } else if (wasSelected && !allowReview) {
                                borderClass = 'border-blue-500/30'; bgClass = 'bg-blue-500/[0.06]';
                                labelClass = 'bg-blue-600 text-white';
                              }

                              return (
                                <div key={a.id} className={`flex items-center gap-2.5 px-3 py-2 rounded border ${borderClass} ${bgClass}`}>
                                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${labelClass}`}>
                                    {wasSelected && allowReview && isCorrectAnswer ? <Check className="w-3 h-3" strokeWidth={3} />
                                      : wasSelected && isWrongSelection ? <X className="w-3 h-3" strokeWidth={3} />
                                      : allowReview && isCorrectAnswer ? <Check className="w-3 h-3" strokeWidth={3} />
                                      : ANSWER_LABELS[ai] || String(ai + 1)}
                                  </div>
                                  <span className={`text-sm ${wasSelected ? 'text-white' : 'text-gray-400'}`}>{a.text}</span>
                                  {wasSelected && !allowReview && <span className="text-[10px] text-blue-400 ml-auto">Your answer</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {allowReview && q.question.explanation && (
                          <div className="mt-3 px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/20">
                            <p className="text-xs text-blue-300">{q.question.explanation}</p>
                          </div>
                        )}

                        {!allowReview && q.question.type !== 'open_text' && (
                          <p className="text-[11px] text-gray-500 mt-2 italic">Review is not available for this exam.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>

            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }}
              onClick={() => router.push('/dashboard')}
              className="w-full max-w-xs flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all uppercase tracking-[0.15em] text-sm shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 mb-10">
              <ArrowLeft className="w-4 h-4" />Back to Dashboard
            </motion.button>
          </>
        )}
      </main>

      <OtisakFooter />
    </div>
  );
}
