import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";

const VALUES = [
  {
    title: "Built for how you actually work",
    description:
      "Most BI tools are designed for a desk and a big monitor. Daha BI is designed mobile-first, because that's the reality for most growing teams, wherever they are.",
  },
  {
    title: "No dollar-only assumptions",
    description:
      "Every figure formats natively in Dollars, Euros, Naira, Rand, Rupees, or any of 180+ world currencies — currency support isn't an afterthought.",
  },
  {
    title: "Real tools, not a locked-down toy",
    description:
      "A full SQL and Python notebook sits right next to the drag-and-drop dashboard builder, for the moments a chart picker isn't enough.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">About Daha BI</h1>
        <p className="mt-4 text-lg text-[var(--text-secondary)]">
          Daha BI is a business intelligence platform for growing businesses everywhere — connect your data, build
          dashboards in minutes, and get answers in plain English, on a phone or a laptop, in whatever currency
          your business runs on.
        </p>
        <p className="mt-4 text-[var(--text-secondary)]">
          Most BI platforms were built for a different market: desktop-first, dollar-denominated, and assuming a
          dedicated analyst on staff. We built Daha BI for founders and small teams who need real answers from
          their data today, without hiring a data team to get there — a philosophy shaped by building first for
          mobile-first, multi-currency markets, and one that holds up anywhere.
        </p>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface-1)] py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-xl font-semibold text-[var(--text-primary)]">What we believe</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title}>
                <h3 className="font-medium text-[var(--text-primary)]">{v.title}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Want to talk to us?</h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Reach out at{" "}
          <a href="mailto:hello@daha.bi" className="text-[var(--series-1)]">
            hello@daha.bi
          </a>
          .
        </p>
        <Link
          href="/register"
          className="mt-6 inline-block rounded-md bg-[var(--series-1)] px-6 py-3 text-sm font-medium text-white"
        >
          Get started free
        </Link>
      </section>

      <Footer />
    </div>
  );
}
