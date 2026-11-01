// Course languages highlight.js doesn't ship: miniC (the language the "micko"
// compiler accepts), the hypothetical assembler micko emits, and bison rules.
// They only color what the language really has. Characters outside miniC
// (`*`, `&&`, `?`) stay plain on purpose: "what kind of error is this" questions
// must not give the answer away through the highlighting.
import type { HLJSApi, Language } from 'highlight.js';

export function minic(hljs: HLJSApi): Language {
  return {
    name: 'miniC',
    disableAutodetect: true,
    aliases: ['micko', 'mc'],
    keywords: {
      type: 'int unsigned',
      // Core miniC, plus the statements the colloquium tasks add to it.
      keyword: 'if else return while for do to downto in range select map const',
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      { scope: 'number', match: /\b\d+[uU]?\b/ },
      {
        scope: 'title.function',
        match: /\b(?!(?:if|while|for|return)\b)[a-zA-Z][a-zA-Z0-9]*(?=\s*\()/,
      },
      { scope: 'operator', match: /[<>=!]=|[<>=+-]/ },
    ],
  };
}

export function hipsim(): Language {
  return {
    name: 'Hipotetski asembler',
    disableAutodetect: true,
    aliases: ['hasm', 'asm'],
    case_insensitive: true,
    contains: [
      { scope: 'comment', begin: /;/, end: /$/ },
      { scope: 'symbol', match: /@?[a-z_][a-z0-9_]*:/ },
      {
        scope: 'keyword',
        match:
          /\b(?:(?:ADD|SUB|MUL|DIV|CMP)[SU]|MOV|JMP|J(?:EQ|NE|[GL][TE][SU]?)|PUSH|POP|CALL|RET|WORD|HALT|TO[IF])\b/,
      },
      { scope: 'variable', match: /%\d+/ },
      { scope: 'number', match: /\$-?\d+|-?\b\d+(?=\()/ },
      { scope: 'symbol', match: /@[a-z_][a-z0-9_]*/ },
    ],
  };
}

export function bison(hljs: HLJSApi): Language {
  return {
    name: 'Bison',
    disableAutodetect: true,
    aliases: ['yacc', 'y'],
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.QUOTE_STRING_MODE,
      { scope: 'keyword', match: /%[a-z]+/ },
      { scope: 'title', match: /^\s*[a-z_][a-z0-9_]*(?=\s*:)/ },
      { scope: 'type', match: /\b_[A-Z][A-Z0-9_]*\b/ },
      { scope: 'variable', match: /\$(?:\$|\d+)/ },
      { scope: 'built_in', match: /\bprintf\b/ },
    ],
  };
}
