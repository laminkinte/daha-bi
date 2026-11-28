import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import Sidebar from "@/components/Sidebar";
import PlanLimitPrompt from "@/components/PlanLimitPrompt";
import { UiTranslationsProvider, type UiDictionary } from "@/i18n/ui";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (location.pathname.indexOf("/embed/") === 0) return;
    var theme = window.localStorage.getItem("daha_bi_theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daha BI",
  description: "Mobile-first business intelligence for growing businesses, in any currency, anywhere in the world.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  // Interface text is keyed by its English wording; English itself needs no dictionary.
  const uiDict: UiDictionary = locale === "en" ? {} : (await import(`../../messages/ui/${locale}.json`)).default;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-[var(--page-plane)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <NextIntlClientProvider messages={messages}>
          <UiTranslationsProvider locale={locale} dict={uiDict}>
          <ThemeProvider>
            <AuthProvider>
              <Sidebar>{children}</Sidebar>
              <PlanLimitPrompt />
            </AuthProvider>
          </ThemeProvider>
          </UiTranslationsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
