// Supabase Edge Function: joyshua
//
// The only way anything gets written for joshhou.com/joyshua. The page is
// editable by anyone with the link (Josh's call), so this is where the page is
// kept safe instead:
//   - every input is checked and trimmed, and text has hard length caps
//   - each visitor is rate-limited (by a daily-salted hash, like `track`; no IP
//     is stored), and uploads have a whole-site daily cap
//   - every change is written to joyshua_log with its old and new value BEFORE
//     it's applied, and nothing is ever deleted, so anything can be rolled back
//
// Tables and bucket come from scripts/joyshua_schema.sql, which must be applied
// before this is deployed.
//
// Deploy:  supabase functions deploy joyshua --no-verify-jwt

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "joyshua";
const WRITES_PER_10_MIN = 60;       // per visitor
const UPLOADS_PER_DAY_VISITOR = 40; // signed upload slots, per visitor
const UPLOADS_PER_DAY_TOTAL = 120;  // across the whole page
const AUTHORS = ["josh", "joyce"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

class Bad extends Error {}

// Plain text only: no control characters, whitespace collapsed (except the
// newlines a letter needs), trimmed, capped.
function text(v: unknown, max: number, { multiline = false, required = false } = {}): string {
  if (v == null) v = "";
  if (typeof v !== "string") throw new Bad("expected text");
  let s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  s = multiline
    ? s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
    : s.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new Bad(`text longer than ${max}`);
  if (required && !s) throw new Bad("text required");
  return s;
}

function num(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : NaN;
  if (!isFinite(n)) throw new Bad("expected a number");
  return Math.round(Math.min(hi, Math.max(lo, n)) * 10) / 10;
}

function int(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  if (!isFinite(n) || n < lo || n > hi) throw new Bad("number out of range");
  return n;
}

function author(v: unknown): string {
  if (typeof v !== "string" || !AUTHORS.includes(v)) throw new Bad("unknown author");
  return v;
}

// A photo is either one of the page's own files or one uploaded here.
function photoSrc(v: unknown): string {
  if (typeof v !== "string" || v.length > 300) throw new Bad("bad photo");
  if (/^\/joyshua\/photos\/[\w\-/]+\.(webp|jpg|jpeg|png)$/.test(v)) return v;
  if (/^uploads\/[\w\-/]+\.(jpg|webp)$/.test(v)) return v;
  throw new Bad("bad photo");
}

function uploadPath(v: unknown): string {
  if (typeof v !== "string" || !/^uploads\/\d{4}-\d{2}\/[0-9a-f-]{36}(-t)?\.jpg$/.test(v)) throw new Bad("bad upload path");
  return v;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Same daily salt the analytics beacon uses, so the hash can't be reversed and
// a visitor today can't be linked to the same visitor tomorrow.
async function visitorHash(sb: SupabaseClient, req: Request): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  let { data } = await sb.from("site_analytics_salt").select("salt").eq("day", day).maybeSingle();
  if (!data?.salt) {
    const fresh = crypto.randomUUID() + crypto.randomUUID();
    await sb.from("site_analytics_salt").upsert({ day, salt: fresh }, { onConflict: "day", ignoreDuplicates: true });
    ({ data } = await sb.from("site_analytics_salt").select("salt").eq("day", day).maybeSingle());
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";
  const ua = req.headers.get("user-agent") ?? "";
  return (await sha256(`${data?.salt ?? day}|joyshua|${ip}|${ua}`)).slice(0, 32);
}

async function countLog(sb: SupabaseClient, filter: { visitor?: string; action?: string; since: string }): Promise<number> {
  let q = sb.from("joyshua_log").select("id", { count: "exact", head: true }).gte("at", filter.since);
  if (filter.visitor) q = q.eq("visitor", filter.visitor);
  if (filter.action) q = q.eq("action", filter.action);
  const { count } = await q;
  return count ?? 0;
}

async function log(sb: SupabaseClient, visitor: string, action: string, key: string | null, old: unknown, next: unknown) {
  const { error } = await sb.from("joyshua_log").insert({ action, key, old: old ?? null, new: next ?? null, visitor });
  if (error) throw new Error("log failed: " + error.message);   // no log, no write
}

async function exists(sb: SupabaseClient, path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await sb.storage.from(BUCKET).list(dir, { search: name, limit: 5 });
  return !!data?.some((f) => f.name === name);
}

async function setState(sb: SupabaseClient, visitor: string, action: string, key: string, patch: Record<string, unknown>) {
  const { data: cur } = await sb.from("joyshua_state").select("value").eq("key", key).maybeSingle();
  const next = { ...(cur?.value ?? {}), ...patch };
  await log(sb, visitor, action, key, cur?.value ?? null, next);
  const { error } = await sb.from("joyshua_state").upsert({ key, value: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { key, value: next };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new Bad("expected JSON"); }
    const action = String(body.action ?? "");
    const visitor = await visitorHash(sb, req);

    const tenMin = new Date(Date.now() - 10 * 60e3).toISOString();
    if (await countLog(sb, { visitor, since: tenMin }) >= WRITES_PER_10_MIN) {
      return json({ error: "Slow down a little — try again in a few minutes." }, 429);
    }

    switch (action) {
      // A banner's words and/or where it sits on its photo.
      case "set-label": {
        const src = photoSrc(body.src);
        const patch: Record<string, unknown> = {};
        if ("text" in body) patch.text = text(body.text, 80);
        if ("x" in body) patch.x = num(body.x, -25, 125);
        if ("y" in body) patch.y = num(body.y, -25, 125);
        if ("hidden" in body) patch.hidden = body.hidden === true;   // a banner taken off its photo
        if (!Object.keys(patch).length) throw new Bad("nothing to change");
        return json(await setState(sb, visitor, action, "label:" + src, patch));
      }

      // Delete a postcard, photo or letter -- for everyone. Nothing is erased:
      // it's marked gone (and logged), so it can always be brought back.
      case "remove": {
        const key = typeof body.key === "string" ? body.key : "";
        if (!/^(card|photo|letter|topic):[^\u0000-\u001f]{1,300}$/.test(key)) throw new Bad("bad key");
        return json(await setState(sb, visitor, action, "gone:" + key, { gone: body.gone !== false }));
      }

      // Put a letter in the keepsake box, or take it out.
      case "set-box": {
        const key = text(body.letter, 120, { required: true });
        return json(await setState(sb, visitor, action, "box:" + key, { in: body.in === true }));
      }

      // Hand out signed upload slots: a full-size image and its thumbnail each.
      case "sign-upload": {
        const count = int(body.count, 1, 20);
        const day = new Date(Date.now() - 864e5).toISOString();
        if (await countLog(sb, { visitor, action, since: day }) + count > UPLOADS_PER_DAY_VISITOR ||
            await countLog(sb, { action, since: day }) + count > UPLOADS_PER_DAY_TOTAL) {
          return json({ error: "That's enough uploads for today — try again tomorrow." }, 429);
        }
        const month = new Date().toISOString().slice(0, 7);
        const slots = [];
        for (let i = 0; i < count; i++) {
          const id = crypto.randomUUID();
          const full = `uploads/${month}/${id}.jpg`, thumb = `uploads/${month}/${id}-t.jpg`;
          const a = await sb.storage.from(BUCKET).createSignedUploadUrl(full);
          const b = await sb.storage.from(BUCKET).createSignedUploadUrl(thumb);
          if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
          slots.push({ path: full, url: a.data.signedUrl, thumb, thumbUrl: b.data.signedUrl });
          await log(sb, visitor, action, full, null, null);
        }
        return json({ slots });
      }

      case "add-photos": {
        const who = author(body.author);
        const card = text(body.postcard, 80, { required: true });
        const list = Array.isArray(body.photos) ? body.photos : [];
        if (!list.length || list.length > 20) throw new Bad("1 to 20 photos");
        const rows = [];
        for (const p of list as Record<string, unknown>[]) {
          const row = {
            postcard_key: card,
            path: uploadPath(p.path),
            thumb_path: uploadPath(p.thumb),
            w: int(p.w, 1, 4000), h: int(p.h, 1, 4000),
            label: text(p.label, 80),
            author: who,
          };
          if (!(await exists(sb, row.path)) || !(await exists(sb, row.thumb_path))) throw new Bad("upload missing");
          rows.push(row);
        }
        await log(sb, visitor, action, card, null, rows);
        const { data, error } = await sb.from("joyshua_photos").insert(rows).select();
        if (error) throw new Error(error.message);
        return json({ photos: data });
      }

      case "add-postcard": {
        const row = {
          title: text(body.title, 60, { required: true }),
          front_path: uploadPath(body.path),
          w: int(body.w, 1, 4000), h: int(body.h, 1, 4000),
          author: author(body.author),
        };
        if (!(await exists(sb, row.front_path))) throw new Bad("upload missing");
        await log(sb, visitor, action, row.title, null, row);
        const { data, error } = await sb.from("joyshua_postcards").insert(row).select().single();
        if (error) throw new Error(error.message);
        return json({ postcard: data });
      }

      // A conversation topic, and ticking one off once it's been talked about.
      case "add-topic": {
        const row = { text: text(body.text, 280, { multiline: true, required: true }), author: author(body.author) };
        await log(sb, visitor, action, row.text.slice(0, 60), null, row);
        const { data, error } = await sb.from("joyshua_topics").insert(row).select().single();
        if (error) throw new Error(error.message);
        return json({ topic: data });
      }

      case "set-topic": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!/^[0-9a-f-]{36}$/.test(id)) throw new Bad("bad id");
        const done = body.done === true;
        const { data: cur } = await sb.from("joyshua_topics").select("done_at").eq("id", id).maybeSingle();
        if (!cur) throw new Bad("no such topic");
        await log(sb, visitor, action, id, cur, { done_at: done ? "now" : null });
        const { data, error } = await sb.from("joyshua_topics")
          .update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).select().single();
        if (error) throw new Error(error.message);
        return json({ topic: data });
      }

      case "add-letter": {
        const row = {
          label: text(body.label, 80, { required: true }),
          greeting: text(body.greeting, 80),
          body: text(body.body, 8000, { multiline: true, required: true }),
          closing: text(body.closing, 80),
          name: text(body.name, 40),
          author: author(body.author),
        };
        await log(sb, visitor, action, row.label, null, row);
        const { data, error } = await sb.from("joyshua_letters").insert(row).select().single();
        if (error) throw new Error(error.message);
        return json({ letter: data });
      }

      default:
        throw new Bad("unknown action");
    }
  } catch (err) {
    if (err instanceof Bad) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: "Something went wrong saving that." }, 500);
  }
});
