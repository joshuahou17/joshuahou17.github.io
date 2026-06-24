// Supabase Edge Function: unsubscribe
//
// Marks a subscriber as unsubscribed. Called from:
//   - the website footer "Unsubscribe" button:  ?email=<email>
//   - the daily email's unsubscribe link:        ?user_id=<id>
// Shows a confirmation page either way.
//
// Deploy:
//   supabase functions deploy unsubscribe --no-verify-jwt
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <body style="font-family:Georgia,serif;background:#f7f5f0;color:#1d1c18;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px">
     <div>${body}</div></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const userId = url.searchParams.get("user_id");

  if (!email && !userId) return page("<h1>Missing email.</h1>", 400);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let q = supabase.from("bible_subscribers").update({ unsubscribed: true });
    q = userId ? q.eq("user_id", userId) : q.ilike("email", email!);
    const { error } = await q;
    if (error) throw error;
  } catch (_e) {
    return page("<h1>Something went wrong.</h1><p>Please try again.</p>", 500);
  }

  return page(
    `<h1 style="font-weight:400;font-size:32px;margin:.2em 0">You're unsubscribed.</h1>
     <p style="color:#6b675c">You won't receive any more daily reading emails.</p>
     <p style="margin-top:24px"><a href="https://joshhou.com/bible" style="font-family:'Courier New',monospace;font-size:13px;color:#2f3a8c">Resubscribe anytime &rarr;</a></p>`,
  );
});
