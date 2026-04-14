-- ═══════════════════════════════════════════════════════
-- Victory Vision Ads Schema Setup
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. Extend existing ads table
ALTER TABLE ads
  ADD COLUMN IF NOT EXISTS platform            TEXT DEFAULT 'linkedin',
  ADD COLUMN IF NOT EXISTS platform_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS platform_ad_group_id TEXT,
  ADD COLUMN IF NOT EXISTS audience_tier        TEXT,
  ADD COLUMN IF NOT EXISTS landing_page_id      UUID,
  ADD COLUMN IF NOT EXISTS meetings_booked      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_customers        INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_revenue   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_meeting     NUMERIC,
  ADD COLUMN IF NOT EXISTS autopilot_mode       TEXT DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS ab_variant           TEXT,
  ADD COLUMN IF NOT EXISTS ab_parent_id         INT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- 2. ad_accounts — OAuth + setup status per platform per customer
CREATE TABLE IF NOT EXISTS ad_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             TEXT NOT NULL,
  platform                TEXT NOT NULL,   -- google_ads, msft_ads, linkedin_ads
  oauth_connected         BOOLEAN DEFAULT FALSE,
  tracking_installed      BOOLEAN DEFAULT FALSE,  -- UET / GA pixel confirmed firing
  terms_accepted          BOOLEAN DEFAULT FALSE,  -- customer match terms (MSFT)
  meeting_conversion_ready BOOLEAN DEFAULT FALSE,
  autopilot_mode          TEXT DEFAULT 'off',     -- off, safe, on
  account_id              TEXT,                   -- platform account/customer ID
  currency                TEXT DEFAULT 'USD',
  timezone                TEXT DEFAULT 'America/Chicago',
  monthly_budget_cap      NUMERIC DEFAULT 500,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, platform)
);

-- 3. audiences — scored tiers with platform list IDs
CREATE TABLE IF NOT EXISTS audiences (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                  TEXT NOT NULL,
  name                         TEXT NOT NULL,
  tier                         TEXT NOT NULL,      -- HOT, WARM, ALL
  platform                     TEXT NOT NULL,
  platform_list_id             TEXT,               -- MSFT customer list ID / Google match ID
  size_estimate                INT DEFAULT 0,
  status                       TEXT DEFAULT 'building',  -- building, ready, syncing, active
  last_sync_at                 TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. audience_members — contact tier membership
CREATE TABLE IF NOT EXISTS audience_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   TEXT NOT NULL,
  contact_id    UUID,
  audience_id   UUID REFERENCES audiences(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL,   -- HOT, WARM, ALL
  score         INT DEFAULT 0,
  signals       JSONB DEFAULT '[]',   -- ["email_open","page_view","calendly_view"]
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contact_id, audience_id)
);

-- 5. engagement_events — pixel/UET granular web events
CREATE TABLE IF NOT EXISTS engagement_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   TEXT NOT NULL,
  contact_id    UUID,
  event_type    TEXT NOT NULL,    -- page_view, form_submit, video_25, video_50, calendly_view, calendly_scheduled
  event_value   TEXT,
  page_id       UUID,             -- FK to pages.id
  ad_id         INT,              -- FK to ads.id
  source        TEXT,             -- email, sms, web, linkedin, google_ads, msft_ads
  occurred_at   TIMESTAMPTZ DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}'
);

-- 6. ad_guardrails — budget caps and autopilot safety
CREATE TABLE IF NOT EXISTS ad_guardrails (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               TEXT NOT NULL,
  platform                  TEXT NOT NULL,
  daily_budget_cap          NUMERIC DEFAULT 100,
  weekly_budget_cap         NUMERIC DEFAULT 500,
  max_budget_increase_pct   NUMERIC DEFAULT 20,
  min_clicks_before_opt     INT DEFAULT 100,
  min_conversions_before_opt INT DEFAULT 3,
  auto_apply                BOOLEAN DEFAULT FALSE,
  kill_switch               BOOLEAN DEFAULT FALSE,
  target_cost_per_meeting   NUMERIC DEFAULT 200,
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, platform)
);

-- 7. ai_ad_actions_log — every auto-change with rationale
CREATE TABLE IF NOT EXISTS ai_ad_actions_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   TEXT NOT NULL,
  platform      TEXT,
  ad_id         INT,
  action_type   TEXT NOT NULL,   -- pause, budget_increase, budget_decrease, new_variant, activate, ab_test
  rationale     TEXT,
  before_value  JSONB,
  after_value   JSONB,
  status        TEXT DEFAULT 'pending',   -- pending, applied, rejected
  applied_by    TEXT,                     -- auto, user_email
  kpi_snapshot  JSONB,                    -- {cpm, cpc, cost_per_meeting, impressions} at time of action
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  applied_at    TIMESTAMPTZ
);

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ads_customer_platform    ON ads(customer_id, platform);
CREATE INDEX IF NOT EXISTS idx_ads_status               ON ads(status);
CREATE INDEX IF NOT EXISTS idx_audience_members_contact ON audience_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_contact ON engagement_events(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_events_customer ON engagement_events(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_customer      ON ai_ad_actions_log(customer_id, created_at DESC);

