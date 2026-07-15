// A `code` question stores its snippet in `content` as a JSON string:
//   {"snippet": "...", "language": "js"}
// which is what the exam editor writes. Older / hand-authored questions store
// the bare snippet instead, so every reader has to tolerate both. Parsing it
// in one place keeps the exam, results and editor views agreeing about what a
// question actually says.
export function parseCodeContent(content: string): { snippet: string; language?: string } {
  try {
    const parsed = JSON.parse(content) as { snippet?: string; language?: string };
    if (parsed && typeof parsed.snippet === 'string') {
      return { snippet: parsed.snippet, language: parsed.language || undefined };
    }
  } catch {
    // Not JSON: it's a bare snippet.
  }
  return { snippet: content };
}
