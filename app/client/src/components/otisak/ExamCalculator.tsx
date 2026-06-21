import { useState } from 'react';
import { Delete } from 'lucide-react';

// Safe arithmetic evaluator (shunting-yard -> RPN). No eval()/Function: the only
// thing that ever runs is +,-,*,/ on parsed numbers. Returns NaN on anything
// malformed so the UI can simply show nothing.
function evaluate(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  // Minimal unary-minus support: a '-' at the very start or right after '('
  // becomes "0-".
  const norm = s.replace(/(^|\()\s*-/g, '$10-');
  const tokens = norm.match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g);
  if (!tokens) return NaN;
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  for (const tk of tokens) {
    if (/^[\d.]/.test(tk)) {
      out.push(tk);
    } else if (tk === '(') {
      ops.push(tk);
    } else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      if (!ops.length) return NaN;
      ops.pop();
    } else {
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[tk]) out.push(ops.pop()!);
      ops.push(tk);
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === '(') return NaN;
    out.push(op);
  }
  const st: number[] = [];
  for (const tk of out) {
    if (/^[\d.]/.test(tk)) {
      const n = parseFloat(tk);
      if (Number.isNaN(n)) return NaN;
      st.push(n);
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) return NaN;
      st.push(tk === '+' ? a + b : tk === '-' ? a - b : tk === '*' ? a * b : a / b);
    }
  }
  return st.length === 1 ? st[0] : NaN;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '';
  // Trim binary-float noise (0.1 + 0.2 -> 0.3) without dropping real precision.
  return String(Math.round((n + Number.EPSILON) * 1e10) / 1e10);
}

// Pretty operators for the display only; the stored expression keeps ASCII.
function pretty(expr: string): string {
  return expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, ' − ').replace(/\+/g, ' + ');
}

const OPS = ['+', '-', '*', '/'];

type Key = { label: string; val: string; kind: 'num' | 'op' | 'eq' | 'fn' };

const KEYS: Key[] = [
  { label: 'C', val: 'C', kind: 'fn' }, { label: '(', val: '(', kind: 'fn' }, { label: ')', val: ')', kind: 'fn' }, { label: '÷', val: '/', kind: 'op' },
  { label: '7', val: '7', kind: 'num' }, { label: '8', val: '8', kind: 'num' }, { label: '9', val: '9', kind: 'num' }, { label: '×', val: '*', kind: 'op' },
  { label: '4', val: '4', kind: 'num' }, { label: '5', val: '5', kind: 'num' }, { label: '6', val: '6', kind: 'num' }, { label: '−', val: '-', kind: 'op' },
  { label: '1', val: '1', kind: 'num' }, { label: '2', val: '2', kind: 'num' }, { label: '3', val: '3', kind: 'num' }, { label: '+', val: '+', kind: 'op' },
  { label: '0', val: '0', kind: 'num' }, { label: '.', val: '.', kind: 'num' }, { label: 'back', val: 'back', kind: 'fn' }, { label: '=', val: '=', kind: 'eq' },
];

export function ExamCalculator({ isDark }: { isDark: boolean }) {
  const [expr, setExpr] = useState('');

  const live = (() => {
    const r = evaluate(expr);
    return Number.isFinite(r) ? formatNum(r) : '';
  })();

  const press = (val: string) => {
    setExpr((prev) => {
      if (val === 'C') return '';
      if (val === 'back') return prev.slice(0, -1);
      if (val === '=') {
        const r = evaluate(prev);
        return Number.isFinite(r) ? formatNum(r) : prev;
      }
      const last = prev.slice(-1);
      if (OPS.includes(val)) {
        if (prev === '') return val === '-' ? '-' : prev;
        if (OPS.includes(last)) return prev.slice(0, -1) + val; // replace trailing operator
        return prev + val;
      }
      return prev + val;
    });
  };

  const keyClass = (kind: Key['kind']) => {
    if (kind === 'eq') return 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm';
    if (kind === 'op') return isDark
      ? 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/20'
      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200';
    if (kind === 'fn') return isDark
      ? 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200';
    return isDark
      ? 'bg-white/[0.07] text-gray-100 hover:bg-white/[0.12] border border-white/5'
      : 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-200';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Display */}
      <div className={`rounded-2xl px-4 py-4 text-right border ${isDark ? 'bg-indigo-500/[0.06] border-indigo-500/15' : 'bg-indigo-50/50 border-indigo-200'}`}>
        <div className={`min-h-[20px] text-sm font-mono break-all ${isDark ? 'text-indigo-200/60' : 'text-indigo-700/60'}`}>
          {expr ? pretty(expr) : '0'}
        </div>
        <div className={`min-h-[36px] text-3xl font-bold font-mono tabular-nums break-all ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {live !== '' ? live : (expr ? '' : '0')}
        </div>
      </div>
      {/* Keypad */}
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map((k) => (
          <button
            key={k.val}
            type="button"
            onClick={() => press(k.val)}
            className={`h-12 rounded-xl flex items-center justify-center text-lg font-semibold transition-colors ${keyClass(k.kind)}`}
            aria-label={k.val === 'back' ? 'Backspace' : k.label}
          >
            {k.val === 'back' ? <Delete className="w-5 h-5" /> : k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
