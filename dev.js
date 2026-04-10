#!/usr/bin/env node
/**
 * dev.js — Autonomous Victory Vision development tool
 * Combines n8n API control with local HTML file editing
 *
 * Usage: node dev.js <command> [args...]
 */

import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const API_KEY  = process.env.N8N_API_KEY;
const BASE_URL = process.env.N8N_BASE_URL;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');

if (!API_KEY || !BASE_URL) {
  console.error('❌  N8N_API_KEY or N8N_BASE_URL missing from .env');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
//  N8N API HELPERS
// ═══════════════════════════════════════════════════════════════

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
    throw new Error(`n8n API ${res.status} [${path}]: ${text}`);
  }
  return res.json();
}

async function listWorkflows() {
  const all = [];
  let cursor = null;
  do {
    const qs = cursor ? `?limit=50&cursor=${cursor}` : '?limit=50';
    const data = await api(`/workflows${qs}`);
    all.push(...data.data);
    cursor = data.nextCursor || null;
  } while (cursor);
  return all;
}

async function getWorkflow(nameOrId) {
  try { return await api(`/workflows/${nameOrId}`); } catch {}
  const list = await listWorkflows();
  const match = list.find(w =>
    w.name.toLowerCase().includes(nameOrId.toLowerCase())
  );
  if (!match) throw new Error(`No workflow found matching "${nameOrId}"`);
  return api(`/workflows/${match.id}`);
}

function findCodeNode(workflow, nodeName) {
  const node = workflow.nodes.find(
    n => n.type === 'n8n-nodes-base.code' && n.name === nodeName
  );
  if (!node) throw new Error(
    `Code node "${nodeName}" not found. Available code nodes: ` +
    workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code').map(n => n.name).join(', ')
  );
  return node;
}

async function saveWorkflow(workflow) {
  // n8n PUT only accepts specific fields; strip read-only props and binaryMode from settings
  const { executionOrder, callerPolicy, timezone, saveManualExecutions, saveExecutionProgress } =
    workflow.settings || {};
  const settings = {};
  if (executionOrder)          settings.executionOrder = executionOrder;
  if (callerPolicy)            settings.callerPolicy = callerPolicy;
  if (timezone)                settings.timezone = timezone;
  if (saveManualExecutions !== undefined) settings.saveManualExecutions = saveManualExecutions;
  if (saveExecutionProgress !== undefined) settings.saveExecutionProgress = saveExecutionProgress;

  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings,
  };
  return api(`/workflows/${workflow.id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function getExecutions(workflowId, limit = 5) {
  const data = await api(
    `/executions?workflowId=${workflowId}&limit=${limit}&includeData=false`
  );
  return data.data;
}

async function getExecutionDetail(executionId) {
  return api(`/executions/${executionId}?includeData=true`);
}

function extractError(detail) {
  const runData = detail.data?.resultData?.runData || {};
  for (const [nodeName, runs] of Object.entries(runData)) {
    for (const run of (runs || [])) {
      if (run.error) {
        return { node: nodeName, message: run.error.message || JSON.stringify(run.error) };
      }
    }
  }
  const topErr = detail.data?.resultData?.error;
  if (topErr) return { node: 'unknown', message: topErr.message || JSON.stringify(topErr) };
  return null;
}

// Poll until execution finishes or timeout
async function waitForExecution(workflowId, timeoutMs = 30000) {
  const start = Date.now();
  // Give n8n a moment to register the execution
  await sleep(1500);

  while (Date.now() - start < timeoutMs) {
    const execs = await getExecutions(workflowId, 1);
    if (execs.length && execs[0].status !== 'running' && execs[0].status !== 'waiting') {
      return execs[0];
    }
    process.stdout.write('.');
    await sleep(2000);
  }
  throw new Error('Execution timed out after 30s');
}

async function triggerWebhook(path, body = {}) {
  // n8n webhooks are served at the n8n cloud host, not the site URL
  const n8nHost = BASE_URL.replace('/api/v1', '');
  const url = `${n8nHost}/webhook/${path.replace(/^\//, '')}`;
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
//  HTML HELPERS
// ═══════════════════════════════════════════════════════════════

function readHtml(filename) {
  const p = resolve(__dirname, filename);
  return readFileSync(p, 'utf8');
}

function writeHtml(filename, content) {
  writeFileSync(resolve(__dirname, filename), content, 'utf8');
}

// ═══════════════════════════════════════════════════════════════
//  COMMANDS
// ═══════════════════════════════════════════════════════════════

// node dev.js workflow-errors "emailAgent"
async function cmdWorkflowErrors(workflowName) {
  const workflow = await getWorkflow(workflowName);
  console.log(`\n🔍  Last 5 errors for "${workflow.name}":\n`);

  const execs = await getExecutions(workflow.id, 20);
  const failed = execs.filter(e => e.status === 'error').slice(0, 5);

  if (!failed.length) {
    console.log('  ✅  No failed executions found.\n');
    return;
  }

  for (const exec of failed) {
    const detail = await getExecutionDetail(exec.id);
    const err = extractError(detail);
    console.log(`  ❌  Execution ${exec.id}  [${exec.startedAt}]`);
    console.log(`      Node   : ${err?.node || 'N/A'}`);
    console.log(`      Error  : ${err?.message || 'unknown'}`);
    console.log('');
  }
}

// node dev.js read-node "emailAgent" "Code2"
async function cmdReadNode(workflowName, nodeName) {
  const workflow = await getWorkflow(workflowName);
  const node = findCodeNode(workflow, nodeName);
  const code = node.parameters?.jsCode || node.parameters?.pythonCode || '(empty)';

  console.log(`\n📄  "${nodeName}" in "${workflow.name}":\n`);
  console.log('─'.repeat(70));
  console.log(code);
  console.log('─'.repeat(70) + '\n');
}

// node dev.js update-node "emailAgent" "Code2" "path/to/fix.js"
async function cmdUpdateNode(workflowName, nodeName, filePath) {
  const newCode = readFileSync(resolve(__dirname, filePath), 'utf8');
  const workflow = await getWorkflow(workflowName);
  const node = findCodeNode(workflow, nodeName);

  const oldCode = node.parameters?.jsCode || node.parameters?.pythonCode || '';
  console.log(`\n📝  Updating "${nodeName}" in "${workflow.name}"...`);
  console.log(`    Old: ${oldCode.split('\n').length} lines → New: ${newCode.split('\n').length} lines`);

  if (node.parameters?.pythonCode !== undefined) {
    node.parameters.pythonCode = newCode;
  } else {
    node.parameters.jsCode = newCode;
  }

  await saveWorkflow(workflow);
  console.log('  ✅  Saved.\n');
}

// node dev.js test-webhook "emails/leadmagnet" '{"customer_id":"test"}'
async function cmdTestWebhook(path, jsonBody) {
  let body = {};
  if (jsonBody) {
    try { body = JSON.parse(jsonBody); }
    catch { console.error('❌  Invalid JSON body'); process.exit(1); }
  }
  const n8nHost = BASE_URL.replace('/api/v1', '');
  console.log(`\n🚀  POST → ${n8nHost}/webhook/${path}\n`);
  const result = await triggerWebhook(path, body);
  const icon = result.ok ? '✅' : '❌';
  console.log(`${icon}  HTTP ${result.status}`);
  console.log('\nResponse:');
  console.log(JSON.stringify(result.body, null, 2));
  console.log('');
}

// node dev.js fix-loop "emailAgent" "Code2" "path/to/fix.js"
async function cmdFixLoop(workflowName, nodeName, filePath) {
  const MAX_RETRIES = 3;
  const workflow = await getWorkflow(workflowName);

  // Find webhook path from workflow
  const webhookNode = workflow.nodes.find(
    n => n.type === 'n8n-nodes-base.webhook'
  );
  if (!webhookNode) throw new Error('No webhook trigger found in this workflow');
  const webhookPath = webhookNode.parameters?.path;
  if (!webhookPath) throw new Error('Webhook node has no path configured');

  console.log(`\n🔁  Fix loop: "${workflowName}" → node "${nodeName}"`);
  console.log(`    Webhook path: ${webhookPath}`);
  console.log(`    Max retries: ${MAX_RETRIES}\n`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`── Attempt ${attempt}/${MAX_RETRIES} ─────────────────────────────`);

    // 1. Load and apply new code
    const newCode = readFileSync(resolve(__dirname, filePath), 'utf8');
    const fresh = await getWorkflow(workflowName); // re-fetch to avoid stale version
    const node = findCodeNode(fresh, nodeName);

    if (node.parameters?.pythonCode !== undefined) {
      node.parameters.pythonCode = newCode;
    } else {
      node.parameters.jsCode = newCode;
    }
    await saveWorkflow(fresh);
    console.log('  ✅  Code saved');

    // 2. Trigger webhook
    console.log(`  🚀  Triggering webhook...`);
    const trigger = await triggerWebhook(webhookPath, { _test: true, attempt });
    console.log(`      Webhook → HTTP ${trigger.status}`);

    // 3. Wait for execution
    process.stdout.write('  ⏳  Waiting for execution');
    let exec;
    try {
      exec = await waitForExecution(fresh.id);
    } catch (e) {
      console.log(`\n  ⏰  ${e.message}`);
      continue;
    }
    console.log('');

    // 4. Check result
    if (exec.status === 'success') {
      console.log(`  ✅  Execution ${exec.id} succeeded!\n`);
      return;
    }

    // 5. Extract error
    const detail = await getExecutionDetail(exec.id);
    const err = extractError(detail);
    console.log(`  ❌  Execution failed`);
    console.log(`      Node   : ${err?.node || 'unknown'}`);
    console.log(`      Error  : ${err?.message || 'unknown'}\n`);

    if (attempt === MAX_RETRIES) {
      console.log(`🛑  All ${MAX_RETRIES} attempts failed. Last error:`);
      console.log(`    Node   : ${err?.node}`);
      console.log(`    Error  : ${err?.message}\n`);
    }
  }
}

// node dev.js html-find "contacts.html" "schedule_start_date"
async function cmdHtmlFind(filename, searchStr) {
  const content = readHtml(filename);
  const lines = content.split('\n');
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      matches.push({ line: i + 1, content: lines[i] });
    }
  }

  console.log(`\n🔎  "${searchStr}" in ${filename}:\n`);
  if (!matches.length) {
    console.log('  No matches found.\n');
    return;
  }

  for (const m of matches) {
    console.log(`  Line ${String(m.line).padEnd(6)} ${m.content.trim()}`);
  }
  console.log(`\n  ${matches.length} match(es) found\n`);
}

// node dev.js html-replace "contacts.html" 123 "old string" "new string"
async function cmdHtmlReplace(filename, lineNum, oldStr, newStr) {
  const lineNumber = parseInt(lineNum, 10);
  if (isNaN(lineNumber)) throw new Error('Line number must be an integer');

  const content = readHtml(filename);
  const lines = content.split('\n');
  const idx = lineNumber - 1;

  if (idx < 0 || idx >= lines.length) {
    throw new Error(`Line ${lineNumber} out of range (file has ${lines.length} lines)`);
  }

  const original = lines[idx];
  if (!original.includes(oldStr)) {
    throw new Error(
      `String not found on line ${lineNumber}.\n` +
      `  Expected : ${oldStr}\n` +
      `  Got      : ${original.trim()}`
    );
  }

  const occurrences = (original.split(oldStr).length - 1);
  if (occurrences > 1) {
    throw new Error(
      `"${oldStr}" appears ${occurrences} times on line ${lineNumber}. Be more specific.`
    );
  }

  const updated = original.replace(oldStr, newStr);
  lines[idx] = updated;

  console.log(`\n✏️   ${filename}  line ${lineNumber}`);
  console.log(`\n  BEFORE: ${original.trim()}`);
  console.log(`  AFTER : ${updated.trim()}\n`);

  writeHtml(filename, lines.join('\n'));
  console.log('  ✅  Saved.\n');
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

const [,, cmd, ...args] = process.argv;

const HELP = `
dev.js — Victory Vision autonomous dev tool

  n8n commands:
    node dev.js workflow-errors "emailAgent"
      Show last 5 failed executions with node + error message

    node dev.js read-node "emailAgent" "Code2"
      Print current JS in a code node

    node dev.js update-node "emailAgent" "Code2" "path/to/fix.js"
      Replace code node JS from a local file

    node dev.js test-webhook "emails/leadmagnet" '{"customer_id":"test"}'
      POST to webhook and show full response

    node dev.js fix-loop "emailAgent" "Code2" "path/to/fix.js"
      Update node → trigger → wait → check result → retry up to 3x

  HTML commands:
    node dev.js html-find "contacts.html" "schedule_start_date"
      Find all lines containing a string

    node dev.js html-replace "contacts.html" 123 "old string" "new string"
      Surgical single-line replacement with before/after confirmation
`;

async function main() {
  switch (cmd) {
    case 'workflow-errors': await cmdWorkflowErrors(args[0]); break;
    case 'read-node':       await cmdReadNode(args[0], args[1]); break;
    case 'update-node':     await cmdUpdateNode(args[0], args[1], args[2]); break;
    case 'test-webhook':    await cmdTestWebhook(args[0], args[1]); break;
    case 'fix-loop':        await cmdFixLoop(args[0], args[1], args[2]); break;
    case 'html-find':       await cmdHtmlFind(args[0], args[1]); break;
    case 'html-replace':    await cmdHtmlReplace(args[0], args[1], args[2], args[3]); break;
    default: console.log(HELP);
  }
}

main().catch(err => {
  console.error('\n❌ ', err.message, '\n');
  process.exit(1);
});
