// Supabase Edge Function: analytics-summary
//
// Private dashboard data for /admin. Returns aggregated page-view stats for a
// rolling window. Gated by a secret key (?key= or x-admin-key header), same
// shape as admin-summary, but a SEPARATE secret so the two dashboards cannot
// unlock each other.
//
// All aggregation happens in Postgres (site_analytics_summary), not here.
//
// Deploy:  supabase functions deploy analytics-summary --no-verify-jwt
// Secret:  supabase secrets set ANALYTICS_ADMIN_KEY=<your secret>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Compare in constant time so a wrong key cannot be narrowed down by timing.
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-admin-key") || "";
  const expected = Deno.env.get("ANALYTICS_ADMIN_KEY") || "";
  if (!expected || !secretsMatch(key, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 365);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await sb.rpc("site_analytics_summary", { window_days: days });
  if (error) return json({ error: error.message }, 500);

  return json(data);
});
