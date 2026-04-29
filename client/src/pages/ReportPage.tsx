import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, ArrowLeft, Fingerprint, FileDown, AlertTriangle, Check, X,
  Clock, Target, Keyboard, MousePointer, Eye, EyeOff, Copy, Monitor,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLang } from '../components/LangProvider';

type ReportData = {
  exam: { id: string; title: string; subject_name: string | null; duration_minutes: number; pass_threshold: number };
  student: { id: string; name: string | null; email: string; index_number: string | null };
  attempt: { id: string; started_at: string; finished_at: string; total_points: number; max_points: number; time_spent_seconds: number };
  results: {
    questions: Array<{
      index: number; text: string; type: string; points: number; points_awarded: number;
      selected_answer_ids: string[]; correct_answer_ids: string[]; text_answer: string | null;
      answers: Array<{ id: string; text: string; is_correct: boolean }>;
    }>;
  } | null;
  activity: {
    stats: {
      totalEvents: number; keystrokes: number; answerChanges: number;
      tabSwitches: number; copyAttempts: number; rightClicks: number;
      eventCounts: Record<string, number>;
    };
    timeline: Array<{ time: string; type: string; data: Record<string, unknown> }>;
  };
};

const EVENT_LABELS: Record<string, string> = {
  exam_view_started: 'Pocetak pregleda', exam_submit: 'Predaja ispita',
  answer_selected: 'Odgovor izabran', answer_deselected: 'Odgovor ponisten',
  question_next: 'Sledece pitanje', question_prev: 'Prethodno pitanje',
  keystroke_batch: 'Unos tastaturom', key_combo: 'Kombinacija tastera',
  copy_attempt: 'Pokusaj kopiranja', cut_attempt: 'Pokusaj isecanja',
  paste_attempt: 'Pokusaj lepljenja', right_click: 'Desni klik',
  page_blur: 'Napustanje prozora', page_focus: 'Povratak u prozor',
  visibility_change: 'Promena vidljivosti', window_resize: 'Promena prozora',
  mouse_leave_window: 'Mis napustio prozor', print_attempt: 'Pokusaj stampanja',
  devtools_attempt: 'DevTools pokusaj', special_key: 'Specijalan taster',
  text_typed: 'Unos teksta',
};

const SUSPICIOUS = new Set(['copy_attempt', 'cut_attempt', 'paste_attempt', 'page_blur', 'mouse_leave_window', 'devtools_attempt', 'print_attempt']);

export default function StudentReportPage() {
  const navigate = useNavigate();
  const { examId, userId } = useParams();
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/otisak/exams/${examId}/report/${userId}`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
        else navigate(`/manage/${examId}`);
      } catch { navigate(`/manage/${examId}`); }
      finally { setLoading(false); }
    })();
  }, [examId, userId, navigate]);

  if (loading || !data) {
    return <div className="min-h-screen bg-[#070b14] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  const { exam, student, attempt, results, activity } = data;
  const pct = Number(attempt.max_points) > 0 ? Math.round((Number(attempt.total_points) / Number(attempt.max_points)) * 100) : 0;
  const passed = pct >= exam.pass_threshold;
  const suspicious = activity.timeline.filter(e => SUSPICIOUS.has(e.type));

  return (
    <div className="min-h-screen bg-[#070b14] text-gray-200">
      {/* Header */}
      <header className="bg-[#0d1117] border-b border-blue-500/10 px-4 sm:px-6 py-4 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/manage/${examId}`)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><ArrowLeft size={20} /></button>
            <Fingerprint className="w-7 h-7 text-blue-500" strokeWidth={1.5} />
            <div>
              <h1 className="text-lg font-semibold text-white">Izvestaj studenta</h1>
              <p className="text-xs text-gray-500">{exam.title}</p>
            </div>
          </div>
          <a href={`/api/otisak/exams/${examId}/report/${userId}/pdf`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">
            <FileDown size={16} />PDF Izvestaj
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Student + Score */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#0d1117] rounded-xl border border-blue-500/10 p-5">
            <p className="text-[9px] uppercase tracking-[3px] text-blue-400 mb-2">Student</p>
            <p className="text-xl font-semibold text-white">{student.name || student.email}</p>
            {student.index_number && <p className="text-sm text-blue-300 font-mono mt-1">{student.index_number}</p>}
            <p className="text-xs text-gray-500 mt-1">{student.email}</p>
          </div>
          <div className={`rounded-xl border-2 p-5 text-center ${passed ? 'bg-green-900/10 border-green-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
            <p className={`text-5xl font-bold font-mono ${passed ? 'text-green-400' : 'text-red-400'}`}>{attempt.total_points}/{attempt.max_points}</p>
            <p className={`text-sm mt-1 ${passed ? 'text-green-400' : 'text-red-400'}`}>{pct}% | {passed ? 'POLOZENO' : 'NIJE POLOZENO'}</p>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Clock size={12} />{Math.floor(Number(attempt.time_spent_seconds) / 60)}m {Number(attempt.time_spent_seconds) % 60}s</span>
              <span className="flex items-center gap-1"><Target size={12} />Prag: {exam.pass_threshold}%</span>
            </div>
          </div>
        </div>

        {/* Activity Stats */}
        <div>
          <h2 className="text-[10px] uppercase tracking-[3px] text-blue-400 font-semibold mb-3">Statistika aktivnosti</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { icon: <Monitor size={16} />, label: 'Dogadjaja', value: activity.stats.totalEvents, color: 'text-blue-400' },
              { icon: <Keyboard size={16} />, label: 'Tastatura', value: activity.stats.keystrokes, color: 'text-blue-400' },
              { icon: <MousePointer size={16} />, label: 'Odgovori', value: activity.stats.answerChanges, color: 'text-amber-400' },
              { icon: <EyeOff size={16} />, label: 'Napustanja', value: activity.stats.tabSwitches, color: activity.stats.tabSwitches > 3 ? 'text-red-400' : 'text-amber-400' },
              { icon: <Copy size={16} />, label: 'Kopiranja', value: activity.stats.copyAttempts, color: activity.stats.copyAttempts > 0 ? 'text-red-400' : 'text-green-400' },
              { icon: <MousePointer size={16} />, label: 'Desni klik', value: activity.stats.rightClicks, color: activity.stats.rightClicks > 2 ? 'text-red-400' : 'text-gray-400' },
            ].map((s, i) => (
              <div key={i} className="bg-[#0d1117] rounded-lg border border-gray-800 p-3 text-center">
                <div className={`${s.color} mb-1 flex justify-center`}>{s.icon}</div>
                <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Suspicious */}
        {suspicious.length > 0 ? (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
            <h2 className="text-[10px] uppercase tracking-[3px] text-red-400 font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={14} />Sumnjiva aktivnost ({suspicious.length})</h2>
            <div className="space-y-1">
              {suspicious.map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1">
                  <span className="text-gray-500 font-mono w-20">{new Date(e.time).toLocaleTimeString('sr-RS')}</span>
                  <span className="text-red-400">{EVENT_LABELS[e.type] || e.type}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
            <Check size={16} className="text-green-400" />
            <span className="text-green-400 text-sm">Nije detektovana sumnjiva aktivnost</span>
          </div>
        )}

        {/* Questions */}
        {results && (
          <div>
            <h2 className="text-[10px] uppercase tracking-[3px] text-blue-400 font-semibold mb-3">Odgovori ({results.questions.length} pitanja)</h2>
            <div className="space-y-3">
              {results.questions.map((q, idx) => {
                const correct = q.points_awarded > 0;
                return (
                  <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                    className={`rounded-xl border p-4 ${correct ? 'border-green-500/20 bg-green-500/[0.02]' : 'border-red-500/20 bg-red-500/[0.02]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {correct ? <Check size={14} className="text-green-400" /> : <X size={14} className="text-red-400" />}
                        <span className="text-xs text-gray-500">Pitanje {q.index}</span>
                      </div>
                      <span className={`text-xs font-mono font-bold ${correct ? 'text-green-400' : 'text-red-400'}`}>{q.points_awarded}/{q.points}</span>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{q.text}</p>
                    {q.type === 'open_text' ? (
                      <div className="bg-[#111827] rounded-lg p-3 text-xs text-gray-400">{q.text_answer || <em>Bez odgovora</em>}</div>
                    ) : (
                      <div className="space-y-1.5">
                        {q.answers.map(a => {
                          const sel = q.selected_answer_ids.includes(a.id);
                          const cor = q.correct_answer_ids.includes(a.id);
                          return (
                            <div key={a.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                              cor ? 'border-green-500/30 bg-green-500/5 text-green-300' : sel ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-gray-800 text-gray-400'
                            }`}>
                              {cor ? <Check size={12} className="text-green-400" /> : sel ? <X size={12} className="text-red-400" /> : <span className="w-3" />}
                              {a.text}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <button onClick={() => setShowTimeline(!showTimeline)}
            className="text-[10px] uppercase tracking-[3px] text-blue-400 font-semibold mb-3 flex items-center gap-2 hover:text-blue-300">
            <Eye size={14} />{showTimeline ? 'Sakrij' : 'Prikazi'} hronologiju ({activity.timeline.length} dogadjaja)
          </button>
          {showTimeline && (
            <div className="bg-[#0d1117] rounded-xl border border-gray-800 overflow-hidden max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#111827] sticky top-0">
                  <tr>
                    <th className="py-2 px-3 text-left text-gray-500 font-medium">Vreme</th>
                    <th className="py-2 px-3 text-left text-gray-500 font-medium">Dogadjaj</th>
                    <th className="py-2 px-3 text-left text-gray-500 font-medium">Detalji</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.timeline.map((e, i) => {
                    const isSus = SUSPICIOUS.has(e.type);
                    return (
                      <tr key={i} className={`border-t border-gray-800/50 ${isSus ? 'bg-red-500/5' : ''}`}>
                        <td className="py-1.5 px-3 text-gray-500 font-mono whitespace-nowrap">{new Date(e.time).toLocaleTimeString('sr-RS')}</td>
                        <td className={`py-1.5 px-3 ${isSus ? 'text-red-400' : 'text-gray-300'}`}>{EVENT_LABELS[e.type] || e.type}</td>
                        <td className="py-1.5 px-3 text-gray-300 max-w-[420px]">
                          {Object.entries(e.data || {}).length === 0 ? <span className="text-gray-600">-</span> : (
                            <div className="flex flex-col gap-0.5">
                              {Object.entries(e.data || {}).map(([k, v]) => (
                                <div key={k} className="leading-tight">
                                  <span className="text-gray-500">{k}:</span> <span className="text-gray-300">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
