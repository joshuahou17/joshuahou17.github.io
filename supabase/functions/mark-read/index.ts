// Supabase Edge Function: mark-read
//
// Handles the "Mark as read" button in the daily email. The email links to:
//   {SUPABASE_URL}/functions/v1/mark-read?user_id=<id>&day=<n>&token=<hmac>
// We verify the HMAC (so links can't be forged), record the day as completed
// in bible_reading_progress, and redirect to a confirmation page. The daily
// send decides what to email next (oldest unread day), so this function does
// not touch cadence.
//
// Deploy:
//   supabase functions deploy mark-read --no-verify-jwt
// Required secret (must match the generator's HMAC_SECRET):
//   supabase secrets set HMAC_SECRET=<same value as the GitHub secret>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HMAC_SECRET = Deno.env.get("HMAC_SECRET") || "dev-secret";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function generateHmac(userId: string, dayNumber: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${userId}:${dayNumber}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  const day = url.searchParams.get("day");
  const token = url.searchParams.get("token");

  if (!userId || !day || !token) {
    return new Response("Missing parameters", { status: 400 });
  }

  const expectedToken = await generateHmac(userId, day);
  if (token !== expectedToken) {
    return new Response("Invalid or expired link", { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await supabase
    .from("bible_reading_progress")
    .upsert(
      {
        user_id: userId,
        day_number: parseInt(day),
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,day_number" },
    );

  if (error) {
    console.error("Progress upsert failed:", error);
    return new Response("Failed to mark as read", { status: 500 });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: "https://joshhou.com/bible/confirmed.html" },
  });
});
