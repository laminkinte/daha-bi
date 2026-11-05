import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";

const SECTIONS = [
  {
    title: "What we collect",
    body: "Account details you give us directly (name, email), the data you choose to connect (CSV uploads, MySQL connection details, the queries you run), and basic usage data needed to operate the service (login timestamps, error logs).",
  },
  {
    title: "What we don't do",
    body: "We don't sell your data. We don't use the contents of your dashboards or datasets to train models or for advertising. We don't share your data with third parties except the infrastructure providers needed to run the service (hosting, email delivery for password resets and scheduled reports).",
  },
  {
    title: "How we use it",
    body: "To provide the service you're using: authenticate you, run the queries and charts you build, send the alert and report emails you configure, and improve reliability by understanding what's breaking.",
  },
  {
    title: "Your connected databases",
    body: "When you connect a MySQL database, we store the connection details (encrypted at rest) and a synced copy of the rows needed to power your dashboards. We only query what you've configured — a specific table or a SQL query you wrote.",
  },
  {
    title: "Cookies and local storage",
    body: "We use your browser's local storage to keep you signed in and remember preferences like theme (light/dark). We don't use third-party tracking or advertising cookies.",
  },
  {
    title: "Your rights",
    body: "You can update your profile and password at any time from your account settings, export your data via CSV, and delete your account and everything in it whenever you choose.",
  },
  {
    title: "Data retention",
    body: "We keep your data for as long as your account is active. If you delete your account, your dashboards, datasets, and connection details are removed.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <PublicHeader />

      <section className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Last updated {new Date().toLocaleDateString()}.</p>

        <div className="mt-10 flex flex-col gap-8">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="font-medium text-[var(--text-primary)]">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-[var(--text-muted)]">
          Questions about your data? Reach us at{" "}
          <a href="mailto:hello@daha.bi" className="text-[var(--accent)]">
            hello@daha.bi
          </a>
          .
        </p>
      </section>

      <Footer />
    </div>
  );
}
