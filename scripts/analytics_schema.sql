-- Site Analytics — Supabase Schema
-- Run this in the Supabase SQL Editor (same as bible_schema.sql).
--
-- Powers the dashboard at /admin. Deliberately cookie-free: a visitor is
-- identified by a hash of (today's salt + IP + user agent). The salt is
-- regenerated daily and old salts are deleted, so the hashes cannot be
-- reversed and yesterday's visitor cannot be matched to today's. No raw IP
-- is ever written to the database.

-- 1. Daily rotating salt.
--    One row per UTC day. The track function creates today's row on demand
--    and deletes anything older than two days, so this table stays tiny and
--    old hashes become permanently unlinkable.
CREATE TABLE IF NOT EXISTS site_analytics_salt (
    day  DATE PRIMARY KEY,
    salt TEXT NOT NULL
);

-- 2. Page views.
--    One row per view. `visitor_hash` is the salted hash described above --
--    it is only comparable to other hashes from the SAME day.
CREATE TABLE IF NOT EXISTS site_page_views (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- denormalised UTC date so the dashboard groups without a function call
    day           DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
    path          TEXT NOT NULL,
    -- home | digest | bible | split | calendar-peek | other
    section       TEXT NOT NULL DEFAULT 'other',
    -- hostname, for grouping ("HN sent 151 views")
    referrer_host TEXT,
    -- the full linking page, so "which post linked me" is answerable. Kept
    -- WITH its query string: for HN and Reddit the identifying part lives
    -- there (/item?id=123), so stripping it discards the whole point. An
    -- inbound referrer is a public page, not private data -- unlike a URL on
    -- our own site, where query strings can carry tokens.
    referrer_url  TEXT,
    visitor_hash  TEXT NOT NULL,
    country       TEXT,
    -- bots are stored rather than dropped, so the dashboard can show how much
    -- of the raw traffic is crawlers -- but every index below excludes them
    is_bot        BOOLEAN NOT NULL DEFAULT FALSE
);

-- 3. Indexes.
--    Every dashboard query is "recent days, humans only", so these are PARTIAL
--    indexes on `NOT is_bot`. On a personal site bots are a large share of
--    rows; excluding them keeps the indexes small and the scans cheap.
--    Composite order is equality-then-range per Postgres' leftmost-prefix rule.
CREATE INDEX IF NOT EXISTS site_page_views_day_idx
    ON site_page_views (day) WHERE NOT is_bot;

CREATE INDEX IF NOT EXISTS site_page_views_day_path_idx
    ON site_page_views (day, path) WHERE NOT is_bot;

-- supports COUNT(DISTINCT visitor_hash) per day
CREATE INDEX IF NOT EXISTS site_page_views_day_visitor_idx
    ON site_page_views (day, visitor_hash) WHERE NOT is_bot;

CREATE INDEX IF NOT EXISTS site_page_views_day_referrer_idx
    ON site_page_views (day, referrer_host)
    WHERE NOT is_bot AND referrer_host IS NOT NULL;

-- 3b. Migration, if the table already exists from an earlier run:
ALTER TABLE site_page_views ADD COLUMN IF NOT EXISTS referrer_url TEXT;

-- 4. Row Level Security.
--    Both tables get RLS enabled with NO policies. That denies the `anon` and
--    `authenticated` roles everything -- the public anon key cannot read or
--    write these tables even though it is published in the page source. The
--    edge functions use the service role, which bypasses RLS by design.
ALTER TABLE site_page_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_analytics_salt  ENABLE ROW LEVEL SECURITY;

-- 5. Retention (optional).
--    Nothing here expires on its own. If the table ever gets large, schedule
--    this with pg_cron:
--
--    SELECT cron.schedule('prune-page-views', '0 4 * * *', $$
--      DELETE FROM site_page_views WHERE day < current_date - INTERVAL '400 days';
--    $$);

-- 6. Aggregation function.
--    The dashboard calls this instead of reading rows. Two reasons: PostgREST
--    caps plain selects at 1000 rows (so a JS-side count would silently
--    under-report once traffic grows), and COUNT(DISTINCT ...) belongs in the
--    database anyway.
--
--    SECURITY INVOKER (the default -- deliberately NOT definer): the caller's
--    own privileges still apply, so the service role the edge function uses
--    works, while the public anon key stays blocked by RLS.
CREATE OR REPLACE FUNCTION site_analytics_summary(window_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH b AS (
    SELECT (current_date - GREATEST(window_days, 1) + 1)::date AS from_day,
           current_date AS to_day
),
human AS (
    SELECT v.* FROM site_page_views v, b
    WHERE v.day >= b.from_day AND v.day <= b.to_day AND NOT v.is_bot
),
days AS (
    SELECT generate_series(b.from_day, b.to_day, INTERVAL '1 day')::date AS day FROM b
),
daily AS (
    -- LEFT JOIN so days with no traffic appear as zero rather than vanishing,
    -- which would make the chart lie about gaps.
    SELECT d.day,
           COUNT(h.id)                      AS views,
           COUNT(DISTINCT h.visitor_hash)   AS uniques
    FROM days d LEFT JOIN human h ON h.day = d.day
    GROUP BY d.day
)
SELECT jsonb_build_object(
    'generated_at', now(),
    'window_days',  GREATEST(window_days, 1),
    'from_day',     (SELECT from_day FROM b),
    'to_day',       (SELECT to_day FROM b),
    'totals', jsonb_build_object(
        'views', (SELECT COUNT(*) FROM human),
        -- NOT distinct people over the window: the salt rotates nightly, so a
        -- visitor returning on five days counts five times. Labelled honestly
        -- in the dashboard.
        'daily_uniques_summed', (SELECT COALESCE(SUM(uniques), 0) FROM daily),
        'bot_views', (SELECT COUNT(*) FROM site_page_views v, b
                      WHERE v.day >= b.from_day AND v.day <= b.to_day AND v.is_bot)
    ),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'day', day, 'views', views, 'uniques', uniques) ORDER BY day), '[]'::jsonb)
              FROM daily),
    'top_pages', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('path', path, 'views', COUNT(*),
                                  'uniques', COUNT(DISTINCT visitor_hash)) AS x
        FROM human GROUP BY path ORDER BY COUNT(*) DESC LIMIT 25) t),
    'top_referrers', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('host', referrer_host, 'views', COUNT(*)) AS x
        FROM human WHERE referrer_host IS NOT NULL
        GROUP BY referrer_host ORDER BY COUNT(*) DESC LIMIT 25) t),
    -- the actual linking pages, so a source can be opened and read
    'linking_pages', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('url', referrer_url, 'views', COUNT(*)) AS x
        FROM human WHERE referrer_url IS NOT NULL
        GROUP BY referrer_url ORDER BY COUNT(*) DESC LIMIT 25) t),
    'sections', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('section', section, 'views', COUNT(*)) AS x
        FROM human GROUP BY section ORDER BY COUNT(*) DESC) t),
    'countries', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('country', country, 'views', COUNT(*)) AS x
        FROM human WHERE country IS NOT NULL
        GROUP BY country ORDER BY COUNT(*) DESC LIMIT 15) t)
);
$$;

-- Belt and braces: the function is invoker-rights so RLS already blocks the
-- public key, but there is no reason for it to be callable at all.
REVOKE ALL ON FUNCTION site_analytics_summary(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION site_analytics_summary(INT) FROM anon, authenticated;
