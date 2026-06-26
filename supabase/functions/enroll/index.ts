// Supabase Edge Function: enroll
//
// The website calls this when someone enters their email to start/continue.
// Finds the subscriber by email (creating one if new, reactivating if they had
// unsubscribed) and returns their STABLE subscriber id. The website then keys
// all reading progress to that id, so the website, the daily email, and every
// device share one record. Uses the service key (the public key can't read or
// upsert the subscribers table). No verification by design.
//
// Deploy: supabase functions deploy enroll --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const raw = url.searchParams.get("email") || "";
  const email = raw.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid email" }, 400);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { data: existing } = await sb
      .from("bible_subscribers")
      .select("id, start_date, current_day")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      // Returning reader: make sure they're active and have a start date.
      const patch: Record<string, unknown> = { unsubscribed: false };
      if (!existing.start_date) patch.start_date = today;
      await sb.from("bible_subscribers").update(patch).eq("id", existing.id);
      return json({
        id: existing.id,
        email,
        start_date: existing.start_date || today,
        current_day: existing.current_day || 1,
        returning: true,
      });
    }

    const { data: created, error } = await sb
      .from("bible_subscribers")
      .insert({ email, start_date: today, current_day: 1, unsubscribed: false })
      .select("id, start_date, current_day")
      .single();
    if (error) throw error;
    return json({ id: created.id, email, start_date: created.start_date, current_day: created.current_day, returning: false });
  } catch (e) {
    return json({ error: "enroll failed", detail: String(e) }, 500);
  }
});
