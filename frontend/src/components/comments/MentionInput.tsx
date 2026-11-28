"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { Mentionable } from "@/lib/api";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Ids of people whose "@Name" is still present in the text (deleting the text drops the mention). */
export function mentionedIds(text: string, people: Mentionable[]): number[] {
  return people.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);
}

/**
 * Textarea with "@" autocomplete over the people who can see the dashboard.
 * Enter submits (Shift+Enter for a new line) unless the suggestion list is open.
 */
export default function MentionInput({
  value,
  onChange,
  onSubmit,
  people,
  placeholder,
  autoFocus,
  disabled,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  people: Mentionable[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches = query
    ? people
        .filter((p) => {
          const q = query.text.toLowerCase();
          return p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q);
        })
        .slice(0, 6)
    : [];

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (m) {
      setQuery({ start: caret - m[2].length - 1, text: m[2] });
      setActive(0);
    } else {
      setQuery(null);
    }
  }

  function pick(p: Mentionable) {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${p.name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + p.name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (query && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className="block w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus-visible:outline-none"
      />
      {query && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute bottom-full start-0 z-10 mb-1 w-full max-w-xs overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] py-1 shadow-[var(--shadow-pop)]"
        >
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-sm ${i === active ? "bg-[var(--accent-soft)]" : ""}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold text-[var(--text-secondary)]">
                  {initials(p.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{p.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
