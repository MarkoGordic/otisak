'use client';

import React from 'react';
import { OtisakLogo } from './OtisakLogo';
import { motion } from 'framer-motion';
import { useLang } from '@/components/LangProvider';

interface OtisakHeaderProps {
  user?: { name: string | null; index_number: string | null; avatar_url: string | null } | null;
  centerContent?: React.ReactNode;
  showDate?: boolean;
  dateLabel?: string;
}

export function OtisakHeader({ user, centerContent, showDate = true, dateLabel }: OtisakHeaderProps) {
  const { t } = useLang();
  const displayDate = dateLabel || new Date().toLocaleDateString('sr-RS', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).replace(/\//g, '.');

  return (
    <header className="w-full h-16 sm:h-24 bg-gradient-to-b from-[#0d0f1a] to-[#0a0c16] relative z-20 shadow-lg">
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
            <span className="text-2xl font-bold text-white tracking-wider drop-shadow-md">
              OTISAK
            </span>
            <span className="text-[10px] text-blue-400/80 tracking-[0.2em] font-medium uppercase">
              v 2.0
            </span>
          </motion.div>
        </div>

        {/* Center */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          {showDate && (
            <span className="text-gray-400 text-xs mb-1 font-medium tracking-wide opacity-60">
              {displayDate}
            </span>
          )}
          {centerContent}
        </div>

        {/* Right: User Info */}
        {user && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-4 text-right"
          >
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                {t('exam.loggedInAs')}
              </span>
              <span className="text-base font-semibold text-white tracking-wide">
                {user.name || t('exam.student')}
              </span>
              {user.index_number && (
                <span className="text-[11px] text-blue-400/80 font-mono">
                  {user.index_number}
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-md" />
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || 'User'}
                  className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-blue-500/30 object-cover shadow-lg"
                />
              ) : (
                <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-blue-500/30 bg-blue-900/50 flex items-center justify-center shadow-lg">
                  <span className="text-blue-300 text-sm font-bold">
                    {(user.name || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Blue accent line */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.6)] z-30" />
      <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" />
    </header>
  );
}
