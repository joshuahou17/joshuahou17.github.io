// Supabase Edge Function: migrate-progress  (one-time, key-gated)
//
// Re-keys existing reading progress from the old per-browser IDs onto each
// subscriber's stable id, so the website (after email login), the daily email,
// and every device share one record. Idempotent: re-running does nothing once
// everything is under the subscriber id. Also clears leftover test rows.
//
// Deploy: supabase functions deploy migrate-progress --no-verify-jwt
// Call:   GET /functions/v1/migrate-progress?key=<ADMIN_KEY>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEST_IDS = ["flow-test-user-001", "functional-test-row", "qa-readahead", "qa-flow2"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if ((url.searchParams.get("key") || "") !== Deno.env.get("ADMIN_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) remove leftover test rows
  await sb.from("bible_reading_progress").delete().in("user_id", TEST_IDS);

  // 2) re-key each subscriber's browser-keyed progress onto their stable id
  const { data: subs, error } = await sb.from("bible_subscribers").select("id, user_id, email");
  if (error) return json({ error: String(error) }, 500);

  let moved = 0;
  const movedFor: string[] = [];
  for (const s of subs || []) {
    if (!s.user_id || s.user_id === s.id) continue;
    const { data: rows } = await sb
      .from("bible_reading_progress")
      .select("day_number, completed, completed_at")
      .eq("user_id", s.user_id);
    if (!rows || !rows.length) continue;
    for (const r of rows) {
      await sb.from("bible_reading_progress").upsert(
        { user_id: s.id, day_number: r.day_number, completed: r.completed, completed_at: r.completed_at },
        { onConflict: "user_id,day_number" },
      );
      await sb.from("bible_reading_progress").delete().eq("user_id", s.user_id).eq("day_number", r.day_number);
      moved++;
    }
    movedFor.push(s.email);
  }

  return json({ ok: true, rows_moved: moved, subscribers_migrated: movedFor });
});
