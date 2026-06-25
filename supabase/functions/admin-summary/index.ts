// Supabase Edge Function: admin-summary
//
// Private dashboard data for /bible/admin.html. Returns, per subscriber,
// how many days they've marked read, how far they've gotten, and when they
// last read. Gated by a secret key (?key= or x-admin-key header) so the
// public can't read subscriber data. Uses the service key server-side.
//
// Deploy:  supabase functions deploy admin-summary --no-verify-jwt
// Secret:  supabase secrets set ADMIN_KEY=<your secret>

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-admin-key");
  if (!key || key !== Deno.env.get("ADMIN_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs } = await sb
    .from("bible_subscribers")
    .select("id, email, user_id, current_day, start_date, unsubscribed");
  const { data: prog } = await sb
    .from("bible_reading_progress")
    .select("user_id, day_number, completed, completed_at");

  // aggregate completed-day stats per user_id
  const byUser: Record<string, { count: number; furthest: number; last: string | null }> = {};
  for (const p of prog ?? []) {
    if (!p.completed) continue;
    const u = (byUser[p.user_id] ??= { count: 0, furthest: 0, last: null });
    u.count++;
    if (p.day_number > u.furthest) u.furthest = p.day_number;
    if (!u.last || (p.completed_at && p.completed_at > u.last)) u.last = p.completed_at;
  }

  const rows = (subs ?? []).map((s) => {
    const a = byUser[s.user_id] || byUser[s.id] || { count: 0, furthest: 0, last: null };
    return {
      email: s.email,
      days_read: a.count,
      furthest_day: a.furthest,
      last_read_at: a.last,
      current_day: s.current_day,
      unsubscribed: s.unsubscribed,
    };
  });
  rows.sort((a, b) => b.days_read - a.days_read);

  const subIds = new Set((subs ?? []).flatMap((s) => [s.user_id, s.id]));
  const anonymous = Object.keys(byUser).filter((u) => !subIds.has(u)).length;

  return json({
    generated_at: new Date().toISOString(),
    total_subscribers: rows.length,
    active_subscribers: rows.filter((r) => !r.unsubscribed).length,
    anonymous_readers: anonymous,
    subscribers: rows,
  });
});
