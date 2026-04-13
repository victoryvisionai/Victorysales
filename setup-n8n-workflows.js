#!/usr/bin/env node
/**
 * setup-n8n-workflows.js
 *
 * Migrates all n8n workflows to a clean naming convention: "Function - Verb"
 * e.g. "Social - Get", "Social - Plan", "Contacts - Get"
 *
 * For each target webhook path:
 *   - If 1 existing workflow found  → rename it to new convention, preserve all nodes
 *   - If multiple found             → keep richest (most nodes), rename, delete others
 *   - If none found                 → create stub (Webhook → Respond to Webhook)
 *   - Then activate all
 *
 * Usage:
 *   node setup-n8n-workflows.js           → full migration (dry-run off)
 *   node setup-n8n-workflows.js --dry-run → show plan, make no changes
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const BASE   = process.env.N8N_BASE_URL;  // https://victoryvision.app.n8n.cloud/api/v1
const KEY    = process.env.N8N_API_KEY;
const DRY    = process.argv.includes('--dry-run');

if (!BASE || !KEY) {
  console.error('❌  N8N_BASE_URL and N8N_API_KEY must be set in .env');
  process.exit(1);
}

// ── Target workflow definitions ───────────────────────────────────────────────
const TARGETS = [
  // User
  { name: 'User - Get',                   path: 'user/get',                 method: 'POST' },
  // Social
  { name: 'Social - Get',                 path: 'socials/get',              method: 'POST' },
  { name: 'Social - AI Post',             path: 'user/aipost',              method: 'POST' },
  { name: 'Social - Create Post',         path: 'social/create-post',       method: 'POST' },
  { name: 'Social - Schedule',            path: 'social/schedule',          method: 'POST' },
  { name: 'Social - Optimize',            path: 'social/optimize',          method: 'POST' },
  { name: 'Social - Update',              path: 'social/update',            method: 'POST' },
  { name: 'Social - Delete',              path: 'social/delete',            method: 'POST' },
  { name: 'Social - Learn',               path: 'social/learn',             method: 'POST' },
  { name: 'Social - Plan',                path: 'social/plan',              method: 'POST' },
  { name: 'Social - Plan Approval',       path: 'social/plan-approval',     method: 'POST' },
  // Media
  { name: 'Media - Get',                  path: 'media/get',                method: 'POST' },
  { name: 'Media - Upload',               path: 'media/upload',             method: 'POST' },
  { name: 'Media - Update',               path: 'media/update',             method: 'POST' },
  // Contacts
  { name: 'Contacts - Get',               path: 'contacts/get',             method: 'POST' },
  { name: 'Contacts - Add',               path: 'contacts/add',             method: 'POST' },
  { name: 'Contacts - Update',            path: 'contacts/update',          method: 'POST' },
  // Emails
  { name: 'Emails - Get',                 path: 'emails/get',               method: 'POST' },
  { name: 'Emails - Send',                path: 'emails/send',              method: 'POST' },
  { name: 'Emails - Meeting',             path: 'emails/meeting',           method: 'POST' },
  // Meetings
  { name: 'Meetings - Get',               path: 'meetings/get',             method: 'POST' },
  { name: 'Meeting Invites - Get',        path: 'meeting_invites/get',      method: 'POST' },
  // Plans
  { name: 'Plans - Get',                  path: 'plans/get',                method: 'POST' },
  { name: 'Plan - Execute',               path: 'plan/execute',             method: 'POST' },
  // SMS
  { name: 'SMS - Get',                    path: 'sms/get',                  method: 'POST' },
  { name: 'SMS - Create',                 path: 'sms/create',               method: 'POST' },
  // Calls
  { name: 'Calls - Get',                  path: 'calls/get',                method: 'POST' },
  { name: 'Call - Make',                  path: 'call/make',                method: 'POST' },
  // Victories
  { name: 'Victories - Get',              path: 'victories/get',            method: 'POST' },
  // AI
  { name: 'AI - Feedback',               path: 'ai/feedback',              method: 'POST' },
  { name: 'AI SDR - Toggle',             path: 'aisdr/toggle',             method: 'POST' },
  // Campaigns
  { name: 'Campaigns - Get',              path: 'campaigns/get',            method: 'POST' },
  { name: 'Campaigns - User',             path: 'campaigns/user',           method: 'POST' },
  { name: 'Campaign Files - Get',         path: 'campaign_files/get',       method: 'POST' },
  // Pages
  { name: 'Pages - Get',                  path: 'pages/get',                method: 'POST' },
  { name: 'Pages - Lead Submission',      path: 'pages/lead-submission',    method: 'POST' },
  // Ads
  { name: 'Ads - Get',                    path: 'ads/get',                  method: 'POST' },
  { name: 'Ads - Remove',                 path: 'ads/remove',               method: 'POST' },
  { name: 'Ads - Optimizations',          path: 'ads/get-optimizations',    method: 'POST' },
  { name: 'Ads - Apply Optimization',     path: 'ads/apply-optimization',   method: 'POST' },
  { name: 'Ads - Attribution',            path: 'ads/get-attribution',      method: 'POST' },
  // LinkedIn
  { name: 'LinkedIn - Get Audience',      path: 'linkedin/get-audience',    method: 'POST' },
  { name: 'LinkedIn - Build Audience',    path: 'linkedin/build-audience',  method: 'POST' },
  { name: 'LinkedIn - Sync Audience',     path: 'linkedin/sync-audience',   method: 'POST' },
  { name: 'LinkedIn - Get OAuth',         path: 'linkedin/get-oauth',       method: 'POST' },
  { name: 'LinkedIn - Create Ad',         path: 'linkedin/create-ad',       method: 'POST' },
  { name: 'LinkedIn - Get Campaigns',     path: 'linkedin/get-campaigns',   method: 'POST' },
  { name: 'LinkedIn - Update Campaign',   path: 'linkedin/update-campaign', method: 'POST' },
  { name: 'LinkedIn - Pause Campaign',    path: 'linkedin/pause-campaign',  method: 'POST' },
  { name: 'LinkedIn - Delete Campaign',   path: 'linkedin/delete-campaign', method: 'POST' },
  { name: 'LinkedIn - Get Reporting',     path: 'linkedin/get-reporting',   method: 'POST' },
  { name: 'LinkedIn - Generate Copy',     path: 'linkedin/generate-copy',   method: 'POST' },
  // Billboard
  { name: 'Billboard - Get Inventory',    path: 'billboard/get-inventory',  method: 'POST' },
  { name: 'Billboard - Reserve',          path: 'billboard/reserve',        method: 'POST' },
  // Payment
  { name: 'Payment - Get Checkout',       path: 'payment/get-checkout',     method: 'POST' },
  // Presentations
  { name: 'Presentations - Create',       path: 'presentations/create',     method: 'POST' },
  // Pixel
  { name: 'Pixel - Track',               path: 'pixel/track',              method: 'GET'  },
];

// ── n8n API helpers ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-N8N-API-KEY': KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// Fetch ALL workflows (handles pagination)
async function fetchAllWorkflows() {
  const all = [];
  let cursor = null;

  do {
    const qs  = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=100` : '?limit=100';
    const res = await api('GET', `/workflows${qs}`);
    all.push(...(res.data ?? res));
    cursor = res.nextCursor ?? null;
  } while (cursor);

  return all;
}

// Fetch full workflow details (includes all node parameters)
async function fetchWorkflow(id) {
  return api('GET', `/workflows/${id}`);
}

// Extract webhook paths from a full workflow object
function extractWebhookPaths(wf) {
  const paths = [];
  for (const node of (wf.nodes ?? [])) {
    if (node.type === 'n8n-nodes-base.webhook') {
      const p = node.parameters?.path;
      if (p) paths.push(p.replace(/^\//, ''));
    }
  }
  return paths;
}

// Score a workflow by "richness" — used to pick the keeper when duplicates exist
function richness(wf) {
  const nodes = wf.nodes ?? [];
  // Count total characters across all node parameter values (captures AI prompts etc.)
  let chars = 0;
  for (const n of nodes) {
    chars += JSON.stringify(n.parameters ?? {}).length;
  }
  return nodes.length * 1000 + chars;
}

// Build a stub workflow (Webhook → Respond to Webhook)
function buildStub(name, webhookPath, method) {
  const webhookId  = randomUUID();
  const respondId  = randomUUID();

  return {
    name,
    nodes: [
      {
        id: webhookId,
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [250, 300],
        webhookId: randomUUID(),
        parameters: {
          path: webhookPath,
          httpMethod: method,
          responseMode: 'responseNode',
        },
      },
      {
        id: respondId,
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [500, 300],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ JSON.stringify({ status: "ok" }) }}',
        },
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' },
    staticData: null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(DRY ? '🔍  DRY RUN — no changes will be made' : '🚀  Starting n8n workflow migration');
console.log(`${'─'.repeat(60)}\n`);

// 1. Fetch all existing workflows (summary only first)
console.log('📡  Fetching existing workflows...');
const summaries = await fetchAllWorkflows();
console.log(`    Found ${summaries.length} existing workflow(s)\n`);

// 2. Fetch full details for each (to read node params + AI prompts)
console.log('📥  Loading full workflow details...');
const existing = [];
for (const s of summaries) {
  try {
    const full = await fetchWorkflow(s.id);
    existing.push(full);
    process.stdout.write('.');
  } catch (e) {
    process.stdout.write('x');
    console.error(`\n    ⚠️  Could not fetch workflow ${s.id} (${s.name}): ${e.message}`);
  }
}
console.log(`\n    Loaded ${existing.length} workflow(s)\n`);

// 3. Build path → [workflow] map
const pathMap = new Map(); // path → [full workflow objects]

for (const wf of existing) {
  const paths = extractWebhookPaths(wf);
  for (const p of paths) {
    if (!pathMap.has(p)) pathMap.set(p, []);
    pathMap.get(p).push(wf);
  }
}

// 4. Process each target
const stats = { renamed: 0, created: 0, deleted: 0, alreadyCorrect: 0, activated: 0 };

for (const target of TARGETS) {
  const matches = pathMap.get(target.path) ?? [];
  console.log(`\n── ${target.name}  (/${target.path})`);

  let keepId = null;

  if (matches.length === 0) {
    // ── No existing workflow → create stub ──────────────────────────────────
    console.log(`   ✨  No match found — creating stub`);
    if (!DRY) {
      const created = await api('POST', '/workflows', buildStub(target.name, target.path, target.method));
      keepId = created.id;
      stats.created++;
      console.log(`   ✅  Created id=${keepId}`);
    } else {
      console.log(`   [dry] Would create stub`);
    }

  } else {
    // ── Sort matches by richness descending; richest = keeper ────────────────
    matches.sort((a, b) => richness(b) - richness(a));
    const keeper = matches[0];
    keepId = keeper.id;

    if (keeper.name === target.name) {
      console.log(`   ✔   Already correctly named (id=${keeper.id}, nodes=${keeper.nodes?.length ?? 0})`);
      stats.alreadyCorrect++;
    } else {
      console.log(`   ✏️   Renaming "${keeper.name}" → "${target.name}" (id=${keeper.id}, nodes=${keeper.nodes?.length ?? 0})`);
      if (!DRY) {
        await api('PUT', `/workflows/${keeper.id}`, { ...keeper, name: target.name });
        stats.renamed++;
        console.log(`   ✅  Renamed`);
      } else {
        console.log(`   [dry] Would rename`);
      }
    }

    // ── Delete duplicates ───────────────────────────────────────────────────
    for (const dupe of matches.slice(1)) {
      console.log(`   🗑️   Deleting duplicate "${dupe.name}" (id=${dupe.id}, nodes=${dupe.nodes?.length ?? 0})`);
      if (!DRY) {
        // Must deactivate before deleting if active
        if (dupe.active) {
          try { await api('POST', `/workflows/${dupe.id}/deactivate`); } catch {}
        }
        await api('DELETE', `/workflows/${dupe.id}`);
        stats.deleted++;
        console.log(`   ✅  Deleted`);
      } else {
        console.log(`   [dry] Would delete`);
      }
    }
  }

  // ── Activate ──────────────────────────────────────────────────────────────
  if (keepId && !DRY) {
    try {
      await api('POST', `/workflows/${keepId}/activate`);
      stats.activated++;
      console.log(`   ⚡  Activated`);
    } catch (e) {
      // May already be active
      if (!e.message.includes('already active')) {
        console.log(`   ⚠️  Could not activate: ${e.message.slice(0, 120)}`);
      } else {
        console.log(`   ⚡  Already active`);
        stats.activated++;
      }
    }
  }
}

// 5. Report any existing workflows NOT in our target list
const allTargetPaths = new Set(TARGETS.map(t => t.path));
const unmapped = existing.filter(wf => {
  const paths = extractWebhookPaths(wf);
  return paths.length === 0 || paths.every(p => !allTargetPaths.has(p));
});

if (unmapped.length > 0) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`⚠️   ${unmapped.length} workflow(s) NOT in target list (left untouched):`);
  for (const wf of unmapped) {
    const paths = extractWebhookPaths(wf);
    console.log(`    • "${wf.name}" (id=${wf.id}) paths=[${paths.join(', ') || 'none'}]`);
  }
}

// 6. Summary
console.log(`\n${'─'.repeat(60)}`);
console.log(`✅  Migration complete${DRY ? ' (dry run)' : ''}`);
console.log(`    Already correct : ${stats.alreadyCorrect}`);
console.log(`    Renamed         : ${stats.renamed}`);
console.log(`    Created (stubs) : ${stats.created}`);
console.log(`    Deleted (dupes) : ${stats.deleted}`);
console.log(`    Activated       : ${stats.activated}`);
console.log(`${'─'.repeat(60)}\n`);
