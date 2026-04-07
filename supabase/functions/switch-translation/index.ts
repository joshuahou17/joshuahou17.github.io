// Supabase Edge Function: switch-translation
// Updates a subscriber's preferred Bible translation.
//
// Query params:
//   subscriber_id - UUID of the subscriber
//   translation   - New preferred translation (NIV or ESV)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_TRANSLATIONS = ["NIV", "ESV"];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const subscriberId = url.searchParams.get("subscriber_id");
  const translation = url.searchParams.get("translation");

  if (!subscriberId || !translation) {
    return new Response("Missing parameters", { status: 400 });
  }

  if (!VALID_TRANSLATIONS.includes(translation)) {
    return new Response(`Invalid translation. Must be one of: ${VALID_TRANSLATIONS.join(", ")}`, {
      status: 400,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { error } = await supabase
    .from("bible_subscribers")
    .update({ preferred_translation: translation })
    .eq("id", subscriberId);

  if (error) {
    console.error("Translation update failed:", error);
    return new Response("Failed to update translation preference", { status: 500 });
  }

  // Return a simple confirmation page
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Translation Updated</title>
</head>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; text-align: center;">
    <div style="font-size: 3rem; margin-bottom: 1rem;">&#10003;</div>
    <h1 style="font-size: 1.5rem; margin-bottom: 0.75rem;">Translation updated to ${translation}!</h1>
    <p style="color: #757575;">Your future emails will use the ${translation} translation.</p>
    <a href="https://joshhou.com/bible" style="color: #6366F1; text-decoration: none; margin-top: 1rem; display: inline-block;">Back to Daily Bible Reading &rarr;</a>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }
  );
});
