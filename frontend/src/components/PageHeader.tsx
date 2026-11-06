import type { ReactNode } from "react";

const ICON_PATHS = {
  database: "M4 5c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3Zm0 0v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3",
  layers: "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
  flow: "M5 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 12a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm13-6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM7.2 7.2l8.6 3.6M7.2 16.8l8.6-3.6",
  notebook: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v18M11 8h6M11 12h6M11 16h3",
  bell: "M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10.3 21a1.94 1.94 0 0 0 3.4 0",
  gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
} as const;

export type PageIcon = keyof typeof ICON_PATHS;

/**
 * Shared header for every in-app page: icon tile, title, one-line description, and an optional
 * actions slot on the right (stacks under the title on small screens).
 */
export function PageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: PageIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON_PATHS[icon]} />
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard page container: comfortable on phones (16px gutter), roomier on desktop. */
export const PAGE_CONTAINER = "mx-auto w-full px-4 py-6 sm:px-8 sm:py-10";
