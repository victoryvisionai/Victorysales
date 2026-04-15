-- ═══════════════════════════════════════════════════════
-- Victory Vision — RPC Functions + Missing Tables
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. email_blacklist (suppresses 404 in settings.html auth check)
CREATE TABLE IF NOT EXISTS email_blacklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. user_ad_settings (stores Google/MSFT/LinkedIn tracking IDs per customer)
CREATE TABLE IF NOT EXISTS user_ad_settings (
  customer_id             TEXT PRIMARY KEY,
  google_pixel            TEXT,
  google_ads_customer_id  TEXT,
  msft_pixel              TEXT,
  msft_ads_account_id     TEXT,
  linkedin_pixel          TEXT,
  li_ad_account           TEXT,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
-- Allow anon key to read/write (pixel IDs are not sensitive)
ALTER TABLE user_ad_settings DISABLE ROW LEVEL SECURITY;

-- 3. get_oauth_status — returns masked token array as { tokens: [...] }
--    Always returns a JSON object (never null/empty), safe for HTTP Request node.
CREATE OR REPLACE FUNCTION get_oauth_status(p_customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_tokens JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'platform',     platform,
      'access_token', CASE WHEN access_token IS NOT NULL THEN '***' ELSE NULL END,
      'social_name',  social_name,
      'social_email', social_email,
      'expires_at',   expires_at,
      'org_id',       org_id,
      'connected',    (access_token IS NOT NULL)
    )), '[]'::jsonb
  ) INTO v_tokens
  FROM oauth_tokens WHERE customer_id = p_customer_id;
  RETURN jsonb_build_object('tokens', v_tokens);
END;
$$;

-- 4. get_ads_data — returns all 4 tables for a customer as one JSON object
CREATE OR REPLACE FUNCTION get_ads_data(p_customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ads      JSONB;
  v_vict     JSONB;
  v_pages    JSONB;
  v_accts    JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_ads
    FROM ads a WHERE a.customer_id = p_customer_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(v.*)), '[]'::jsonb) INTO v_vict
    FROM victories v WHERE v.customer_id = p_customer_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_pages
    FROM pages p WHERE p.customer_id = p_customer_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(ac.*)), '[]'::jsonb) INTO v_accts
    FROM ad_accounts ac WHERE ac.customer_id = p_customer_id;
  RETURN jsonb_build_object(
    'ads',        v_ads,
    'victories',  v_vict,
    'pages',      v_pages,
    'ad_accounts', v_accts
  );
END;
$$;

-- 5. get_ads_attribution_data — victories + pages + ads for attribution view
CREATE OR REPLACE FUNCTION get_ads_attribution_data(p_customer_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_vict  JSONB;
  v_pages JSONB;
  v_ads   JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(v.*)), '[]'::jsonb) INTO v_vict
    FROM victories v WHERE v.customer_id = p_customer_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_pages
    FROM pages p WHERE p.customer_id = p_customer_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_ads
    FROM ads a WHERE a.customer_id = p_customer_id;
  RETURN jsonb_build_object(
    'victories', v_vict,
    'pages',     v_pages,
    'ads',       v_ads
  );
END;
$$;

-- Grant execute to anon/service role
GRANT EXECUTE ON FUNCTION get_oauth_status(TEXT)          TO anon, service_role;
GRANT EXECUTE ON FUNCTION get_ads_data(TEXT)              TO anon, service_role;
GRANT EXECUTE ON FUNCTION get_ads_attribution_data(TEXT)  TO anon, service_role;
