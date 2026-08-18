// Supabase Edge Function: set-gospel-start
//
// Backs the "Read the Gospels now" button on /bible/progress.html. Stores (or
// clears) the date the reader wants the gospel block to start, so the daily
// email picks the same reading the website shows.
//
// The browser can't write this itself: the anon key has no update policy on
// bible_subscribers, so this runs with the service key — same shape as
// switch-translation, but fetched from the page, so it needs CORS and JSON.
//
// Query params:
//   subscriber_id - UUID of the subscriber (the id enroll handed back)
//   date          - YYYY-MM-DD, today or later; sets the jump
//   clear=1       - removes the jump, restoring the original plan order
//
// Deploy: supabase functions deploy set-gospel-start --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

// The site is anchored to US Eastern (the 6am send is 6am ET), so "today" is
// judged there too — otherwise a UTC clock rejects a valid same-day pick all
// evening for readers in the Americas.
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const subscriberId = url.searchParams.get("subscriber_id");
  const clear = url.searchParams.get("clear");
  const date = url.searchParams.get("date");

  if (!subscriberId) return json({ error: "missing subscriber_id" }, 400);

  let value: string | null = null;
  if (!clear) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);
    if (date < todayET()) return json({ error: "date must be today or later" }, 400);
    value = date;
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await sb
    .from("bible_subscribers")
    .update({ gospel_start: value })
    .eq("id", subscriberId);

  if (error) {
    console.error("gospel_start update failed:", error);
    return json({ error: "update failed" }, 500);
  }
  return json({ ok: true, gospel_start: value });
});
