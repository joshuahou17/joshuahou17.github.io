// Supabase Edge Function: track
//
// Records one page view for joshhou.com. Called by /analytics.js on every
// page. Public by necessity -- every visitor's browser hits it -- so it
// accepts only a path and works everything else out server-side.
//
// Privacy: no cookies, and no raw IP is ever stored. A visitor is identified
// by sha256(today's salt + IP + user agent). The salt is regenerated daily
// and salts older than two days are deleted, so hashes cannot be reversed and
// a visitor on one day cannot be linked to the same visitor on another.
//
// Deploy:  supabase functions deploy track --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Anything matching this is a crawler, not a reader. Stored with is_bot = true
// so the dashboard can report how much of the raw traffic is robots, but
// excluded from every human-facing number.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|curl|wget|python-requests|okhttp|java\/|go-http|libwww|scrapy|feedfetcher|facebookexternalhit|preview|monitor|uptime|pingdom|semrush|ahrefs|mj12|dotbot|petalbot|dataforseo|bytespider|gptbot|claudebot|ccbot|perplexity/i;

function sectionFor(path: string): string {
  if (path === "/" || path === "/index.html") return "home";
  const top = path.split("/")[1] || "";
  if (["digest", "bible", "split", "calendar-peek"].includes(top)) return top;
  return "other";
}

// An inbound referrer is a PUBLIC page that linked to us, so unlike paths on
// our own site it is kept whole -- query string included. For HN and Reddit the
// identifying part is the query (/item?id=123); dropping it would leave only a
// link to their front page, which answers nothing.
// Returns [host, full url], both null for internal or unparseable referrers.
function referrerParts(raw: unknown): [string | null, string | null] {
  if (typeof raw !== "string" || !raw) return [null, null];
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return [null, null];
    const h = u.hostname.replace(/^www\./, "");
    if (!h || h === "joshhou.com" || h.endsWith(".joshhou.com")) return [null, null]; // internal
    const full = (h + u.pathname + u.search).replace(/\/$/, "");
    return [h.slice(0, 120), full.slice(0, 500)];
  } catch {
    return [null, null];
  }
}

function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.split("?")[0].split("#")[0].trim();
  if (!p.startsWith("/")) return null;
  if (p.length > 300) return null;
  if (!/^[\w\-./]+$/.test(p)) return null;     // reject anything exotic
  if (p.length > 1) p = p.replace(/\/+$/, ""); // /digest/ -> /digest
  return p || "/";
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Today's salt, created on demand. Salts older than two days are deleted,
// which is what makes yesterday's hashes permanently unlinkable.
async function saltForToday(sb: ReturnType<typeof createClient>, day: string): Promise<string> {
  const { data: existing } = await sb
    .from("site_analytics_salt").select("salt").eq("day", day).maybeSingle();
  if (existing?.salt) return existing.salt as string;

  const fresh = crypto.randomUUID() + crypto.randomUUID();
  // ignoreDuplicates: two concurrent first-hits of the day both try to insert.
  await sb.from("site_analytics_salt").upsert({ day, salt: fresh }, { onConflict: "day", ignoreDuplicates: true });
  await sb.from("site_analytics_salt").delete().lt("day", new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10));

  const { data: after } = await sb
    .from("site_analytics_salt").select("salt").eq("day", day).maybeSingle();
  return (after?.salt as string) ?? fresh;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const path = cleanPath(body?.path);
    // A bad path is the caller's problem, not an error worth surfacing.
    if (!path) return new Response(null, { status: 204, headers: CORS });

    const ua = req.headers.get("user-agent") ?? "";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";
    const country = req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? null;
    const isBot = !ua || BOT_RE.test(ua);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ref = referrerParts(body?.ref);
    const day = new Date().toISOString().slice(0, 10);
    const salt = await saltForToday(sb, day);

    await sb.from("site_page_views").insert({
      day,
      path,
      section: sectionFor(path),
      referrer_host: ref[0],
      referrer_url: ref[1],
      visitor_hash: await sha256(`${salt}|${ip}|${ua}`),
      country: country && country !== "XX" ? country : null,
      is_bot: isBot,
    });

    return new Response(null, { status: 204, headers: CORS });
  } catch (_e) {
    // Never let analytics break a page view. Swallow and move on.
    return new Response(null, { status: 204, headers: CORS });
  }
});
