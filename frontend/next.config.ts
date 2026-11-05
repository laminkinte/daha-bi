import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets teammates reach the dev server through a shared VS Code dev tunnel
  // (e.g. https://xxxxx-3000.use.devtunnels.ms) — Next.js blocks unrecognized
  // cross-origin hosts in dev mode by default.
  allowedDevOrigins: ["*.devtunnels.ms"],
};

// No [locale] URL segment — locale is a cookie the user can switch via a menu, so every
// existing route path stays exactly as it is. See src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
