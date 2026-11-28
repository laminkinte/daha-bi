"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { translate } from "@/i18n/ui";

/**
 * Keeps one misbehaving chart from taking the whole dashboard down: a render error inside a card
 * is shown in that card (with Retry) instead of unmounting the page.
 */
export default class ChartErrorBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Chart "${this.props.title}" failed to render: ${error.message}`, info.componentStack ?? "");
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">&ldquo;{translate(this.props.title)}{translate("” couldn't render")}</p>
        <p className="max-w-xs text-xs text-[var(--text-muted)]">{translate("The rest of the dashboard is unaffected.")}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {translate("Retry")}
        </button>
      </div>
    );
  }
}
