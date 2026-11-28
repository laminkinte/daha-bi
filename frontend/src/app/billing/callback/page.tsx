"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type User } from "@/lib/api";
import { useT } from "@/i18n/ui";

function CallbackContent() {
  const tr = useT();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const txRef = searchParams.get("tx_ref");
  const flutterwaveStatus = searchParams.get("status");
  const { updateUser } = useAuth();
  const [status, setStatus] = useState<"checking" | "success" | "failed">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (txRef) {
        if (flutterwaveStatus === "cancelled") {
          setStatus("failed");
          setError(tr("Payment was cancelled."));
          return;
        }
        api
          .get<{ user: User }>(`/billing/flutterwave/verify?reference=${encodeURIComponent(txRef)}`)
          .then((res) => {
            updateUser(res.user);
            setStatus("success");
          })
          .catch((err) => {
            setStatus("failed");
            setError(err instanceof ApiError ? err.message : tr("Could not verify this payment."));
          });
        return;
      }

      if (!sessionId) {
        setStatus("failed");
        setError(tr("No payment session was returned."));
        return;
      }
      api
        .get<{ user: User }>(`/billing/stripe/verify?session_id=${encodeURIComponent(sessionId)}`)
        .then((res) => {
          updateUser(res.user);
          setStatus("success");
        })
        .catch((err) => {
          setStatus("failed");
          setError(err instanceof ApiError ? err.message : tr("Could not verify this payment."));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, txRef]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      {status === "checking" && <p className="text-sm text-[var(--text-muted)]">{tr("Confirming your payment...")}</p>}
      {status === "success" && (
        <>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{tr("You're upgraded")}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{tr("Your new plan is active right away.")}</p>
          <Link
            href="/dashboards"
            className="mt-6 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
          >
            {tr("Go to dashboards")}
          </Link>
        </>
      )}
      {status === "failed" && (
        <>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{tr("Payment not confirmed")}</h1>
          <p className="mt-2 max-w-sm text-sm text-[var(--status-critical)]">{error}</p>
          <Link href="/pricing" className="mt-6 text-sm text-[var(--accent)]">
            {tr("Back to pricing")}
          </Link>
        </>
      )}
    </div>
  );
}

export default function BillingCallbackPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <CallbackContent />
      </Suspense>
    </RequireAuth>
  );
}
