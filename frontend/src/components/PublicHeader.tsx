import Link from "next/link";
import { BrandMark } from "./BrandMark";

export default function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface-1)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <BrandMark />
          <span className="whitespace-nowrap font-semibold tracking-tight text-[var(--text-primary)]">Daha BI</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          {/* About/Pricing drop off on phones so the two actions that matter keep room. */}
          <Link href="/about" className="hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:inline">
            About
          </Link>
          <Link href="/pricing" className="hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Log in
          </Link>
          <Link
            href="/register"
            className="whitespace-nowrap rounded-lg bg-[var(--accent)] px-3.5 py-2 font-medium text-white shadow-sm sm:px-4"
          >
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Get started free</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
