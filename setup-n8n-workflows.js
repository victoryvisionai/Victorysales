#!/usr/bin/env node
/**
 * setup-n8n-workflows.js
 *
 * Migrates all n8n workflows to individual, cleanly-named workflows.
 * Naming convention: "Function - Verb"  e.g. "Social - Get", "Social - Plan"
 *
 * Strategy per target webhook path:
 *   1. Find existing workflow(s) that contain a matching webhook node
 *   2. Extract the subgraph reachable from that webhook node
 *      (preserves all downstream nodes: AI prompts, code, Supabase, etc.)
 *   3. Create a new individual workflow with just that subgraph
 *   4. After ALL new workflows are created, delete the old combined workflows
 *   5. Activate every new workflow
 *
 * For paths with NO existing workflow → create a stub (Webhook + Respond)
 *
 * Usage:
 *   node setup-n8n-workflows.js           → full migration
 *   node setup-n8n-workflows.js --dry-run → show plan only, no changes
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const BASE = process.env.N8N_BASE_URL;
const KEY  = process.env.N8N_API_KEY;
const DRY  = process.argv.includes('--dry-run');

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
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

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

async function fetchWorkflow(id) {
  return api('GET', `/workflows/${id}`);
}

// ── Settings sanitizer ───────────────────────────────────────────────────────
// n8n API only accepts these settings keys on workflow create/update
const ALLOWED_SETTINGS = new Set([
  'executionOrder', 'saveManualExecutions', 'callerPolicy',
  'errorWorkflow', 'timezone', 'saveExecutionProgress',
  'saveDataSuccessExecution', 'saveDataErrorExecution',
]);

function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') return { executionOrder: 'v1' };
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (ALLOWED_SETTINGS.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : { executionOrder: 'v1' };
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

// Find all webhook nodes in a workflow, return [{name, path, method}]
function findWebhookNodes(wf) {
  return (wf.nodes ?? [])
    .filter(n => n.type === 'n8n-nodes-base.webhook')
    .map(n => ({
      name:   n.name,
      path:   (n.parameters?.path ?? '').replace(/^\//, ''),
      method: (n.parameters?.httpMethod ?? 'GET').toUpperCase(),
    }));
}

/**
 * Extract the subgraph reachable from webhookNodeName via BFS.
 * Returns { nodes, connections } — only the nodes/edges connected to that webhook.
 */
function extractSubgraph(wf, webhookNodeName) {
  const allNodes   = wf.nodes ?? [];
  const allConns   = wf.connections ?? {};

  // BFS
  const visited = new Set([webhookNodeName]);
  const queue   = [webhookNodeName];

  while (queue.length > 0) {
    const current  = queue.shift();
    const nodeConns = allConns[current];
    if (!nodeConns) continue;

    for (const portConns of Object.values(nodeConns)) {
      if (!Array.isArray(portConns)) continue;
      for (const connList of portConns) {
        if (!Array.isArray(connList)) continue;
        for (const conn of connList) {
          if (conn?.node && !visited.has(conn.node)) {
            visited.add(conn.node);
            queue.push(conn.node);
          }
        }
      }
    }
  }

  // Filter nodes to only visited
  const nodes = allNodes.filter(n => visited.has(n.name));

  // Filter connections: only source nodes in visited, drop edges to non-visited targets
  const connections = {};
  for (const [src, portMap] of Object.entries(allConns)) {
    if (!visited.has(src)) continue;
    connections[src] = {};
    for (const [portType, portConns] of Object.entries(portMap)) {
      connections[src][portType] = portConns.map(connList =>
        Array.isArray(connList)
          ? connList.filter(c => c?.node && visited.has(c.node))
          : []
      );
    }
  }

  return { nodes, connections };
}

// Build a stub workflow when no existing nodes found
function buildStub(name, webhookPath, method) {
  const wId = randomUUID();
  const rId = randomUUID();
  return {
    name,
    nodes: [
      {
        id: wId, name: 'Webhook',
        type: 'n8n-nodes-base.webhook', typeVersion: 2,
        position: [250, 300], webhookId: randomUUID(),
        parameters: { path: webhookPath, httpMethod: method, responseMode: 'responseNode' },
      },
      {
        id: rId, name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1,
        position: [500, 300],
        parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ status: "ok" }) }}' },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
    staticData: null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(65)}`);
console.log(DRY ? '🔍  DRY RUN — no changes will be made' : '🚀  Starting n8n workflow migration');
console.log(`${'─'.repeat(65)}\n`);

// 1. Fetch all existing workflows (full details)
console.log('📡  Fetching existing workflows...');
const summaries = await fetchAllWorkflows();
console.log(`    Found ${summaries.length} existing workflow(s)`);

console.log('📥  Loading full workflow details...');
const existing = [];
for (const s of summaries) {
  try {
    existing.push(await fetchWorkflow(s.id));
    process.stdout.write('.');
  } catch (e) {
    process.stdout.write('x');
    console.error(`\n    ⚠️  Could not load ${s.id} (${s.name}): ${e.message}`);
  }
}
console.log(`\n    Loaded ${existing.length} workflow(s)\n`);

// 2. Build index: webhookPath → { workflow, webhookNodeName }
//    (multiple workflows could share a path — unlikely but handled)
const pathIndex = new Map(); // path → [{ wf, webhookNodeName }]

// Also build a name → workflow map to detect already-migrated workflows
const nameMap = new Map(); // workflow name → wf

for (const wf of existing) {
  nameMap.set(wf.name, wf);
  for (const hook of findWebhookNodes(wf)) {
    if (!pathIndex.has(hook.path)) pathIndex.set(hook.path, []);
    pathIndex.get(hook.path).push({ wf, webhookNodeName: hook.name });
  }
}

// 3. Track which old workflow IDs we'll want to delete
const oldIdsToDelete = new Set(); // filled as we migrate each path

// 4. Process each target
const stats = { extracted: 0, stubbed: 0, deleted: 0, activated: 0, errors: 0 };

for (const target of TARGETS) {
  const matches = pathIndex.get(target.path) ?? [];
  console.log(`\n── ${target.name}  (/${target.path})`);

  let newWorkflowId = null;

  if (matches.length === 0) {
    // No existing webhook for this path → create stub
    console.log(`   ✨  No match — creating stub`);
    if (!DRY) {
      try {
        const created = await api('POST', '/workflows', buildStub(target.name, target.path, target.method));
        newWorkflowId = created.id;
        stats.stubbed++;
        console.log(`   ✅  Stub created  id=${newWorkflowId}`);
      } catch (e) {
        stats.errors++;
        console.error(`   ❌  Create failed: ${e.message.slice(0, 200)}`);
      }
    } else {
      console.log(`   [dry] Would create stub`);
    }

  } else {
    // Pick best match (most nodes)
    matches.sort((a, b) => (b.wf.nodes?.length ?? 0) - (a.wf.nodes?.length ?? 0));
    const { wf, webhookNodeName } = matches[0];

    // Extract subgraph from this webhook node
    const sub = extractSubgraph(wf, webhookNodeName);
    console.log(`   🔬  Extracted from "${wf.name}" via webhook node "${webhookNodeName}"`);
    console.log(`       Nodes: ${sub.nodes.length} / ${wf.nodes?.length ?? 0} total  (preserving all AI prompts + code)`);

    if (!DRY) {
      try {
        const newWf = {
          name: target.name,
          nodes: sub.nodes,
          connections: sub.connections,
          settings: wf.settings ?? { executionOrder: 'v1' },
          staticData: null,
        };
        const created = await api('POST', '/workflows', newWf);
        newWorkflowId = created.id;
        stats.extracted++;
        console.log(`   ✅  Created  id=${newWorkflowId}  nodes=${sub.nodes.length}`);

        // Mark source workflow for deletion (after all paths processed)
        oldIdsToDelete.add(wf.id);
      } catch (e) {
        stats.errors++;
        console.error(`   ❌  Create failed: ${e.message.slice(0, 200)}`);
      }
    } else {
      console.log(`   [dry] Would create workflow "${target.name}" with ${sub.nodes.length} nodes`);
      oldIdsToDelete.add(wf.id); // for dry-run reporting
    }
  }

  // Activate new workflow
  if (newWorkflowId && !DRY) {
    try {
      await api('POST', `/workflows/${newWorkflowId}/activate`);
      stats.activated++;
      console.log(`   ⚡  Activated`);
    } catch (e) {
      if (e.message.includes('already active')) {
        stats.activated++;
        console.log(`   ⚡  Already active`);
      } else {
        console.log(`   ⚠️  Activate failed: ${e.message.slice(0, 120)}`);
      }
    }
  }
}

// 5. Delete old combined workflows
console.log(`\n${'─'.repeat(65)}`);
if (oldIdsToDelete.size === 0) {
  console.log('ℹ️   No old workflows to delete');
} else {
  console.log(`🗑️   Deleting ${oldIdsToDelete.size} old combined workflow(s)...`);
  for (const id of oldIdsToDelete) {
    const wf = existing.find(w => w.id === id);
    const label = `"${wf?.name ?? id}" (id=${id})`;
    if (!DRY) {
      try {
        // Deactivate first if active
        if (wf?.active) {
          try { await api('POST', `/workflows/${id}/deactivate`); } catch {}
        }
        await api('DELETE', `/workflows/${id}`);
        stats.deleted++;
        console.log(`   ✅  Deleted ${label}`);
      } catch (e) {
        stats.errors++;
        console.error(`   ❌  Could not delete ${label}: ${e.message.slice(0, 150)}`);
      }
    } else {
      console.log(`   [dry] Would delete ${label}`);
    }
  }
}

// 6. Report untouched workflows
const targetPaths = new Set(TARGETS.map(t => t.path));
const untouched = existing.filter(wf => {
  const paths = findWebhookNodes(wf).map(h => h.path);
  return paths.length === 0 || paths.every(p => !targetPaths.has(p));
});

if (untouched.length > 0) {
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`ℹ️   ${untouched.length} workflow(s) not in target list — left untouched:`);
  for (const wf of untouched) {
    const paths = findWebhookNodes(wf).map(h => `/${h.path}`);
    console.log(`    • "${wf.name}" (id=${wf.id})  paths=[${paths.join(', ') || 'none'}]`);
  }
}

// 7. Summary
console.log(`\n${'─'.repeat(65)}`);
console.log(`✅  Migration complete${DRY ? ' (dry run)' : ''}`);
console.log(`    Extracted from existing : ${stats.extracted}`);
console.log(`    Stubs created           : ${stats.stubbed}`);
console.log(`    Old workflows deleted   : ${stats.deleted}`);
console.log(`    Activated               : ${stats.activated}`);
if (stats.errors > 0) console.log(`    Errors                  : ${stats.errors} ⚠️`);
console.log(`${'─'.repeat(65)}\n`);
