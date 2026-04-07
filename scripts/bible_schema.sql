-- Bible Reading Plan — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables, RLS, and indexes.

-- 1. Reading plan table (seeded from reading_plan.json)
CREATE TABLE IF NOT EXISTS bible_reading_plan (
    day_number INTEGER PRIMARY KEY,
    date DATE NOT NULL,
    weekday TEXT NOT NULL,
    genre TEXT NOT NULL,
    passage TEXT NOT NULL,
    week INTEGER NOT NULL
);

-- 2. Reading progress table (per-user completion tracking)
CREATE TABLE IF NOT EXISTS bible_reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    day_number INTEGER NOT NULL REFERENCES bible_reading_plan(day_number),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, day_number)
);

-- 3. Email subscribers table
CREATE TABLE IF NOT EXISTS bible_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    subscribed_at TIMESTAMPTZ DEFAULT now(),
    unsubscribed BOOLEAN NOT NULL DEFAULT FALSE,
    preferred_translation TEXT NOT NULL DEFAULT 'NIV',
    current_day INTEGER NOT NULL DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON bible_reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_day ON bible_reading_progress(day_number);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON bible_subscribers(email);

-- Row Level Security

-- bible_reading_plan: public read, no write from client
ALTER TABLE bible_reading_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to reading plan"
    ON bible_reading_plan FOR SELECT
    USING (true);

-- bible_reading_progress: users can read/write their own rows
ALTER TABLE bible_reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress"
    ON bible_reading_progress FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own progress"
    ON bible_reading_progress FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update own progress"
    ON bible_reading_progress FOR UPDATE
    USING (true);

-- bible_subscribers: insert from client (subscribe), read/update via service key only
ALTER TABLE bible_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe"
    ON bible_subscribers FOR INSERT
    WITH CHECK (true);
