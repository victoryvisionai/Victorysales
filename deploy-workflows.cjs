// deploy-workflows.cjs — rebuild all data workflows using HTTP Request + Supabase RPC
// Pattern proven to work: webhook v1 (responseMode:lastNode) + HTTP Request (service key)
//   + Code node (no $fetch, just format input) + respondToWebhook v1 (allIncomingItems)
require('dotenv').config();
const https     = require('https');
const N8N_API   = process.env.N8N_API_KEY;
const N8N_BASE  = process.env.N8N_BASE_URL;
const SB_URL    = 'https://nyyvsdkumxvuwimmucdb.supabase.co';
const SB_KEY    = process.env.SUPABASE_SERVICE_KEY;
const SB_CRED   = 'Fys2RzaxZTqtBMmH';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + path);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname + url.search, method,
      headers: { 'X-N8N-API-KEY': N8N_API, 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function upsert(wfDef) {
  const list = await apiCall('GET', '/workflows?limit=250');
  for (const wf of (list.body.data || [])) {
    if (wf.name === wfDef.name) {
      await apiCall('DELETE', '/workflows/' + wf.id);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  const cr = await apiCall('POST', '/workflows', wfDef);
  if (cr.status > 201) { console.error('  ✗ create', wfDef.name, cr.status, JSON.stringify(cr.body).slice(0,200)); return null; }
  await new Promise(r => setTimeout(r, 500));
  const ac = await apiCall('POST', '/workflows/' + cr.body.id + '/activate');
  const ok = ac.status >= 200 && ac.status < 300;
  console.log(ok ? '  ✓' : '  ⚠ activate err', wfDef.name, cr.body.id);
  return cr.body.id;
}

const STD  = { executionOrder: 'v1' };
const CORS = [
  { name: 'Access-Control-Allow-Origin',  value: 'https://victoryvision.app' },
  { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
  { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Customer-ID' }
];

// ── Node builders ─────────────────────────────────────────────────────────────
function wh(id, path) {
  return {
    id: 'wh', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 1,
    position: [0,300], webhookId: id,
    parameters: { path, httpMethod: 'POST',
      responseMode: 'lastNode', responseData: 'allEntries',
      options: { responseHeaders: { entries: CORS } } }
  };
}

function httpGet(rpcFn) {
  return {
    id: 'hr', name: 'Fetch Data', type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [240,300],
    parameters: {
      method: 'GET',
      url:    SB_URL + '/rest/v1/rpc/' + rpcFn,
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'p_customer_id', value: '={{ $json.body.customer_id }}' }
      ]},
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey',        value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY },
        { name: 'Content-Type',  value: 'application/json' }
      ]},
      options: {}
    }
  };
}

function code(id, name, jsCode, pos) {
  return { id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
    parameters: { mode: 'runOnceForAllItems', jsCode } };
}

function respond(pos) {
  return { id: 'resp', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1,
    position: pos, parameters: { respondWith: 'allIncomingItems',
      options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: 'https://victoryvision.app' }] } } } };
}

// ── OAuth - Status ────────────────────────────────────────────────────────────
// Calls get_oauth_status() RPC → single JSON object {tokens:[...]} → respond
const oauthStatusWf = {
  name: 'OAuth - Status', settings: STD,
  nodes: [ wh('oauth-status','oauth/status'), httpGet('get_oauth_status'), respond([480,300]) ],
  connections: {
    'Webhook':    { main: [[{ node: 'Fetch Data', type: 'main', index: 0 }]] },
    'Fetch Data': { main: [[{ node: 'Respond',    type: 'main', index: 0 }]] }
  }
};

// ── Ads - Get ─────────────────────────────────────────────────────────────────
const adsGetCode = `
const d   = $input.first().json;
const ads = Array.isArray(d.ads)         ? d.ads         : [];
const vic = Array.isArray(d.victories)   ? d.victories   : [];
const pgs = Array.isArray(d.pages)       ? d.pages       : [];
const acc = Array.isArray(d.ad_accounts) ? d.ad_accounts : [];

function rollup(list) {
  return {
    spend:             list.reduce(function(s,a) { return s + (Number(a.spend)||0); }, 0),
    impressions:       list.reduce(function(s,a) { return s + (Number(a.impressions)||0); }, 0),
    clicks:            list.reduce(function(s,a) { return s + (Number(a.clicks)||0); }, 0),
    conversions:       list.reduce(function(s,a) { return s + (Number(a.conversions)||0); }, 0),
    meetings:          list.reduce(function(s,a) { return s + (Number(a.meetings_booked)||0); }, 0),
    newCustomers:      list.reduce(function(s,a) { return s + (Number(a.new_customers)||0); }, 0),
    conversionRevenue: list.reduce(function(s,a) { return s + (Number(a.conversion_revenue)||0); }, 0),
    count: list.length
  };
}

var platforms = ['google_ads','msft_ads','linkedin_ads','billboard'];
var byPlatform = {};
for (var i = 0; i < platforms.length; i++) {
  var p = platforms[i];
  byPlatform[p] = rollup(ads.filter(function(a) { return (a.platform||'linkedin_ads') === p; }));
}
var totals = rollup(ads);

var totalRevenue = vic.reduce(function(s,v) { return s + (Number(v.estimated_annual_revenue)||0); }, 0);
var avgRevenue   = vic.length ? Math.round(totalRevenue / vic.length) : 0;

function freq(arr) {
  var m = {};
  arr.forEach(function(x) { if(x) m[x] = (m[x]||0) + 1; });
  return Object.entries(m).sort(function(a,b) { return b[1]-a[1]; }).slice(0,5).map(function(kv) { return kv[0]; });
}
var msgs = [];
var ucs  = [];
vic.forEach(function(v) {
  (v.messages_that_landed||'').split(',').forEach(function(x) { x = x.trim(); if(x) msgs.push(x); });
  (v.use_cases_that_resonated||'').split(',').forEach(function(x) { x = x.trim(); if(x) ucs.push(x); });
});

var topPages = pgs
  .sort(function(a,b) { return (Number(b.conversions)||0) - (Number(a.conversions)||0); })
  .slice(0,5)
  .map(function(p) { return { id:p.id, name:p.page_name||p.name||'Page', views:p.views||0,
    conversions:p.conversions||0, revenue:p.revenue||0, ctr:p.ctr||0,
    visitor_sources:p.visitor_sources||'{}' }; });

var roi = totals.spend > 0 ? Math.round((totals.conversionRevenue - totals.spend) / totals.spend * 100) : 0;
var cpm = totals.meetings > 0 ? Math.round(totals.spend / totals.meetings) : 0;

return [{ json: {
  ads: ads,
  by_platform: byPlatform,
  totals: { spend: totals.spend, impressions: totals.impressions, clicks: totals.clicks,
    conversions: totals.conversions, meetings: totals.meetings, newCustomers: totals.newCustomers,
    conversionRevenue: totals.conversionRevenue, count: totals.count, roi: roi, cost_per_meeting: cpm },
  ad_accounts: acc,
  intelligence: { total_victories: vic.length, avg_deal_revenue: avgRevenue,
    winning_messages: freq(msgs), winning_use_cases: freq(ucs) },
  top_pages: topPages
}}];
`;

const adsGetWf = {
  name: 'Ads - Get', settings: STD,
  nodes: [ wh('ads-get','ads/get'), httpGet('get_ads_data'),
    code('build','Build Response', adsGetCode, [480,300]), respond([720,300]) ],
  connections: {
    'Webhook':        { main: [[{ node: 'Fetch Data',     type: 'main', index: 0 }]] },
    'Fetch Data':     { main: [[{ node: 'Build Response', type: 'main', index: 0 }]] },
    'Build Response': { main: [[{ node: 'Respond',        type: 'main', index: 0 }]] }
  }
};

// ── Ads - Attribution ─────────────────────────────────────────────────────────
const adsAttrCode = `
const d   = $input.first().json;
const vic = Array.isArray(d.victories) ? d.victories : [];
const pgs = Array.isArray(d.pages)     ? d.pages     : [];
const ads = Array.isArray(d.ads)       ? d.ads       : [];

var byPlatform = {};
ads.forEach(function(ad) {
  var p = ad.platform || 'linkedin_ads';
  if (!byPlatform[p]) byPlatform[p] = { spend:0, revenue:0, meetings:0, customers:0 };
  byPlatform[p].spend     += Number(ad.spend)              || 0;
  byPlatform[p].revenue   += Number(ad.conversion_revenue) || 0;
  byPlatform[p].meetings  += Number(ad.meetings_booked)    || 0;
  byPlatform[p].customers += Number(ad.new_customers)      || 0;
});

var totalRevenue = vic.reduce(function(s,v) { return s + (Number(v.estimated_annual_revenue)||0); }, 0);
var avgRevenue   = vic.length ? Math.round(totalRevenue / vic.length) : 0;
var avgDays      = vic.length ? Math.round(vic.reduce(function(s,v) { return s + (Number(v.days_to_convert)||0); }, 0) / vic.length) : null;

function freqField(field) {
  var m = {};
  vic.forEach(function(v) {
    (v[field]||'').split(',').map(function(x) { return x.trim(); }).filter(Boolean)
      .forEach(function(k) { m[k] = (m[k]||0) + 1; });
  });
  return Object.entries(m).sort(function(a,b) { return b[1]-a[1]; }).slice(0,5)
    .map(function(kv) { return { message: kv[0], wins: kv[1] }; });
}

var pageAttr = pgs.map(function(p) {
  var src = {};
  try { src = typeof p.visitor_sources === 'string' ? JSON.parse(p.visitor_sources) : (p.visitor_sources||{}); } catch(e) {}
  return { page_name: p.page_name||p.name, views: p.views||0, conversions: p.conversions||0,
    revenue: p.revenue||0, ctr: p.ctr||0, sources: src };
}).sort(function(a,b) { return (b.conversions||0) - (a.conversions||0); });

return [{ json: {
  by_platform: byPlatform,
  total_victories: vic.length, total_revenue: totalRevenue,
  avg_deal_revenue: avgRevenue, avg_days_to_convert: avgDays,
  top_messages:  freqField('messages_that_landed'),
  top_use_cases: freqField('use_cases_that_resonated').map(function(x) { return { use_case: x.message, wins: x.wins }; }),
  page_attribution: pageAttr.slice(0,10)
}}];
`;

const adsAttrWf = {
  name: 'Ads - Attribution', settings: STD,
  nodes: [ wh('ads-get-attribution','ads/get-attribution'), httpGet('get_ads_attribution_data'),
    code('build','Build Attribution', adsAttrCode, [480,300]), respond([720,300]) ],
  connections: {
    'Webhook':          { main: [[{ node: 'Fetch Data',       type: 'main', index: 0 }]] },
    'Fetch Data':       { main: [[{ node: 'Build Attribution', type: 'main', index: 0 }]] },
    'Build Attribution':{ main: [[{ node: 'Respond',          type: 'main', index: 0 }]] }
  }
};

// ── Ads - Optimizations ───────────────────────────────────────────────────────
const adsOptCode = `
const d   = $input.first().json;
const ads = Array.isArray(d.ads) ? d.ads : [];

var suggestions = [];
ads.forEach(function(ad) {
  var spend = Number(ad.spend) || 0;
  var cpm   = Number(ad.cost_per_meeting) || (ad.meetings_booked > 0 ? Math.round(spend / ad.meetings_booked) : null);
  if (ad.status === 'ACTIVE' && spend > 500 && (!ad.meetings_booked || ad.meetings_booked === 0)) {
    suggestions.push({ ad_id: ad.id, type: 'pause', reason: 'High spend with 0 meetings',
      platform: ad.platform, spend: spend });
  }
  if (ad.status === 'PAUSED' && ad.meetings_booked > 0 && cpm && cpm < 200) {
    suggestions.push({ ad_id: ad.id, type: 'activate', reason: 'Low CPM, previously converting',
      platform: ad.platform, cpm: cpm });
  }
});

return [{ json: { optimizations: suggestions, total_ads: ads.length } }];
`;

const adsOptWf = {
  name: 'Ads - Optimizations', settings: STD,
  nodes: [ wh('ads-get-optimizations','ads/get-optimizations'), httpGet('get_ads_data'),
    code('build','Build Optimizations', adsOptCode, [480,300]), respond([720,300]) ],
  connections: {
    'Webhook':             { main: [[{ node: 'Fetch Data',         type: 'main', index: 0 }]] },
    'Fetch Data':          { main: [[{ node: 'Build Optimizations', type: 'main', index: 0 }]] },
    'Build Optimizations': { main: [[{ node: 'Respond',            type: 'main', index: 0 }]] }
  }
};

// ── Ads - Audience Builder ────────────────────────────────────────────────────
// Triggers audience sync — just acknowledges for now
const adsAudienceWf = {
  name: 'Ads - Audience Builder', settings: STD,
  nodes: [
    wh('ads-build-audience','ads/build-audience'),
    code('ack','Acknowledge', `return [{ json: { ok: true, message: 'Audience build queued', customer_id: $input.first().json.body.customer_id } }]`, [240,300]),
    respond([480,300])
  ],
  connections: {
    'Webhook':     { main: [[{ node: 'Acknowledge', type: 'main', index: 0 }]] },
    'Acknowledge': { main: [[{ node: 'Respond',     type: 'main', index: 0 }]] }
  }
};

// ── User - Ad Tracking (save) ─────────────────────────────────────────────────
// Uses HTTP Request with service key (same pattern as reads) — bypasses RLS/auth issues
const adTrackingBuildCode = `
const b = $input.first().json.body || {};
return [{ json: {
  customer_id:            b.customer_id            || '',
  google_pixel:           b.google_pixel           || '',
  google_ads_customer_id: b.google_ads_customer_id || '',
  msft_pixel:             b.msft_pixel             || '',
  msft_ads_account_id:    b.msft_ads_account_id    || '',
  linkedin_pixel:         b.linkedin_pixel         || '',
  li_ad_account:          b.li_ad_account          || ''
}}];
`;

const adTrackingWf = {
  name: 'User - Ad Tracking', settings: STD,
  nodes: [
    wh('user-ad-tracking','user/ad-tracking'),
    code('build','Build Body', adTrackingBuildCode, [240,300]),
    { id: 'hr', name: 'Upsert Settings', type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [480,300],
      parameters: {
        method: 'POST',
        url: SB_URL + '/rest/v1/user_ad_settings',
        sendHeaders: true,
        headerParameters: { parameters: [
          { name: 'apikey',        value: SB_KEY },
          { name: 'Authorization', value: 'Bearer ' + SB_KEY },
          { name: 'Content-Type',  value: 'application/json' },
          { name: 'Prefer',        value: 'resolution=merge-duplicates' }
        ]},
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={{ JSON.stringify($json) }}',
        options: {}
      }
    },
    code('ack','Acknowledge', `return [{ json: { ok: true } }]`, [720,300]),
    respond([960,300])
  ],
  connections: {
    'Webhook':          { main: [[{ node: 'Build Body',      type: 'main', index: 0 }]] },
    'Build Body':       { main: [[{ node: 'Upsert Settings', type: 'main', index: 0 }]] },
    'Upsert Settings':  { main: [[{ node: 'Acknowledge',     type: 'main', index: 0 }]] },
    'Acknowledge':      { main: [[{ node: 'Respond',         type: 'main', index: 0 }]] }
  }
};

async function main() {
  if (!SB_KEY) { console.error('SUPABASE_SERVICE_KEY missing'); process.exit(1); }
  for (const wfDef of [oauthStatusWf, adsGetWf, adsAttrWf, adsOptWf, adsAudienceWf, adTrackingWf]) {
    await upsert(wfDef);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('\nAll done. Run SQL in Supabase first if not already done (ads-sql-functions.sql).');
}
main().catch(console.error);
