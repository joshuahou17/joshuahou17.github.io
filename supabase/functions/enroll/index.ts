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

const EMAIL_FROM = "Daily Bible Reading <bible@joshhou.com>";
const SITE = "https://joshhou.com";

// Send a one-time welcome with Day 1 the moment someone subscribes.
async function sendWelcome(email: string, subId: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return; // can't send without the key; skip silently
  let day: Record<string, unknown> = {};
  try {
    const r = await fetch(`${SITE}/bible/posts/day-001.json`);
    if (r.ok) day = await r.json();
  } catch (_e) { /* fall back to defaults */ }
  const passage = (day.passage as string) || "Genesis 1-3";
  const buttons = ((day.buttons as Array<{ label: string; url: string }>) || [])
    .map((b) => `<a href="${b.url}" style="display:inline-block;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.03em;text-decoration:none;padding:12px 20px;border-radius:999px;background:#1d1c18;color:#f7f5f0;margin:0 8px 10px 0;">${b.label} &rarr;</a>`)
    .join("");
  const unsub = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/unsubscribe?user_id=${subId}`;
  const html =
    `<!doctype html><html><body style="margin:0;background:#efece4;font-family:Georgia,serif;color:#1d1c18;line-height:1.65;">` +
    `<div style="max-width:600px;margin:0 auto;background:#f7f5f0;padding:32px 28px 40px;">` +
    `<p style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a8a496;margin:0 0 12px;">Welcome</p>` +
    `<h1 style="font-size:28px;font-weight:normal;letter-spacing:-0.02em;margin:0 0 10px;">You're in. Let's begin.</h1>` +
    `<p style="font-size:17px;line-height:1.7;">You're starting a one-year journey through the whole Bible, in chronological order. Each morning at 6 AM ET we'll send the day's reading and a short analysis. Here's <strong>Day 1 &mdash; ${passage}</strong>:</p>` +
    `<div style="margin:18px 0;">${buttons}</div>` +
    `<p style="margin:0 0 24px;"><a href="${SITE}/bible" style="display:inline-block;font-family:'Courier New',monospace;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:999px;background:#2f3a8c;color:#ffffff;">Read today's analysis &rarr;</a></p>` +
    `<p style="font-size:15px;color:#6b675c;">Tip: mark each day read on the site to track your progress &mdash; it syncs across your devices and these emails.</p>` +
    `<div style="border-top:1px solid #e7e2d6;padding-top:16px;margin-top:24px;font-family:'Courier New',monospace;font-size:11px;color:#a8a496;">` +
    `<p style="margin:0;">Scripture opens in the NIV on the YouVersion Bible App.</p>` +
    `<p style="margin:8px 0 0;"><a href="${unsub}" style="color:#a8a496;">Unsubscribe</a></p></div></div></body></html>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject: `Welcome to Daily Bible Reading — Day 1: ${passage}`, html }),
    });
  } catch (_e) { /* don't fail enrollment if the email send hiccups */ }
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
    await sendWelcome(email, created.id);  // one-time welcome with Day 1
    return json({ id: created.id, email, start_date: created.start_date, current_day: created.current_day, returning: false });
  } catch (e) {
    return json({ error: "enroll failed", detail: String(e) }, 500);
  }
});
