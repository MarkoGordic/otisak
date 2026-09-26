import { useTheme } from '../ThemeProvider';

// Full-screen animated backdrop shared by the public screens (home, sign-in):
// faint grid, three slowly pulsing glow orbs and a few floating particles.
// Fixed + behind everything, so page content just needs `relative z-10`.
export function OtisakBackground() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div className={`fixed inset-0 pointer-events-none transition-colors ${isDark ? 'bg-[#070b14]' : 'bg-[#F8FAFC]'}`}>
      {/* Grid pattern */}
      <div className={`absolute inset-0 ${isDark ? 'opacity-[0.03]' : 'opacity-[0.06]'}`} style={{
        backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Animated gradient orbs */}
      <div className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-blue-600/15' : 'bg-blue-400/30'}`} />
      <div className={`absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[150px] animate-pulse ${isDark ? 'bg-indigo-600/10' : 'bg-indigo-300/30'}`} style={{ animationDelay: '2s' }} />
      <div className={`absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full blur-[120px] animate-pulse ${isDark ? 'bg-cyan-600/8' : 'bg-cyan-300/25'}`} style={{ animationDelay: '4s' }} />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-1 h-1 rounded-full ${isDark ? 'bg-blue-400/20' : 'bg-blue-500/30'}`}
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `otisak-float ${6 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.8}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes otisak-float {
          0%, 100% { transform: translateY(0px); opacity: 0.3; }
          50% { transform: translateY(-20px); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
