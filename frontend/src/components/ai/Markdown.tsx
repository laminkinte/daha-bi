import { Fragment, type ReactNode } from "react";

/**
 * The small Markdown subset the assistant is told to use: paragraphs, "- " / "1. " lists,
 * **bold**, *italic* and `code`. Built as React nodes (never innerHTML), so model output can't
 * inject markup.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-semibold text-[var(--text-primary)]">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  // Models sometimes inline their bullets ("…dataset. - The top country…"): put each on its own line.
  const normalized = text.replace(/\r/g, "").replace(/([.!?:)])[ \t]+[-•][ \t]+(?=\S)/g, "$1\n- ");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1 ps-5">{items}</ol>
        ) : (
          <ul key={k} className="list-disc space-y-1 ps-5 marker:text-[var(--accent)]">{items}</ul>
        )
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      // Headings aren't wanted in chat bubbles — render them as a bold line.
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      para.push(heading ? `**${heading[1]}**` : line);
    }
  }
  flushPara();
  flushList();

  return <div className="space-y-2">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
