import Link from "next/link";

export default function PublicHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--series-1)] text-sm font-bold text-white">
            D
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Daha BI</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/about" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            About
          </Link>
          <Link href="/pricing" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Pricing
          </Link>
          <Link href="/login" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Log in
          </Link>
          <Link href="/register" className="rounded-md bg-[var(--series-1)] px-4 py-2 font-medium text-white">
            Get started free
          </Link>
        </nav>
      </div>
    </header>
  );
}
