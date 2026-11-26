import { NextResponse, type NextRequest } from "next/server";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8899/api";

/** "*.example.org" → "https://*.example.org http://*.example.org" (http only matters for local testing). */
function sources(domains: string[]): string {
  return domains.flatMap((d) => [`https://${d}`, `http://${d}`]).join(" ");
}

/**
 * Who may show our pages inside an <iframe>:
 *  - /embed/{token}: only the sites the embed's owner listed (no list = anywhere). The browser
 *    enforces CSP frame-ancestors, so a copied embed code won't work on someone else's site.
 *    If the lookup fails we fail closed (same-origin only).
 *  - every other page: nobody else (clickjacking protection).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const response = NextResponse.next();
  // Build assets and files need no framing policy.
  if (path.startsWith("/_next/") || /\.[a-z0-9]{2,5}$/i.test(path)) return response;

  if (!path.startsWith("/embed/")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    return response;
  }

  const token = path.split("/")[2] ?? "";
  let ancestors = "'self'";
  try {
    const res = await fetch(`${API}/public/embeds/${encodeURIComponent(token)}/frame-policy`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (res.ok) {
      const { allowed_domains } = (await res.json()) as { allowed_domains: string[] | null };
      // Dead/unknown embeds may still render their "no longer available" message anywhere.
      ancestors = !allowed_domains || allowed_domains.length === 0 ? "*" : `'self' ${sources(allowed_domains)}`;
    }
  } catch {
    // keep 'self'
  }
  response.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors}`);
  return response;
}

export default proxy;

// No `matcher`: a path pattern with a lookahead made every dynamic route 404 under this
// Next/Turbopack version, so assets are filtered inside proxy() instead.
