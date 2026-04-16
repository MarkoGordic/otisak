'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Users, Play, Copy, Check, Clock, Link2, UserCheck, ArrowLeft,
  Fingerprint, AlertTriangle, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/components/LangProvider';

type Participant = {
  user_id: string;
  name: string | null;
  email: string;
  index_number: string | null;
  enrolled_at: string;
};

type ExamData = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  exam_started_at: string | null;
  subject_name: string | null;
  question_count: number;
  negative_points_enabled: boolean;
};

export default function ExamRoomPage() {
  const router = useRouter();
  const { examId } = useParams<{ examId: string }>()!;
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const joinLink = typeof window !== 'undefined' ? `${window.location.origin}/join/${examId}` : '';

  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/room`, { credentials: 'include' });
      if (!res.ok) { router.push('/manage'); return; }
      const data = await res.json();
      setExam(data.exam);
      setParticipants(data.participants || []);
      if (data.exam?.exam_started_at) setStarted(true);
    } catch { router.push('/manage'); }
    finally { setLoading(false); }
  }, [examId, router]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Poll for new participants every 3 seconds
  useEffect(() => {
    pollRef.current = setInterval(loadRoom, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadRoom]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartExam = async () => {
    if (starting || started) return;
    if (!confirm(t('room.startConfirm', { count: participants.length }))) return;

    setStarting(true);
    try {
      const res = await fetch(`/api/otisak/exams/${examId}/start`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setStarted(true);
        loadRoom();
      } else {
        const data = await res.json();
        alert(data.error || t('room.startFailed'));
      }
    } catch {
      alert(t('room.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_50%,_rgba(59,130,246,0.1),_transparent_50%)] blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_50%,_rgba(59,130,246,0.1),_transparent_50%)] blur-[120px]" />
      </div>

      {/* Header */}
      <header className="w-full bg-gradient-to-b from-[#0d0f1a] to-[#0a0c16] border-b border-blue-500/10 px-4 sm:px-6 py-4 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/manage')} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-blue-500" strokeWidth={1.5} />
              <div>
                <h1 className="text-lg font-semibold text-white">{exam?.title || t('room.title')}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {exam?.subject_name && <span>{exam.subject_name}</span>}
                  <span>{exam?.duration_minutes}min</span>
                  <span>{exam?.question_count} questions</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {started ? (
              <Badge variant="success" size="md" dot>{t('room.running')}</Badge>
            ) : (
              <Badge variant="warning" size="md" dot>{t('room.waiting')}</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 z-10">
        {/* Join Link Card */}
        {!started && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#131520]/80 border border-blue-500/20 rounded-xl p-5 mb-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={16} className="text-blue-400" />
              <span className="text-sm font-medium text-white">{t('room.joinLink')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#0a0c10]/80 border border-gray-700/50 rounded-lg px-4 py-3 font-mono text-sm text-blue-300 truncate">
                {joinLink}
              </div>
              <button
                onClick={handleCopyLink}
                className={`px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  copied
                    ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {copied ? <><Check size={16} />{t('room.copied')}</> : <><Copy size={16} />{t('room.copy')}</>}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">{t('room.joinLinkDesc')}</p>
          </motion.div>
        )}

        {/* Stats + Start */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-[#131520]/80 border border-blue-500/10 rounded-lg">
              <Users size={16} className="text-blue-400" />
              <span className="text-white font-mono text-lg font-bold">{participants.length}</span>
              <span className="text-gray-500 text-sm">{t('room.joined')}</span>
            </div>
            {!started && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Radio size={12} className="text-green-400 animate-pulse" />
                {t('room.liveRefresh')}
              </div>
            )}
          </div>

          {!started && (
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Play size={18} className="fill-current" />}
              loading={starting}
              onClick={handleStartExam}
              className="shadow-[0_0_25px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_rgba(37,99,235,0.6)]"
            >
              {t('room.startExam')}
            </Button>
          )}
        </div>

        {/* Participants List */}
        <div className="bg-[#131520]/80 border border-blue-500/10 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center px-5 py-3 bg-[#0d0f1a] border-b border-blue-500/10 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <div className="w-8">#</div>
            <div className="flex-1">{t('room.student')}</div>
            <div className="w-40 hidden sm:block">{t('room.indexNumber')}</div>
            <div className="w-32 hidden md:block">{t('room.joinedAt')}</div>
            <div className="w-20 text-center">{t('room.status')}</div>
          </div>

          {participants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm mb-1">{t('room.noStudents')}</p>
              <p className="text-gray-600 text-xs">{t('room.noStudentsDesc')}</p>
            </div>
          ) : (
            <AnimatePresence>
              {participants.map((p, idx) => (
                <motion.div
                  key={p.user_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center px-5 py-3 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-8 text-gray-600 font-mono text-xs">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white truncate block">{p.name || p.email}</span>
                    {p.name && <span className="text-[11px] text-gray-500 block">{p.email}</span>}
                  </div>
                  <div className="w-40 hidden sm:block">
                    <span className="font-mono text-xs text-blue-300">{p.index_number || '-'}</span>
                  </div>
                  <div className="w-32 hidden md:block text-[11px] text-gray-500">
                    {new Date(p.enrolled_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className="w-20 flex justify-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] text-green-400/80 uppercase font-medium">{t('room.ready')}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Started notice */}
        {started && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 bg-green-500/10 border border-green-500/20 rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <Play size={20} className="text-green-400 fill-current" />
            </div>
            <div>
              <p className="text-green-300 font-medium">{t('room.examRunning')}</p>
              <p className="text-green-400/60 text-xs">Started at {exam?.exam_started_at ? new Date(exam.exam_started_at).toLocaleTimeString() : 'now'}. Timer is active for all students.</p>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
