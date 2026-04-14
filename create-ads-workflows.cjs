// create-ads-workflows.cjs
// Creates 7 core ads workflows for Victory Vision
require('dotenv').config();
const https = require('https');

const N8N_API_KEY  = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const SUPABASE_CRED_ID = 'Fys2RzaxZTqtBMmH';
const SUPABASE_URL     = 'https://nyyvsdkumxvuwimmucdb.supabase.co';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url     = new URL(N8N_BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function upsertWorkflow(wfDef) {
  const res = await apiCall('GET', '/workflows?limit=250');
  if (res.body.data) {
    for (const wf of res.body.data) {
      if (wf.name === wfDef.name) {
        console.log(`  Replacing existing "${wfDef.name}" (id=${wf.id})`);
        await apiCall('DELETE', `/workflows/${wf.id}`);
      }
    }
  }
  await new Promise(r => setTimeout(r, 400));
  const cr = await apiCall('POST', '/workflows', wfDef);
  if (cr.status !== 200 && cr.status !== 201) {
    console.error(`  ✗ Create failed (${cr.status}):`, JSON.stringify(cr.body).slice(0, 300));
    return null;
  }
  const id = cr.body.id;
  await new Promise(r => setTimeout(r, 600));
  const ac = await apiCall('POST', `/workflows/${id}/activate`);
  const ok = ac.status >= 200 && ac.status < 300;
  console.log(`  ${ok ? '✓' : '⚠ activate failed'} "${wfDef.name}" id=${id}`);
  return id;
}

// ─── COMMON SUPABASE QUERY NODE BUILDER ──────────────────────────────────────
function sbQuery(id, name, table, filter, position, select = '*') {
  return {
    id, name,
    type: 'n8n-nodes-base.supabase', typeVersion: 1,
    position,
    parameters: {
      operation: 'getAll',
      tableId: table,
      returnAll: true,
      filters: {
        conditions: filter ? [filter] : []
      },
      ...(select !== '*' ? { additionalFields: { queryParameters: `select=${select}` } } : {})
    },
    credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
  };
}

function sbWebhook(id, name, path, position) {
  return {
    id, name, type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position,
    parameters: {
      path, httpMethod: 'POST', responseMode: 'responseNode',
      options: {
        responseHeaders: {
          entries: [
            { name: 'Access-Control-Allow-Origin',  value: 'https://victoryvision.app' },
            { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
            { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Customer-ID' }
          ]
        }
      }
    }
  };
}

function sbRespond(id, name, position, bodyExpr) {
  return {
    id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    position,
    parameters: {
      respondWith: 'json',
      responseBody: bodyExpr,
      options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: 'https://victoryvision.app' }] } }
    }
  };
}

const STD_SETTINGS = {
  executionOrder: 'v1',
  saveManualExecutions: true,
  saveDataSuccessExecution: 'all',
  saveDataErrorExecution: 'all'
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. Ads - Get  (POST /webhook/ads/get)
//    Returns: ads (with platform cols) + victories intelligence + pages data
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsGet() {
  const wf = {
    name: 'Ads - Get',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/get', [0, 300]),

      // Read ads for this customer
      {
        id: 'get-ads', name: 'Get Ads', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 200],
        parameters: {
          operation: 'getAll', tableId: 'ads', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Read victories (ROI source: estimated_annual_revenue, conversion traits)
      {
        id: 'get-victories', name: 'Get Victories', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 400],
        parameters: {
          operation: 'getAll', tableId: 'victories', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Read pages (conversions, revenue, visitor_sources, CTR)
      {
        id: 'get-pages', name: 'Get Pages', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 600],
        parameters: {
          operation: 'getAll', tableId: 'pages', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Read ad_accounts (platform connection status)
      {
        id: 'get-accounts', name: 'Get Ad Accounts', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 800],
        parameters: {
          operation: 'getAll', tableId: 'ad_accounts', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Merge node — wait for all 4 sources
      {
        id: 'merge', name: 'Merge All', type: 'n8n-nodes-base.merge', typeVersion: 3,
        position: [480, 500],
        parameters: { mode: 'combineBySql', query: 'SELECT * FROM input1', numberInputs: 4 }
      },

      // Code node: compute ROI + intelligence
      {
        id: 'build', name: 'Build Response', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [700, 500],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
const wh        = $('Webhook').first().json;
const customerId= wh.body.customer_id;
const ads       = $('Get Ads').all().map(i => i.json);
const victories = $('Get Victories').all().map(i => i.json);
const pages     = $('Get Pages').all().map(i => i.json);
const accounts  = $('Get Ad Accounts').all().map(i => i.json);

// ── Per-platform rollup ──────────────────────────────
function rollup(list) {
  return {
    spend:     list.reduce((s,a) => s + (Number(a.spend)||0), 0),
    impressions: list.reduce((s,a) => s + (Number(a.impressions)||0), 0),
    clicks:    list.reduce((s,a) => s + (Number(a.clicks)||0), 0),
    conversions: list.reduce((s,a) => s + (Number(a.conversions)||0), 0),
    meetings:  list.reduce((s,a) => s + (Number(a.meetings_booked)||0), 0),
    newCustomers: list.reduce((s,a) => s + (Number(a.new_customers)||0), 0),
    conversionRevenue: list.reduce((s,a) => s + (Number(a.conversion_revenue)||0), 0),
    count: list.length
  };
}

const platforms = ['google_ads','msft_ads','linkedin_ads','billboard'];
const byPlatform = {};
for (const p of platforms) {
  const sub = ads.filter(a => (a.platform||'linkedin') === p || (p==='linkedin_ads' && !a.platform));
  byPlatform[p] = rollup(sub);
}
const totals = rollup(ads);

// ── Victories intelligence ───────────────────────────
// Summarise what messaging / use cases won, avg revenue
const totalRevenue = victories.reduce((s,v) => s + (Number(v.estimated_annual_revenue)||0), 0);
const avgRevenue   = victories.length ? Math.round(totalRevenue / victories.length) : 0;
const topMessages  = victories.flatMap(v => (v.messages_that_landed||'').split(',').map(m=>m.trim()).filter(Boolean));
const topUseCases  = victories.flatMap(v => (v.use_cases_that_resonated||'').split(',').map(m=>m.trim()).filter(Boolean));
const freq = arr => {
  const m = {};
  arr.forEach(x => { if(x) m[x] = (m[x]||0)+1; });
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
};
const winningMessages  = freq(topMessages);
const winningUseCases  = freq(topUseCases);

// ── Pages performance ─────────────────────────────────
const topPages = pages
  .sort((a,b) => (Number(b.conversions)||0) - (Number(a.conversions)||0))
  .slice(0, 5)
  .map(p => ({
    id: p.id, name: p.page_name||p.name||'Page',
    views: p.views||0, conversions: p.conversions||0,
    revenue: p.revenue||0,
    ctr: p.ctr||0,
    visitor_sources: p.visitor_sources||'{}'
  }));

// ── Overall ROI ───────────────────────────────────────
const totalSpend  = totals.spend;
const totalReturn = totals.conversionRevenue || totalRevenue * (totals.newCustomers / Math.max(victories.length,1));
const roi = totalSpend > 0 ? Math.round((totalReturn - totalSpend) / totalSpend * 100) : 0;
const costPerMeeting = totals.meetings > 0 ? Math.round(totalSpend / totals.meetings) : 0;

return [{
  json: {
    ads,
    by_platform: byPlatform,
    totals: { ...totals, roi, cost_per_meeting: costPerMeeting },
    ad_accounts: accounts,
    intelligence: {
      total_victories: victories.length,
      avg_deal_revenue: avgRevenue,
      winning_messages: winningMessages,
      winning_use_cases: winningUseCases
    },
    top_pages: topPages
  }
}];
`
        }
      },

      sbRespond('respond', 'Respond', [920, 500], '={{ JSON.stringify($json) }}')
    ],
    connections: {
      'Webhook':     { main: [[
        { node: 'Get Ads',        type: 'main', index: 0 },
        { node: 'Get Victories',  type: 'main', index: 0 },
        { node: 'Get Pages',      type: 'main', index: 0 },
        { node: 'Get Ad Accounts',type: 'main', index: 0 }
      ]] },
      'Get Ads':         { main: [[{ node: 'Build Response', type: 'main', index: 0 }]] },
      'Get Victories':   { main: [[{ node: 'Build Response', type: 'main', index: 0 }]] },
      'Get Pages':       { main: [[{ node: 'Build Response', type: 'main', index: 0 }]] },
      'Get Ad Accounts': { main: [[{ node: 'Build Response', type: 'main', index: 0 }]] },
      'Build Response':  { main: [[{ node: 'Respond',        type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Ads - Optimizations  (POST /webhook/ads/get-optimizations)
//    Rule-based: CTR < 0.25%, high spend 0 meetings, cost_per_mtg < 70% target
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsOptimizations() {
  const wf = {
    name: 'Ads - Optimizations',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/get-optimizations', [0, 300]),

      // Get active ads
      {
        id: 'get-ads', name: 'Get Active Ads', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 200],
        parameters: {
          operation: 'getAll', tableId: 'ads', returnAll: true,
          filters: { conditions: [
            { keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' },
            { keyName: 'status',      keyValue: 'ACTIVE',                        condition: 'eq' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Get guardrails
      {
        id: 'get-guardrails', name: 'Get Guardrails', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 450],
        parameters: {
          operation: 'getAll', tableId: 'ad_guardrails', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Get pending actions from log
      {
        id: 'get-log', name: 'Get Pending Actions', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 650],
        parameters: {
          operation: 'getAll', tableId: 'ai_ad_actions_log', returnAll: true,
          filters: { conditions: [
            { keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' },
            { keyName: 'status',      keyValue: 'pending',                                        condition: 'eq' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'analyze', name: 'Analyze & Recommend', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [500, 400],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
const ads       = $('Get Active Ads').all().map(i => i.json);
const guardrails= $('Get Guardrails').all().map(i => i.json);
const pending   = $('Get Pending Actions').all().map(i => i.json);

const targetCPM = (platform) => {
  const g = guardrails.find(r => r.platform === platform);
  return g ? Number(g.target_cost_per_meeting) || 200 : 200;
};

const recs = [];

for (const ad of ads) {
  const platform = ad.platform || 'linkedin_ads';
  const ctr      = Number(ad.ctr) || 0;
  const spend    = Number(ad.spend) || 0;
  const meetings = Number(ad.meetings_booked) || 0;
  const clicks   = Number(ad.clicks) || 0;
  const cpm_actual = meetings > 0 ? spend / meetings : null;
  const budget   = Number(ad.daily_budget) || 0;
  const target   = targetCPM(platform);

  // Rule 1: Creative fatigue — CTR < 0.25% and 100+ clicks
  if (ctr > 0 && ctr < 0.0025 && clicks >= 100) {
    recs.push({
      ad_id: ad.id, platform, action_type: 'pause',
      rationale: \`CTR \${(ctr*100).toFixed(3)}% is below 0.25% benchmark after \${clicks} clicks — creative fatigue. Recommend pausing and launching a new variant.\`,
      priority: 'high',
      before_value: { ctr, clicks, status: ad.status },
      after_value:  { status: 'PAUSED' },
      kpi_snapshot: { ctr, clicks, spend, meetings, cpm: cpm_actual }
    });
  }

  // Rule 2: High spend, zero meetings
  if (spend >= 100 && meetings === 0) {
    recs.push({
      ad_id: ad.id, platform, action_type: 'pause',
      rationale: \`$\${spend.toFixed(2)} spent with 0 meetings booked — audience match or targeting may be off. Recommend pause and audience review.\`,
      priority: 'high',
      before_value: { spend, meetings, status: ad.status },
      after_value:  { status: 'PAUSED' },
      kpi_snapshot: { ctr, clicks, spend, meetings, cpm: null }
    });
  }

  // Rule 3: Outperforming — cost/meeting < 70% of target → increase budget
  if (cpm_actual !== null && cpm_actual < target * 0.7 && meetings >= 3) {
    const increase = Math.min(budget * 0.2, 50); // max 20% or $50/day
    recs.push({
      ad_id: ad.id, platform, action_type: 'budget_increase',
      rationale: \`Cost per meeting $\${cpm_actual.toFixed(0)} is \${Math.round((1-cpm_actual/target)*100)}% below $\${target} target with \${meetings} meetings. Recommend +$\${increase.toFixed(0)}/day budget increase.\`,
      priority: 'medium',
      before_value: { daily_budget: budget, cost_per_meeting: cpm_actual },
      after_value:  { daily_budget: budget + increase },
      kpi_snapshot: { ctr, clicks, spend, meetings, cpm: cpm_actual }
    });
  }
}

// Remove recs that already have pending actions for same ad + action type
const pendingKeys = new Set(pending.map(p => \`\${p.ad_id}_\${p.action_type}\`));
const newRecs = recs.filter(r => !pendingKeys.has(\`\${r.ad_id}_\${r.action_type}\`));

return [{ json: { recommendations: newRecs, pending_count: pending.length, analyzed_ads: ads.length } }];
`
        }
      },

      sbRespond('respond', 'Respond', [720, 400], '={{ JSON.stringify($json) }}')
    ],
    connections: {
      'Webhook':          { main: [[
        { node: 'Get Active Ads',      type: 'main', index: 0 },
        { node: 'Get Guardrails',      type: 'main', index: 0 },
        { node: 'Get Pending Actions', type: 'main', index: 0 }
      ]] },
      'Get Active Ads':      { main: [[{ node: 'Analyze & Recommend', type: 'main', index: 0 }]] },
      'Get Guardrails':      { main: [[{ node: 'Analyze & Recommend', type: 'main', index: 0 }]] },
      'Get Pending Actions': { main: [[{ node: 'Analyze & Recommend', type: 'main', index: 0 }]] },
      'Analyze & Recommend': { main: [[{ node: 'Respond',             type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Ads - Apply Optimization  (POST /webhook/ads/apply-optimization)
//    Guardrail check → log → update ads table
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsApplyOpt() {
  const wf = {
    name: 'Ads - Apply Optimization',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/apply-optimization', [0, 300]),

      // Guardrail check
      {
        id: 'get-guardrails', name: 'Get Guardrails', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 300],
        parameters: {
          operation: 'getAll', tableId: 'ad_guardrails', returnAll: true,
          filters: { conditions: [
            { keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' },
            { keyName: 'platform',    keyValue: '={{ $json.body.platform }}',    condition: 'eq' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'guard-check', name: 'Guardrail Check', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [440, 300],
        parameters: {
          jsCode: `
const wh    = $('Webhook').item.json;
const body  = wh.body;
const guard = $('Get Guardrails').all()[0]?.json || {};

if (guard.kill_switch) {
  return [{ json: { blocked: true, reason: 'Kill switch active — no changes allowed.' } }];
}

const budgetChange = body.after_value?.daily_budget;
const currentBudget= body.before_value?.daily_budget;
if (budgetChange && currentBudget) {
  const pct = (budgetChange - currentBudget) / currentBudget * 100;
  const maxPct = Number(guard.max_budget_increase_pct) || 20;
  if (pct > maxPct) {
    return [{ json: { blocked: true, reason: \`Budget increase \${pct.toFixed(1)}% exceeds max \${maxPct}% guardrail.\` } }];
  }
}

return [{ json: {
  blocked: false,
  ad_id: body.ad_id,
  action_type: body.action_type,
  rationale: body.rationale,
  before_value: body.before_value,
  after_value: body.after_value,
  kpi_snapshot: body.kpi_snapshot,
  customer_id: body.customer_id,
  platform: body.platform,
  applied_by: body.applied_by || 'auto'
}}];
`
        }
      },

      // IF blocked → respond with error
      {
        id: 'if-blocked', name: 'If Blocked', type: 'n8n-nodes-base.if', typeVersion: 2,
        position: [660, 300],
        parameters: {
          conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [{ id: '1', leftValue: '={{ $json.blocked }}', rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] }
        }
      },

      // Log to ai_ad_actions_log
      {
        id: 'log-action', name: 'Log Action', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [880, 450],
        parameters: {
          operation: 'create', tableId: 'ai_ad_actions_log',
          fieldsUi: { fieldValues: [
            { fieldId: 'customer_id',  fieldValue: '={{ $json.customer_id }}' },
            { fieldId: 'platform',     fieldValue: '={{ $json.platform }}' },
            { fieldId: 'ad_id',        fieldValue: '={{ $json.ad_id }}' },
            { fieldId: 'action_type',  fieldValue: '={{ $json.action_type }}' },
            { fieldId: 'rationale',    fieldValue: '={{ $json.rationale }}' },
            { fieldId: 'before_value', fieldValue: '={{ JSON.stringify($json.before_value) }}' },
            { fieldId: 'after_value',  fieldValue: '={{ JSON.stringify($json.after_value) }}' },
            { fieldId: 'kpi_snapshot', fieldValue: '={{ JSON.stringify($json.kpi_snapshot) }}' },
            { fieldId: 'status',       fieldValue: 'applied' },
            { fieldId: 'applied_by',   fieldValue: '={{ $json.applied_by }}' },
            { fieldId: 'applied_at',   fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Apply change to ads table
      {
        id: 'apply', name: 'Apply Change', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [1100, 450],
        parameters: {
          operation: 'update', tableId: 'ads',
          matchType: 'allFilters',
          filters: { conditions: [{ keyName: 'id', keyValue: '={{ $("Guardrail Check").item.json.ad_id }}', condition: 'eq' }] },
          fieldsUi: { fieldValues: [
            { fieldId: 'status',       fieldValue: '={{ $("Guardrail Check").item.json.action_type === "pause" ? "PAUSED" : undefined }}' },
            { fieldId: 'daily_budget', fieldValue: '={{ $("Guardrail Check").item.json.after_value?.daily_budget ?? undefined }}' },
            { fieldId: 'updated_at',   fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      sbRespond('respond-ok',      'Respond OK',      [1320, 450], '={"success":true,"action":"{{ $("Guardrail Check").item.json.action_type }}","ad_id":{{ $("Guardrail Check").item.json.ad_id }}}'),
      sbRespond('respond-blocked', 'Respond Blocked', [880,  200], '={"success":false,"blocked":true,"reason":"{{ $json.reason }}"}')
    ],
    connections: {
      'Webhook':         { main: [[{ node: 'Get Guardrails', type: 'main', index: 0 }]] },
      'Get Guardrails':  { main: [[{ node: 'Guardrail Check', type: 'main', index: 0 }]] },
      'Guardrail Check': { main: [[{ node: 'If Blocked',     type: 'main', index: 0 }]] },
      'If Blocked': {
        main: [
          [{ node: 'Respond Blocked', type: 'main', index: 0 }],
          [{ node: 'Log Action',      type: 'main', index: 0 }]
        ]
      },
      'Log Action': { main: [[{ node: 'Apply Change', type: 'main', index: 0 }]] },
      'Apply Change':{ main: [[{ node: 'Respond OK',  type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Ads - Remove  (POST /webhook/ads/remove)
//    Pause ad in Supabase + log
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsRemove() {
  const wf = {
    name: 'Ads - Remove',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/remove', [0, 300]),

      {
        id: 'pause', name: 'Pause Ad', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 300],
        parameters: {
          operation: 'update', tableId: 'ads',
          matchType: 'allFilters',
          filters: { conditions: [
            { keyName: 'id',          keyValue: '={{ $json.body.ad_id }}',        condition: 'eq' },
            { keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}',  condition: 'eq' }
          ]},
          fieldsUi: { fieldValues: [
            { fieldId: 'status',     fieldValue: 'PAUSED' },
            { fieldId: 'updated_at', fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'log', name: 'Log Removal', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [440, 300],
        parameters: {
          operation: 'create', tableId: 'ai_ad_actions_log',
          fieldsUi: { fieldValues: [
            { fieldId: 'customer_id', fieldValue: '={{ $("Webhook").item.json.body.customer_id }}' },
            { fieldId: 'ad_id',       fieldValue: '={{ $("Webhook").item.json.body.ad_id }}' },
            { fieldId: 'action_type', fieldValue: 'pause' },
            { fieldId: 'rationale',   fieldValue: '={{ $("Webhook").item.json.body.reason || "User manually paused" }}' },
            { fieldId: 'status',      fieldValue: 'applied' },
            { fieldId: 'applied_by',  fieldValue: '={{ $("Webhook").item.json.body.customer_id }}' },
            { fieldId: 'applied_at',  fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      sbRespond('respond', 'Respond', [660, 300], '={"success":true}')
    ],
    connections: {
      'Webhook':     { main: [[{ node: 'Pause Ad',     type: 'main', index: 0 }]] },
      'Pause Ad':    { main: [[{ node: 'Log Removal',  type: 'main', index: 0 }]] },
      'Log Removal': { main: [[{ node: 'Respond',      type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. Ads - Audience Builder  (POST /webhook/ads/build-audience)
//    Score contacts HOT(≥40) / WARM(≥15) from customer_journey signals
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsAudienceBuilder() {
  const wf = {
    name: 'Ads - Audience Builder',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/build-audience', [0, 300]),

      // Get all contacts for this customer
      {
        id: 'get-contacts', name: 'Get Contacts', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 300],
        parameters: {
          operation: 'getAll', tableId: 'contacts', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Score and build audience segments
      {
        id: 'score', name: 'Score Contacts', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [440, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
const wh = $('Webhook').first().json;
const customerId = wh.body.customer_id;
const contacts = $('Get Contacts').all().map(i => i.json);

const HOT_THRESHOLD  = 40;
const WARM_THRESHOLD = 15;

// Signal scoring weights
const SIGNAL_WEIGHTS = {
  calendly: 20, meeting: 20, booked: 20,
  clicked: 10, click: 10,
  opened: 5, open: 5,
  replied: 8, reply: 8,
  page: 3, visit: 3,
  video: 6,
  demo: 15, trial: 15
};

const scored = contacts.map(c => {
  const journey = (c.customer_journey || '').toLowerCase();
  let score = 0;
  const signals = [];

  for (const [keyword, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    if (journey.includes(keyword)) {
      score += weight;
      if (!signals.includes(keyword)) signals.push(keyword);
    }
  }

  // Bonus for email
  if (c.email) score += 5;

  let tier = null;
  if (score >= HOT_THRESHOLD)  tier = 'HOT';
  else if (score >= WARM_THRESHOLD) tier = 'WARM';
  else tier = 'ALL';

  return { ...c, _score: score, _tier: tier, _signals: signals };
});

const hot  = scored.filter(c => c._tier === 'HOT');
const warm = scored.filter(c => c._tier === 'WARM');
const all  = scored;

const summary = {
  customer_id: customerId,
  hot_count: hot.length,
  warm_count: warm.length,
  all_count: all.length,
  hot_emails:  hot.map(c => c.email).filter(Boolean),
  warm_emails: warm.map(c => c.email).filter(Boolean),
  all_emails:  all.map(c => c.email).filter(Boolean),
  scored_contacts: scored.map(c => ({
    id: c.id, email: c.email, name: c.name||c.full_name,
    score: c._score, tier: c._tier, signals: c._signals
  }))
};

return [{ json: summary }];
`
        }
      },

      // Save audience record for HOT
      {
        id: 'save-hot', name: 'Save HOT Audience', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [660, 200],
        parameters: {
          operation: 'upsert', tableId: 'audiences',
          fieldsUi: { fieldValues: [
            { fieldId: 'customer_id',   fieldValue: '={{ $json.customer_id }}' },
            { fieldId: 'name',          fieldValue: 'HOT – High Intent' },
            { fieldId: 'tier',          fieldValue: 'HOT' },
            { fieldId: 'platform',      fieldValue: '={{ $("Webhook").item.json.body.platform || "all" }}' },
            { fieldId: 'size_estimate', fieldValue: '={{ $json.hot_count }}' },
            { fieldId: 'status',        fieldValue: 'ready' },
            { fieldId: 'last_sync_at',  fieldValue: '={{ new Date().toISOString() }}' },
            { fieldId: 'updated_at',    fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // Save audience record for WARM
      {
        id: 'save-warm', name: 'Save WARM Audience', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [660, 400],
        parameters: {
          operation: 'upsert', tableId: 'audiences',
          fieldsUi: { fieldValues: [
            { fieldId: 'customer_id',   fieldValue: '={{ $("Score Contacts").item.json.customer_id }}' },
            { fieldId: 'name',          fieldValue: 'WARM – Engaged Prospects' },
            { fieldId: 'tier',          fieldValue: 'WARM' },
            { fieldId: 'platform',      fieldValue: '={{ $("Webhook").item.json.body.platform || "all" }}' },
            { fieldId: 'size_estimate', fieldValue: '={{ $("Score Contacts").item.json.warm_count }}' },
            { fieldId: 'status',        fieldValue: 'ready' },
            { fieldId: 'last_sync_at',  fieldValue: '={{ new Date().toISOString() }}' },
            { fieldId: 'updated_at',    fieldValue: '={{ new Date().toISOString() }}' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      sbRespond('respond', 'Respond', [880, 300], '={{ JSON.stringify($("Score Contacts").item.json) }}')
    ],
    connections: {
      'Webhook':      { main: [[{ node: 'Get Contacts',     type: 'main', index: 0 }]] },
      'Get Contacts': { main: [[{ node: 'Score Contacts',   type: 'main', index: 0 }]] },
      'Score Contacts': { main: [[
        { node: 'Save HOT Audience',  type: 'main', index: 0 },
        { node: 'Save WARM Audience', type: 'main', index: 0 }
      ]] },
      'Save HOT Audience':  { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
      'Save WARM Audience': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Ads - Create  (POST /webhook/ads/create)
//    Platform-agnostic draft creation. Saves to ads table.
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsCreate() {
  const wf = {
    name: 'Ads - Create',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/create', [0, 300]),

      // Check platform OAuth is connected
      {
        id: 'check-oauth', name: 'Check OAuth', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 300],
        parameters: {
          operation: 'getAll', tableId: 'ad_accounts', returnAll: false,
          filters: { conditions: [
            { keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' },
            { keyName: 'platform',    keyValue: '={{ $json.body.platform }}',    condition: 'eq' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'validate', name: 'Validate', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [440, 300],
        parameters: {
          jsCode: `
const wh   = $('Webhook').item.json;
const body = wh.body;
const acct = $('Check OAuth').all()[0]?.json;

if (!acct || !acct.oauth_connected) {
  return [{ json: { error: true, message: \`\${body.platform} is not connected. Go to Settings → Advertising to connect.\` } }];
}

const now = new Date().toISOString();
return [{ json: {
  error: false,
  customer_id:    body.customer_id,
  platform:       body.platform,
  campaign_name:  body.campaign_name || 'New Campaign',
  title:          body.title || '',
  text:           body.text || body.body || '',
  call_to_action: body.call_to_action || 'Learn More',
  url:            body.url || '',
  image:          body.image || '',
  daily_budget:   Number(body.daily_budget) || 20,
  audience_tier:  body.audience_tier || 'ALL',
  status:         'DRAFT',
  created_at: now, updated_at: now
}}];
`
        }
      },

      {
        id: 'if-error', name: 'If Error', type: 'n8n-nodes-base.if', typeVersion: 2,
        position: [660, 300],
        parameters: {
          conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [{ id: '1', leftValue: '={{ $json.error }}', rightValue: true, operator: { type: 'boolean', operation: 'equals' } }] }
        }
      },

      {
        id: 'save', name: 'Save Ad Draft', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [880, 450],
        parameters: {
          operation: 'create', tableId: 'ads',
          fieldsUi: { fieldValues: [
            { fieldId: 'customer_id',   fieldValue: '={{ $json.customer_id }}' },
            { fieldId: 'platform',      fieldValue: '={{ $json.platform }}' },
            { fieldId: 'campaign_name', fieldValue: '={{ $json.campaign_name }}' },
            { fieldId: 'title',         fieldValue: '={{ $json.title }}' },
            { fieldId: 'text',          fieldValue: '={{ $json.text }}' },
            { fieldId: 'call_to_action',fieldValue: '={{ $json.call_to_action }}' },
            { fieldId: 'url',           fieldValue: '={{ $json.url }}' },
            { fieldId: 'image',         fieldValue: '={{ $json.image }}' },
            { fieldId: 'daily_budget',  fieldValue: '={{ $json.daily_budget }}' },
            { fieldId: 'audience_tier', fieldValue: '={{ $json.audience_tier }}' },
            { fieldId: 'status',        fieldValue: 'DRAFT' }
          ]}
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      sbRespond('respond-ok',    'Respond OK',    [1100, 450], '={"success":true,"ad_id":{{ $json.id }},"status":"DRAFT"}'),
      sbRespond('respond-error', 'Respond Error', [880,  200], '={"success":false,"error":"{{ $json.message }}"}')
    ],
    connections: {
      'Webhook':    { main: [[{ node: 'Check OAuth', type: 'main', index: 0 }]] },
      'Check OAuth':{ main: [[{ node: 'Validate',    type: 'main', index: 0 }]] },
      'Validate':   { main: [[{ node: 'If Error',    type: 'main', index: 0 }]] },
      'If Error': {
        main: [
          [{ node: 'Respond Error', type: 'main', index: 0 }],
          [{ node: 'Save Ad Draft', type: 'main', index: 0 }]
        ]
      },
      'Save Ad Draft':{ main: [[{ node: 'Respond OK', type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Ads - Attribution  (POST /webhook/ads/get-attribution)
//    Full ROI chain: victories revenue + page conversion data
// ═════════════════════════════════════════════════════════════════════════════
async function createAdsAttribution() {
  const wf = {
    name: 'Ads - Attribution',
    settings: STD_SETTINGS,
    nodes: [
      sbWebhook('wh', 'Webhook', 'ads/get-attribution', [0, 300]),

      {
        id: 'get-victories', name: 'Get Victories', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 200],
        parameters: {
          operation: 'getAll', tableId: 'victories', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'get-pages', name: 'Get Pages', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 450],
        parameters: {
          operation: 'getAll', tableId: 'pages', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'get-ads', name: 'Get Ads', type: 'n8n-nodes-base.supabase', typeVersion: 1,
        position: [220, 650],
        parameters: {
          operation: 'getAll', tableId: 'ads', returnAll: true,
          filters: { conditions: [{ keyName: 'customer_id', keyValue: '={{ $("Webhook").item.json.body.customer_id }}', condition: 'eq' }] }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      {
        id: 'build', name: 'Build Attribution', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [500, 400],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: `
const victories = $('Get Victories').all().map(i => i.json);
const pages     = $('Get Pages').all().map(i => i.json);
const ads       = $('Get Ads').all().map(i => i.json);

// Revenue attribution by platform (from conversion_revenue on ads table)
const byPlatform = {};
for (const ad of ads) {
  const p = ad.platform || 'linkedin_ads';
  if (!byPlatform[p]) byPlatform[p] = { spend: 0, revenue: 0, meetings: 0, customers: 0 };
  byPlatform[p].spend    += Number(ad.spend)              || 0;
  byPlatform[p].revenue  += Number(ad.conversion_revenue) || 0;
  byPlatform[p].meetings += Number(ad.meetings_booked)    || 0;
  byPlatform[p].customers+= Number(ad.new_customers)      || 0;
}

// Victories intelligence
const totalRevenue = victories.reduce((s,v) => s + (Number(v.estimated_annual_revenue)||0), 0);
const avgRevenue   = victories.length ? Math.round(totalRevenue / victories.length) : 0;
const avgDaysToConvert = victories.length
  ? Math.round(victories.reduce((s,v) => s + (Number(v.days_to_convert)||0), 0) / victories.length)
  : null;

const topMessages = (() => {
  const m = {};
  victories.forEach(v => (v.messages_that_landed||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(k => { m[k]=(m[k]||0)+1; }));
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,n])=>({ message:k, wins:n }));
})();

const topUseCases = (() => {
  const m = {};
  victories.forEach(v => (v.use_cases_that_resonated||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(k => { m[k]=(m[k]||0)+1; }));
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,n])=>({ use_case:k, wins:n }));
})();

// Page attribution from visitor_sources
const pageAttribution = pages.map(p => {
  let sources = {};
  try { sources = typeof p.visitor_sources === 'string' ? JSON.parse(p.visitor_sources) : (p.visitor_sources || {}); } catch(e) {}
  return {
    page_name: p.page_name || p.name,
    views: p.views || 0,
    conversions: p.conversions || 0,
    revenue: p.revenue || 0,
    ctr: p.ctr || 0,
    sources
  };
}).sort((a,b) => (b.conversions||0) - (a.conversions||0));

// Best converting pages per platform source
const platformPageWins = {};
for (const page of pageAttribution) {
  for (const [src, count] of Object.entries(page.sources || {})) {
    if (!platformPageWins[src]) platformPageWins[src] = [];
    platformPageWins[src].push({ page: page.page_name, conversions: page.conversions, source_visits: count });
  }
}

return [{
  json: {
    by_platform: byPlatform,
    total_victories: victories.length,
    total_revenue: totalRevenue,
    avg_deal_revenue: avgRevenue,
    avg_days_to_convert: avgDaysToConvert,
    top_messages: topMessages,
    top_use_cases: topUseCases,
    page_attribution: pageAttribution.slice(0, 10),
    platform_page_wins: platformPageWins
  }
}];
`
        }
      },

      sbRespond('respond', 'Respond', [720, 400], '={{ JSON.stringify($json) }}')
    ],
    connections: {
      'Webhook':        { main: [[
        { node: 'Get Victories', type: 'main', index: 0 },
        { node: 'Get Pages',     type: 'main', index: 0 },
        { node: 'Get Ads',       type: 'main', index: 0 }
      ]] },
      'Get Victories':  { main: [[{ node: 'Build Attribution', type: 'main', index: 0 }]] },
      'Get Pages':      { main: [[{ node: 'Build Attribution', type: 'main', index: 0 }]] },
      'Get Ads':        { main: [[{ node: 'Build Attribution', type: 'main', index: 0 }]] },
      'Build Attribution': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
    }
  };
  return upsertWorkflow(wf);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Building Victory Vision Ads workflows...\n');

  const ids = {};
  ids['Ads-Get']               = await createAdsGet();
  ids['Ads-Optimizations']     = await createAdsOptimizations();
  ids['Ads-Apply-Opt']         = await createAdsApplyOpt();
  ids['Ads-Remove']            = await createAdsRemove();
  ids['Ads-Audience-Builder']  = await createAdsAudienceBuilder();
  ids['Ads-Create']            = await createAdsCreate();
  ids['Ads-Attribution']       = await createAdsAttribution();

  console.log('\n── Summary ────────────────────────────────────────');
  for (const [name, id] of Object.entries(ids)) {
    console.log(`  ${id ? '✓' : '✗'} ${name}: ${id || 'FAILED'}`);
  }
  console.log('\nWebhook paths (POST to n8n.cloud/webhook/<path>):');
  console.log('  ads/get');
  console.log('  ads/get-optimizations');
  console.log('  ads/apply-optimization');
  console.log('  ads/remove');
  console.log('  ads/build-audience');
  console.log('  ads/create');
  console.log('  ads/get-attribution');
}

main().catch(console.error);
