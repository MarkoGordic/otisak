import React, { useEffect, useState } from 'react';
import { OtisakLogo } from './OtisakLogo';
import { motion } from 'framer-motion';
import { useLang } from '../LangProvider';
import { useTheme } from '../ThemeProvider';
import { ToggleCluster } from '../ToggleCluster';

interface OtisakHeaderProps {
  user?: { name: string | null; index_number: string | null; avatar_url: string | null } | null;
  centerContent?: React.ReactNode;
  // Optional slot for an action button (e.g. "Završi test") that sits in the
  // right cluster next to the toggle group. Pass `null` to hide.
  actionButton?: React.ReactNode;
  showDate?: boolean;
  dateLabel?: string;
}

export function OtisakHeader({ user, centerContent, actionButton, showDate = true, dateLabel }: OtisakHeaderProps) {
  const { t } = useLang();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Live clock - ticks every second so the student always sees the current wall-clock
  // time alongside the countdown. `dateLabel` overrides the date half when provided.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!showDate) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [showDate]);

  const displayDate = dateLabel || now.toLocaleDateString('sr-RS', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).replace(/\//g, '.');
  const displayTime = now.toLocaleTimeString('sr-RS', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // Header was originally hard-coded dark gradient. Mirror it in light mode with a soft
  // white gradient and adjust every nested label/text/border so the contrast still works.
  const headerBg = isDark
    ? 'bg-gradient-to-b from-[#0d0f1a] to-[#0a0c16]'
    : 'bg-gradient-to-b from-white to-slate-50 border-b border-slate-200';
  const otisakTitleClass = isDark ? 'text-white drop-shadow-md' : 'text-slate-900';
  const versionLabel = isDark ? 'text-blue-400/80' : 'text-blue-600/80';
  const dateClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const userLabelClass = isDark ? 'text-gray-400' : 'text-slate-500';
  const userNameClass = isDark ? 'text-white' : 'text-slate-900';
  const userIndexClass = isDark ? 'text-blue-400/80' : 'text-blue-600/80';
  const avatarGlow = isDark ? 'bg-blue-500/20' : 'bg-blue-500/10';
  const avatarBorder = isDark ? 'border-blue-500/30' : 'border-blue-300';
  const avatarFallback = isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700';

  return (
    <header className={`w-full h-16 sm:h-24 relative z-20 shadow-lg ${headerBg}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-full flex items-center justify-between">
        {/* Left: Logo & App Name */}
        <div className="flex items-center gap-2 sm:gap-5">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <OtisakLogo className="w-8 h-8 sm:w-12 sm:h-12 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="hidden sm:flex flex-col"
          >
            <span className={`text-2xl font-bold tracking-wider ${otisakTitleClass}`}>
              OTISAK
            </span>
            <span className={`text-[10px] tracking-[0.2em] font-medium uppercase ${versionLabel}`}>
              v 2.0
            </span>
          </motion.div>
        </div>

        {/* Center */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center max-w-[55%] sm:max-w-none">
          {showDate && (
            <span className={`hidden sm:flex items-center gap-2 text-xs mb-1 font-medium tracking-wide opacity-70 ${dateClass}`}>
              <span>{displayDate}</span>
              <span className="opacity-40">·</span>
              <span className="font-mono tabular-nums">{displayTime}</span>
            </span>
          )}
          {centerContent}
        </div>

        {/* Right: Action button (optional) + Toggle cluster + User Info */}
        <div className="flex items-center gap-2 sm:gap-3 text-right">
          {actionButton}
          <div className="hidden md:block">
            <ToggleCluster variant="solid" position="static" />
          </div>
          {user && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 sm:gap-4 text-right"
          >
            <div className="hidden sm:flex flex-col">
              <span className={`text-[10px] uppercase tracking-wider font-medium ${userLabelClass}`}>
                {t('exam.loggedInAs')}
              </span>
              <span className={`text-base font-semibold tracking-wide ${userNameClass}`}>
                {user.name || t('exam.student')}
              </span>
              {user.index_number && (
                <span className={`text-[11px] font-mono ${userIndexClass}`}>
                  {user.index_number}
                </span>
              )}
            </div>
            <div className="relative">
              <div className={`absolute inset-0 rounded-full blur-md ${avatarGlow}`} />
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || 'User'}
                  className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 object-cover shadow-lg ${avatarBorder}`}
                />
              ) : (
                <div className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center shadow-lg ${avatarBorder} ${avatarFallback}`}>
                  <span className="text-sm font-bold">
                    {(user.name || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
          )}
        </div>
      </div>

      {/* Blue accent line */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.6)] z-30" />
      <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" />
    </header>
  );
}
