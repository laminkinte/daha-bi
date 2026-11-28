"use client";

import { useState, type ChangeEvent } from "react";
import { useT } from "@/i18n/ui";

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17.9 17.9A10.4 10.4 0 0 1 12 20c-7 0-11-8-11-8a19.1 19.1 0 0 1 4.2-5.2" />
      <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.2 3.3" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export default function PasswordInput({
  name,
  autoComplete,
  required,
  minLength,
  value,
  onChange,
  className,
}: {
  name?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const tr = useT();
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
        className={
          className ??
          "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2.5 pe-10 text-sm text-[var(--text-primary)] outline-none"
        }
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label={show ? tr("Hide password") : tr("Show password")}
        tabIndex={-1}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
