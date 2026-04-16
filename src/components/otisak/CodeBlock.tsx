'use client';

import React, { useMemo, useState, useEffect } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hljsCache: any = null;

export function CodeBlock({ code, language }: CodeBlockProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [hljs, setHljs] = useState<any>(hljsCache);

  useEffect(() => {
    if (hljsCache) { setHljs(hljsCache); return; }
    import('highlight.js').then(mod => {
      hljsCache = mod.default;
      setHljs(mod.default);
    });
  }, []);

  const { html, detectedLang } = useMemo(() => {
    if (!hljs) {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return { html: escaped, detectedLang: language || 'text' };
    }
    try {
      if (language && hljs.getLanguage(language)) {
        const result = hljs.highlight(code, { language });
        return { html: result.value, detectedLang: language };
      }
      const result = hljs.highlightAuto(code);
      return { html: result.value, detectedLang: result.language || 'text' };
    } catch {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return { html: escaped, detectedLang: language || 'text' };
    }
  }, [code, language, hljs]);

  const lines: string[] = html.split('\n');

  return (
    <div className="w-full bg-[#1e1e2e] rounded-lg overflow-hidden border border-gray-700/50 my-4 sm:my-6 shadow-lg">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-[#181825] border-b border-gray-700/30">
        <span className="text-[10px] sm:text-xs text-gray-500 font-mono uppercase tracking-wider">{detectedLang}</span>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500/60" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="select-none text-right pr-2 sm:pr-4 pl-2 sm:pl-4 py-0 text-gray-600 text-[10px] sm:text-xs font-mono w-[1%] whitespace-nowrap border-r border-gray-700/30">
                  {i + 1}
                </td>
                <td className="pl-2 sm:pl-4 pr-3 sm:pr-6 py-0 font-mono text-xs sm:text-sm">
                  <pre className="text-gray-300 leading-relaxed">
                    <code dangerouslySetInnerHTML={{ __html: line || '\u00A0' }} />
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
