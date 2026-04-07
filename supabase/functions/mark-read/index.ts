// Supabase Edge Function: mark-read
// Handles email "Mark as Read" button clicks.
//
// Query params:
//   user_id  - UUID of the user/subscriber
//   day      - Day number in the reading plan
//   token    - HMAC token for validation
//
// Validates HMAC, upserts reading progress, increments subscriber's
// current_day if they're behind, and redirects to confirmation page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HMAC_SECRET = Deno.env.get("HMAC_SECRET") || "dev-secret";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

async function generateHmac(
  userId: string,
  dayNumber: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${userId}:${dayNumber}`)
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

  // Validate HMAC token
  const expectedToken = await generateHmac(userId, day);
  if (token !== expectedToken) {
    return new Response("Invalid token", { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const dayNumber = parseInt(day);

  // Upsert reading progress
  const { error: progressError } = await supabase
    .from("bible_reading_progress")
    .upsert(
      {
        user_id: userId,
        day_number: dayNumber,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,day_number" }
    );

  if (progressError) {
    console.error("Progress upsert failed:", progressError);
    return new Response("Failed to mark as read", { status: 500 });
  }

  // Check if this user is a subscriber and update their current_day
  const { data: subscriber } = await supabase
    .from("bible_subscribers")
    .select("id, current_day, email, preferred_translation")
    .eq("id", userId)
    .single();

  if (subscriber && subscriber.current_day === dayNumber) {
    // Increment current_day
    const newDay = dayNumber + 1;
    await supabase
      .from("bible_subscribers")
      .update({ current_day: newDay })
      .eq("id", subscriber.id);

    // Check if subscriber is behind the calendar day
    // If so, send the next passage email immediately
    const { data: nextEntry } = await supabase
      .from("bible_reading_plan")
      .select("*")
      .eq("day_number", newDay)
      .single();

    if (nextEntry) {
      const today = new Date().toISOString().split("T")[0];
      const entryDate = nextEntry.date;

      // If the next entry's date is in the past or today, they're catching up
      if (entryDate <= today && RESEND_API_KEY) {
        // Send catch-up email (lightweight, just passage info)
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Daily Bible Reading <bible@joshhou.com>",
              to: [subscriber.email],
              subject: `📖 Day ${newDay}: ${nextEntry.passage} — Keep going!`,
              html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
                  <p style="color: #9E9E9E; font-size: 14px;">Day ${newDay} of 364</p>
                  <h2 style="font-size: 24px;">${nextEntry.passage}</h2>
                  <p style="color: #616161;">You're catching up! Here's your next reading.</p>
                  <a href="https://joshhou.com/bible/posts/${nextEntry.date}.html"
                     style="display: inline-block; background: #6366F1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">
                    Read Now →
                  </a>
                </div>
              `,
            }),
          });
        } catch (e) {
          console.error("Catch-up email failed:", e);
        }
      }
    }
  }

  // Redirect to confirmation page
  return new Response(null, {
    status: 302,
    headers: { Location: "https://joshhou.com/bible/confirmed.html" },
  });
});
