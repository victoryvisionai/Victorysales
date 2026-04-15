-- Fix anon key access for tables used by settings.html
-- Run in Supabase SQL Editor

-- email_blacklist: allow anon to read (used for auth suppression check)
ALTER TABLE email_blacklist DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON email_blacklist TO anon;

-- user_ad_settings: allow anon to read/write (RLS already disabled, grants missing)
GRANT SELECT, INSERT, UPDATE ON user_ad_settings TO anon;
