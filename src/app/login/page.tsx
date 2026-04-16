'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Loader2, Eye, EyeOff, AlertCircle, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useLang } from '@/components/LangProvider';

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { t, locale, setLocale } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t('login.error.failed'));
        return;
      }

      router.push('/dashboard');
    } catch {
      setError(t('login.error.network'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 bg-[#070b14]">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        {/* Animated gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] bg-cyan-600/8 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '4s' }} />

        {/* Floating particles effect */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-blue-400/20 rounded-full"
              style={{
                left: `${15 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                animation: `float ${6 + i}s ease-in-out infinite`,
                animationDelay: `${i * 0.8}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Theme & Language toggles */}
      <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggle}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors backdrop-blur-sm"
          title={theme === 'dark' ? t('login.switchLight') : t('login.switchDark')}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={() => setLocale(locale === 'sr' ? 'en' : 'sr')}
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors backdrop-blur-sm"
          title={locale === 'sr' ? 'English' : 'Srpski'}
        >
          <span className="text-sm">{locale === 'sr' ? '🇬🇧' : '🇷🇸'}</span>
        </button>
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-5 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
            <Fingerprint className="w-10 h-10 text-blue-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-light text-white tracking-[0.15em] drop-shadow-lg">
            OTISAK
          </h1>
          <p className="text-sm text-blue-400/60 mt-2 tracking-wider">
            {t('app.subtitle')}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#0d1117]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.3)] p-7 sm:p-8">
          <h2 className="text-lg font-medium text-white mb-6">
            {t('login.title')}
          </h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1.5">
                {t('login.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full h-12 px-4 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-gray-600 focus:border-blue-500/50 focus:ring-0 focus:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all backdrop-blur-sm"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1.5">
                {t('login.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-12 px-4 pr-11 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-gray-600 focus:border-blue-500/50 focus:ring-0 focus:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all backdrop-blur-sm"
                  placeholder={t('login.passwordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(37,99,235,0.3)] hover:shadow-[0_0_35px_rgba(37,99,235,0.5)] mt-6"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('login.submitting')}
                </>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>
        </div>

        {/* Version */}
        <p className="text-center text-gray-600 text-[10px] uppercase tracking-[0.3em] mt-6">
          {t('app.version')}
        </p>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); opacity: 0.3; }
          50% { transform: translateY(-20px); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
