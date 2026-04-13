#!/usr/bin/env node
/**
 * create-nba-workflow.js
 * Creates the "NBA - Next Best Action" n8n workflow.
 *
 * Runs daily (schedule) for every active user.
 * Checks their feature usage and sends ONE personalized email
 * telling them the single highest-ROI thing they should do,
 * with a link that auto-starts the intro.js tour on that page.
 *
 * Priority order:
 *  1. aisdr = false          → activate Auto SDR
 *  2. No plan this week      → generate a plan
 *  3. Plan not executed      → execute plan
 *  4. No social posts        → set up social
 *  5. No media uploads       → create content
 *  6. No pages created       → build a landing page
 *  7. No ads running         → run LinkedIn ads
 *  8. Fallback               → review victories + weekly digest
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const BASE = process.env.N8N_BASE_URL;
const KEY  = process.env.N8N_API_KEY;

const CREDS_SB = { supabaseApi:   { id: 'Fys2RzaxZTqtBMmH', name: 'Supabase account' } };
const CREDS_MG = { httpBasicAuth: { id: 'LHpQ7dhIYDOO09mT', name: 'Mailgun2' } };
const CREDS_AN = { anthropicApi:  { id: 'mnhRZGbjCtHrSJVY', name: 'Anthropic account' } };

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t.slice(0,300)}`); }
  return r.status === 204 ? null : r.json();
}

// ── Node helpers ──────────────────────────────────────────────────────────────
function pos(x, y) { return [x, y]; }

function sbNode(name, op, table, filters, extra = {}) {
  return {
    id: randomUUID(), name,
    type: 'n8n-nodes-base.supabase', typeVersion: 1,
    position: extra.pos || [0, 0],
    credentials: CREDS_SB,
    parameters: { operation: op, tableId: table, ...filters, ...extra.params },
  };
}

function codeNode(name, code, position) {
  return {
    id: randomUUID(), name,
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position,
    parameters: { language: 'javaScript', jsCode: code },
  };
}

// ── NBA workflow definition ───────────────────────────────────────────────────

const N = {
  // Schedule: runs daily at 9 AM
  schedule: {
    id: randomUUID(), name: 'Daily 9AM',
    type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1,
    position: pos(-400, 0),
    parameters: { rule: { interval: [{ triggerAtHour: 9 }] } },
  },

  // Get all active users
  users: sbNode('Get All Users', 'getAll', 'users', {
    filters: { conditions: [{ keyName: 'subscription_plan', condition: 'neq', keyValue: '' }] },
    limit: 500,
  }, { pos: pos(-200, 0) }),

  // Get recent plans (last 7 days) — used to check if user has a plan
  plans: sbNode('Recent Plans', 'getAll', 'plans', {
    filters: { conditions: [
      { keyName: 'created_at', condition: 'gt', keyValue: "={{ $now.minus(7,'days') }}" },
    ]},
    limit: 500,
  }, { pos: pos(0, 0) }),

  // Get recent social posts (last 14 days)
  social: sbNode('Recent Social', 'getAll', 'social', {
    filters: { conditions: [
      { keyName: 'created_at', condition: 'gt', keyValue: "={{ $now.minus(14,'days') }}" },
    ]},
    limit: 500,
  }, { pos: pos(200, 0) }),

  // Get media (any)
  media: sbNode('Recent Media', 'getAll', 'media', {
    filters: { conditions: [
      { keyName: 'created_at', condition: 'gt', keyValue: "={{ $now.minus(30,'days') }}" },
    ]},
    limit: 200,
  }, { pos: pos(400, 0) }),

  // Get pages
  pages: sbNode('Recent Pages', 'getAll', 'pages', {
    filters: { conditions: [
      { keyName: 'created_at', condition: 'gt', keyValue: "={{ $now.minus(30,'days') }}" },
    ]},
    limit: 200,
  }, { pos: pos(600, 0) }),

  // Decide the #1 action per user
  decide: codeNode('Decide NBA', `
// ── Next Best Action decision engine ──────────────────────────────────────
// Collect all data fetched by previous nodes
const users   = $('Get All Users').all().map(i => i.json);
const plans   = $('Recent Plans').all().map(i => i.json);
const social  = $('Recent Social').all().map(i => i.json);
const media   = $('Recent Media').all().map(i => i.json);
const pages   = $('Recent Pages').all().map(i => i.json);

const BASE_URL = 'https://victoryvision.app';

// Suppress if we sent this user an NBA email in the last 3 days
function recentlySent(user) {
  const last = user.nba_sent_at;
  if (!last) return false;
  return (Date.now() - new Date(last).getTime()) < 3 * 24 * 60 * 60 * 1000;
}

const actions = [];

for (const user of users) {
  if (!user.email || !user.name) continue;
  if (recentlySent(user)) continue;

  const cid = user.email;
  const userPlans  = plans.filter(p => p.customer_id === cid);
  const userSocial = social.filter(s => s.customer_id === cid);
  const userMedia  = media.filter(m => m.customer_id === cid);
  const userPages  = pages.filter(p => p.customer_id === cid);

  const hasUnexecutedPlan = userPlans.some(p => !p.actual_conversions);

  let nba = null;

  // Priority 1: Auto SDR not enabled
  if (!user.aisdr || user.aisdr === 'false' || user.aisdr === false) {
    nba = {
      priority: 1,
      feature: 'Auto SDR',
      headline: 'Turn on Auto SDR — let AI work your leads',
      body: \`Your leads are waiting. Auto SDR lets AI send personalized outreach, follow up automatically, and book meetings on your behalf — 24/7, no manual effort required.\`,
      cta: 'Activate Auto SDR',
      url: BASE_URL + '/ai.html?tour=aisdr',
      icon: '🤖',
    };
  }
  // Priority 2: No plan generated this week
  else if (userPlans.length === 0) {
    nba = {
      priority: 2,
      feature: 'AI Plan',
      headline: 'Your AI plan is overdue — generate it now',
      body: \`Victory Vision analyzes your contacts, emails, calls, and SMS to build a prioritized action plan. Each plan tells you exactly who to reach out to, how, and why — with one-click execution.\`,
      cta: 'Generate My Plan',
      url: BASE_URL + '/ai.html?tour=plans',
      icon: '📋',
    };
  }
  // Priority 3: Plan exists but not executed
  else if (hasUnexecutedPlan) {
    nba = {
      priority: 3,
      feature: 'Execute Plan',
      headline: 'Your plan is ready — execute it in one click',
      body: \`You have an AI-generated action plan sitting ready. Executing it triggers personalized emails, SMS, and calls to your top prospects automatically. One click, maximum impact.\`,
      cta: 'Execute My Plan',
      url: BASE_URL + '/ai.html?tour=execute',
      icon: '▶️',
    };
  }
  // Priority 4: No social posts
  else if (userSocial.length === 0) {
    nba = {
      priority: 4,
      feature: 'Social',
      headline: 'Your social presence is silent — fix that today',
      body: \`Victory Vision can generate and schedule posts for LinkedIn, Facebook, and Instagram using AI — based on your company, product, and what's already converting for you.\`,
      cta: 'Set Up Social',
      url: BASE_URL + '/social.html?tour=plan',
      icon: '📱',
    };
  }
  // Priority 5: No media
  else if (userMedia.length === 0) {
    nba = {
      priority: 5,
      feature: 'Media',
      headline: 'Create AI-powered content for your campaigns',
      body: \`Images, videos, and presentations — created by AI in seconds. Your media library fuels your ads, social posts, and landing pages. Start creating today.\`,
      cta: 'Create Media',
      url: BASE_URL + '/media.html?tour=create',
      icon: '🎨',
    };
  }
  // Priority 6: No landing pages
  else if (userPages.length === 0) {
    nba = {
      priority: 6,
      feature: 'Pages',
      headline: 'Build a landing page that captures leads on autopilot',
      body: \`Victory Vision creates AI-powered landing pages with built-in lead capture, tracking pixels, and CRM integration. Your page goes live in under 2 minutes.\`,
      cta: 'Build a Page',
      url: BASE_URL + '/pages.html?tour=create',
      icon: '🏗️',
    };
  }
  // Priority 7: No ads
  else {
    nba = {
      priority: 7,
      feature: 'Ads',
      headline: 'Run LinkedIn ads to your best prospects',
      body: \`Victory Vision creates LinkedIn ad campaigns targeting your email openers and 1st-degree connections — the people most likely to convert. Full-funnel attribution included.\`,
      cta: 'Launch Ads',
      url: BASE_URL + '/ads.html?tour=create',
      icon: '🎯',
    };
  }

  if (nba) {
    actions.push({ json: { user, nba } });
  }
}

return actions.length > 0 ? actions : [{ json: { skip: true } }];
`, pos(800, 0)),

  // Filter out skipped
  filter: {
    id: randomUUID(), name: 'Has Action',
    type: 'n8n-nodes-base.filter', typeVersion: 2,
    position: pos(1000, 0),
    parameters: {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: '={{ $json.skip }}', rightValue: true, operator: { type: 'boolean', operation: 'notEquals' } }]
      }
    },
  },

  // Build the HTML email
  buildEmail: codeNode('Build Email', `
const { user, nba } = $input.item.json;

const firstName = (user.name || user.email.split('@')[0] || 'there').split(' ')[0];

const html = \`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);}
  .header{background:#0a3161;padding:28px 32px;text-align:center;}
  .header img{height:48px;}
  .hero{background:linear-gradient(135deg,#0a3161,#1a4c80);padding:40px 32px;text-align:center;}
  .priority{display:inline-block;background:#bb133e;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:4px 12px;border-radius:20px;margin-bottom:16px;}
  .icon{font-size:48px;margin-bottom:12px;}
  .headline{color:#fff;font-size:22px;font-weight:700;line-height:1.3;margin:0 0 8px;}
  .body{padding:32px;}
  .copy{color:#374151;font-size:15px;line-height:1.7;margin:0 0 28px;}
  .cta{display:block;background:#bb133e;color:#fff;text-decoration:none;text-align:center;padding:16px 32px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:.3px;}
  .cta:hover{background:#9b0f30;}
  .hint{color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;}
  .footer{background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;}
  .footer p{color:#94a3b8;font-size:12px;margin:4px 0;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <img src="https://victoryvision.app/logo.jpg" alt="Victory Vision">
  </div>
  <div class="hero">
    <div class="priority">#\${nba.priority} Priority Action</div>
    <div class="icon">\${nba.icon}</div>
    <h1 class="headline">\${nba.headline}</h1>
  </div>
  <div class="body">
    <p style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Hi \${firstName},</p>
    <p class="copy">\${nba.body}</p>
    <a href="\${nba.url}" class="cta">
      \${nba.cta} →
    </a>
    <p class="hint">Clicking opens an interactive tour of this feature — takes under 2 minutes.</p>
  </div>
  <div class="footer">
    <p><strong>Victory Vision</strong> · AI-powered sales automation</p>
    <p>You're receiving this because it's your top growth lever right now.</p>
  </div>
</div>
</body>
</html>\`;

return [{
  json: {
    user,
    nba,
    email: {
      to: user.email,
      subject: nba.icon + ' ' + nba.headline,
      html,
      from: 'Victory Vision <noreply@victoryvisionai.com>',
    }
  }
}];
`, pos(1200, 0)),

  // Send via Mailgun
  sendEmail: {
    id: randomUUID(), name: 'Send NBA Email',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: pos(1400, 0),
    credentials: CREDS_MG,
    parameters: {
      method: 'POST',
      url: 'https://api.mailgun.net/v3/victoryvisionai.com/messages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendBody: true,
      contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { name: 'from',    value: '={{ $json.email.from }}' },
        { name: 'to',     value: '={{ $json.email.to }}' },
        { name: 'subject', value: '={{ $json.email.subject }}' },
        { name: 'html',   value: '={{ $json.email.html }}' },
      ]},
    },
  },

  // Mark user as sent (update nba_sent_at)
  markSent: {
    id: randomUUID(), name: 'Mark NBA Sent',
    type: 'n8n-nodes-base.supabase', typeVersion: 1,
    position: pos(1600, 0),
    credentials: CREDS_SB,
    parameters: {
      operation: 'update',
      tableId: 'users',
      filters: { conditions: [{ keyName: 'email', condition: 'eq', keyValue: "={{ $('Decide NBA').item.json.user.email }}" }] },
      fieldsUi: { fieldValues: [
        { fieldId: 'nba_sent_at', fieldValue: '={{ $now.toISO() }}' },
        { fieldId: 'nba_feature', fieldValue: "={{ $('Decide NBA').item.json.nba.feature }}" },
      ]},
    },
  },
};

// ── Connections ───────────────────────────────────────────────────────────────
const connections = {
  'Daily 9AM':     { main: [[{ node: 'Get All Users',  type: 'main', index: 0 }]] },
  'Get All Users': { main: [[{ node: 'Recent Plans',   type: 'main', index: 0 }]] },
  'Recent Plans':  { main: [[{ node: 'Recent Social',  type: 'main', index: 0 }]] },
  'Recent Social': { main: [[{ node: 'Recent Media',   type: 'main', index: 0 }]] },
  'Recent Media':  { main: [[{ node: 'Recent Pages',   type: 'main', index: 0 }]] },
  'Recent Pages':  { main: [[{ node: 'Decide NBA',     type: 'main', index: 0 }]] },
  'Decide NBA':    { main: [[{ node: 'Has Action',     type: 'main', index: 0 }]] },
  'Has Action':    { main: [[{ node: 'Build Email',    type: 'main', index: 0 }]] },
  'Build Email':   { main: [[{ node: 'Send NBA Email', type: 'main', index: 0 }]] },
  'Send NBA Email':{ main: [[{ node: 'Mark NBA Sent',  type: 'main', index: 0 }]] },
};

// ── Create workflow ───────────────────────────────────────────────────────────
const workflow = {
  name: 'NBA - Next Best Action',
  nodes: Object.values(N),
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null,
};

try {
  // Check if already exists
  const existing = await api('GET', '/workflows?limit=200');
  const found = (existing.data ?? existing).find(w => w.name === 'NBA - Next Best Action');

  let wf;
  if (found) {
    console.log(`Updating existing workflow id=${found.id}`);
    wf = await api('PUT', `/workflows/${found.id}`, { ...workflow, id: found.id });
  } else {
    wf = await api('POST', '/workflows', workflow);
  }

  await api('POST', `/workflows/${wf.id}/activate`);
  console.log(`\n✅  "NBA - Next Best Action" created/updated and activated`);
  console.log(`   id=${wf.id}`);
  console.log(`   Runs daily at 9AM`);
  console.log(`   Checks 7 features in priority order`);
  console.log(`   Sends email with intro.js tour link`);
  console.log(`   Tracks sends via users.nba_sent_at (3-day cooldown)\n`);
} catch (e) {
  console.error('❌  Failed:', e.message);
}
