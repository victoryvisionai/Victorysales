#!/usr/bin/env node
/**
 * n8n.js — Autonomous n8n editing and testing tool
 * Usage: node n8n.js <command> [args]
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no install required) ──────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      process.env[key] = val;
    }
  } catch {
    console.error('❌  Could not load .env file');
    process.exit(1);
  }
}

loadEnv();

const API_KEY  = process.env.N8N_API_KEY;
const BASE_URL = process.env.N8N_BASE_URL;

if (!API_KEY || !BASE_URL) {
  console.error('❌  N8N_API_KEY or N8N_BASE_URL missing from .env');
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── 1. listWorkflows ──────────────────────────────────────────────────────────
async function listWorkflows() {
  const all = [];
  let cursor = null;

  do {
    const qs = cursor ? `?limit=50&cursor=${cursor}` : '?limit=50';
    const data = await api(`/workflows${qs}`);
    all.push(...data.data);
    cursor = data.nextCursor || null;
  } while (cursor);

  return all.map(w => ({ id: w.id, name: w.name, active: w.active }));
}

// ── 2. getWorkflow ────────────────────────────────────────────────────────────
async function getWorkflow(nameOrId) {
  // Try direct ID lookup first
  try {
    return await api(`/workflows/${nameOrId}`);
  } catch {}

  // Fallback: search by partial name
  const list = await listWorkflows();
  const match = list.find(w =>
    w.name.toLowerCase().includes(nameOrId.toLowerCase())
  );
  if (!match) throw new Error(`No workflow found matching "${nameOrId}"`);
  return api(`/workflows/${match.id}`);
}

// ── 3. getCodeNodes ───────────────────────────────────────────────────────────
function getCodeNodes(workflow) {
  return (workflow.nodes || [])
    .filter(n => n.type === 'n8n-nodes-base.code')
    .map(n => ({
      name: n.name,
      mode: n.parameters?.mode || 'runOnceForAllItems',
      code: n.parameters?.jsCode || n.parameters?.pythonCode || '(empty)',
    }));
}

// ── 4. updateCodeNode ─────────────────────────────────────────────────────────
async function updateCodeNode(workflowId, nodeName, newCode) {
  const workflow = await api(`/workflows/${workflowId}`);

  const node = workflow.nodes.find(
    n => n.type === 'n8n-nodes-base.code' && n.name === nodeName
  );
  if (!node) throw new Error(`Code node "${nodeName}" not found in workflow`);

  // Preserve python vs js mode
  if (node.parameters?.pythonCode !== undefined) {
    node.parameters.pythonCode = newCode;
  } else {
    node.parameters.jsCode = newCode;
  }

  // PUT the full workflow back
  const updated = await api(`/workflows/${workflowId}`, {
    method: 'PUT',
    body: JSON.stringify(workflow),
  });

  return updated;
}

// ── 5. triggerWebhook ─────────────────────────────────────────────────────────
async function triggerWebhook(path, body = {}) {
  const base = process.env.SITE_URL?.replace(/\/$/, '') ||
    BASE_URL.replace('/api/v1', '');
  const url = `${base}/webhook/${path.replace(/^\//, '')}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

// ── 6. getExecutions ──────────────────────────────────────────────────────────
async function getExecutions(workflowId, limit = 5) {
  const data = await api(
    `/executions?workflowId=${workflowId}&limit=${limit}&includeData=false`
  );
  return data.data.map(e => ({
    id: e.id,
    status: e.status,
    startedAt: e.startedAt,
    stoppedAt: e.stoppedAt,
    mode: e.mode,
  }));
}

// ── 7. getExecutionDetail ─────────────────────────────────────────────────────
async function getExecutionDetail(executionId) {
  return api(`/executions/${executionId}?includeData=true`);
}

// ── 8. findAndFixError ────────────────────────────────────────────────────────
async function findAndFixError(workflowName) {
  const workflow = await getWorkflow(workflowName);
  const executions = await getExecutions(workflow.id, 10);

  const failed = executions.find(e => e.status === 'error');
  if (!failed) return { message: 'No failed executions found.', node: null };

  const detail = await getExecutionDetail(failed.id);
  const runData = detail.data?.resultData?.runData || {};

  let errorNode = null;
  let errorMessage = null;

  for (const [nodeName, runs] of Object.entries(runData)) {
    for (const run of runs) {
      if (run.error) {
        errorNode = nodeName;
        errorMessage = run.error.message || JSON.stringify(run.error);
        break;
      }
    }
    if (errorNode) break;
  }

  // Also check top-level error
  if (!errorMessage && detail.data?.resultData?.error) {
    errorMessage = detail.data.resultData.error.message ||
      JSON.stringify(detail.data.resultData.error);
  }

  return {
    executionId: failed.id,
    startedAt: failed.startedAt,
    node: errorNode,
    message: errorMessage || 'Unknown error — check execution detail',
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, cmd, arg1, arg2] = process.argv;

function printWorkflows(list) {
  console.log(`\n${'ID'.padEnd(20)} ${'ACTIVE'.padEnd(8)} NAME`);
  console.log('─'.repeat(70));
  for (const w of list) {
    const active = w.active ? '✅' : '⏸ ';
    console.log(`${w.id.padEnd(20)} ${active.padEnd(8)} ${w.name}`);
  }
  console.log(`\nTotal: ${list.length} workflows\n`);
}

async function main() {
  switch (cmd) {

    case 'list': {
      const workflows = await listWorkflows();
      printWorkflows(workflows);
      break;
    }

    case 'get': {
      if (!arg1) { console.error('Usage: node n8n.js get "workflow name"'); process.exit(1); }
      const workflow = await getWorkflow(arg1);
      console.log(`\n📋  ${workflow.name}  (id: ${workflow.id}, active: ${workflow.active})`);
      const nodes = getCodeNodes(workflow);
      if (!nodes.length) {
        console.log('  No Code nodes found.\n');
      } else {
        for (const n of nodes) {
          console.log(`\n  ┌─ Code Node: "${n.name}"  [mode: ${n.mode}]`);
          console.log('  │');
          n.code.split('\n').forEach(line => console.log(`  │  ${line}`));
          console.log('  └' + '─'.repeat(60));
        }
      }
      break;
    }

    case 'executions': {
      if (!arg1) { console.error('Usage: node n8n.js executions "workflow name"'); process.exit(1); }
      const workflow = await getWorkflow(arg1);
      const execs = await getExecutions(workflow.id, 5);
      console.log(`\n⏱  Last executions for "${workflow.name}":\n`);
      console.log(`${'ID'.padEnd(12)} ${'STATUS'.padEnd(10)} ${'MODE'.padEnd(12)} STARTED`);
      console.log('─'.repeat(65));
      for (const e of execs) {
        const icon = e.status === 'success' ? '✅' : e.status === 'error' ? '❌' : '⏸ ';
        console.log(
          `${String(e.id).padEnd(12)} ${(icon + ' ' + e.status).padEnd(14)} ${(e.mode||'').padEnd(12)} ${e.startedAt}`
        );
      }
      console.log('');
      break;
    }

    case 'errors': {
      if (!arg1) { console.error('Usage: node n8n.js errors "workflow name"'); process.exit(1); }
      const result = await findAndFixError(arg1);
      console.log('\n🔍  Last Error:\n');
      console.log(`  Execution ID : ${result.executionId || 'N/A'}`);
      console.log(`  Started At   : ${result.startedAt || 'N/A'}`);
      console.log(`  Failed Node  : ${result.node || 'N/A'}`);
      console.log(`  Error        : ${result.message}`);
      console.log('');
      break;
    }

    case 'test': {
      if (!arg1) { console.error('Usage: node n8n.js test "webhook/path" \'{"key":"val"}\''); process.exit(1); }
      let body = {};
      if (arg2) { try { body = JSON.parse(arg2); } catch { console.error('❌  Invalid JSON body'); process.exit(1); } }
      console.log(`\n🚀  POST → webhook/${arg1}`);
      const result = await triggerWebhook(arg1, body);
      const icon = result.ok ? '✅' : '❌';
      console.log(`${icon}  Status: ${result.status}`);
      console.log('  Response:', JSON.stringify(result.body, null, 2));
      console.log('');
      break;
    }

    default:
      console.log(`
n8n.js — Victory Vision n8n CLI

Commands:
  node n8n.js list                          List all workflows
  node n8n.js get "workflow name"           Show code nodes in a workflow
  node n8n.js executions "workflow name"    Show last 5 executions
  node n8n.js errors "workflow name"        Show last error detail
  node n8n.js test "webhook/path" '{}'      POST to a webhook
`);
  }
}

main().catch(err => {
  console.error('❌ ', err.message);
  process.exit(1);
});
