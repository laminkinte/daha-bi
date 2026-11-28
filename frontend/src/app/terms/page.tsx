"use client";

import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { useT, uiLocaleTag } from "@/i18n/ui";

const SECTIONS = [
  {
    title: "1. Accepting these terms",
    body: "By creating an account or using Daha BI, you agree to these Terms of Service. If you're using Daha BI on behalf of a company, you're agreeing on that company's behalf and confirming you have the authority to do so.",
  },
  {
    title: "2. Your account",
    body: "You're responsible for the activity on your account and for keeping your password secure. Let us know right away if you suspect unauthorized access. You must be old enough to enter a binding agreement in your jurisdiction to create an account.",
  },
  {
    title: "3. Your data",
    body: "You own the data you connect to Daha BI — your CSV uploads, your MySQL connections, the datasets and dashboards you build. We don't claim ownership of it, and we don't sell it. We access it only to provide the service (running your queries, rendering your charts, sending the reports you schedule) or when you explicitly ask us to.",
  },
  {
    title: "4. Acceptable use",
    body: "Don't use Daha BI to store or process data you don't have the right to use, to attempt unauthorized access to other accounts or systems, or to disrupt the service for other users. Connections to your own databases are your responsibility to secure appropriately.",
  },
  {
    title: "5. Sharing and collaboration",
    body: "Dashboards you make public via a share link are visible to anyone with that link, without login. Dashboards you share with teammates are visible to everyone you've invited, with the role (viewer or editor) you assign them.",
  },
  {
    title: "6. Service availability",
    body: "We aim to keep Daha BI available and reliable, but we don't guarantee uninterrupted access. Features that depend on external systems you connect (like your own MySQL database) are only as available as those systems.",
  },
  {
    title: "7. Termination",
    body: "You can stop using Daha BI and delete your account at any time. We may suspend or terminate accounts that violate these terms, with notice where practical.",
  },
  {
    title: "8. Changes to these terms",
    body: "We may update these terms as the product evolves. Material changes will be communicated before they take effect.",
  },
];

export default function TermsPage() {
  const tr = useT();
  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <PublicHeader />

      <section className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)]">{tr("Terms of Service")}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{tr("Last updated")} {new Date().toLocaleDateString(uiLocaleTag())}.</p>

        <div className="mt-10 flex flex-col gap-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="font-medium text-[var(--text-primary)]">{tr(s.title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{tr(s.body)}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-[var(--text-muted)]">
          {tr("Questions about these terms? Reach us at")}{" "}
          <a href="mailto:hello@daha.bi" className="text-[var(--accent)]">
            {tr("hello@daha.bi")}
          </a>
          .
        </p>
      </section>

      <Footer />
    </div>
  );
}
