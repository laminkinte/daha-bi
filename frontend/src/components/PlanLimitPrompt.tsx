"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, BTN_PRIMARY, BTN_SECONDARY } from "@/components/Modal";
import { PLAN_LIMIT_EVENT } from "@/lib/api";

/**
 * When the server refuses something because of the workspace's plan (HTTP 402), say so plainly
 * and offer the way to upgrade — wherever in the app it happened. The page's own error message
 * still shows too; this just makes the next step obvious.
 */
export default function PlanLimitPrompt() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onLimit = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);

  if (!message) return null;

  return (
    <Modal
      open
      onClose={() => setMessage(null)}
      title="Upgrade to continue"
      description="This is beyond what your current plan includes."
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8L12 3Z" />
        </svg>
      }
      footer={
        <>
          <button onClick={() => setMessage(null)} className={BTN_SECONDARY}>
            Not now
          </button>
          <Link href="/pricing" onClick={() => setMessage(null)} className={BTN_PRIMARY}>
            See plans
          </Link>
        </>
      }
    >
      <p className="px-5 py-4 text-sm leading-6 text-[var(--text-secondary)]">{message.replace(/\s*Upgrade on the Pricing page to unlock more\.?$/, "")}</p>
    </Modal>
  );
}
