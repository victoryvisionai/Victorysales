// create-plans-generate.js
// Creates "Plans - Generate" n8n workflow
// Analyzes ALL data tables, generates AI plan, saves insights to user fields

require('dotenv').config();
const https = require('https');

const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const SUPABASE_CRED_ID = 'Fys2RzaxZTqtBMmH';
const ANTHROPIC_CRED_ID = 'mnhRZGbjCtHrSJVY';
const SUPABASE_URL = 'https://nyyvsdkumxvuwimmucdb.supabase.co';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method, headers: {
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

async function deleteExisting(name) {
  const res = await apiCall('GET', '/workflows?limit=250');
  if (res.body.data) {
    for (const wf of res.body.data) {
      if (wf.name === name) {
        await apiCall('DELETE', `/workflows/${wf.id}`);
        console.log(`  Deleted existing: ${wf.id}`);
      }
    }
  }
}

async function main() {
  console.log('Building Plans - Generate workflow...');

  await deleteExisting('Plans - Generate');

  const workflow = {
    name: 'Plans - Generate',
    nodes: [

      // ─── TRIGGER ───────────────────────────────────────────────────────────
      {
        id: 'webhook-trigger',
        name: 'Webhook - Generate Plan',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 300],
        webhookId: 'plans-generate',
        parameters: {
          path: 'plans/generate',
          httpMethod: 'POST',
          responseMode: 'responseNode',
          options: {}
        }
      },

      // ─── GET USER ──────────────────────────────────────────────────────────
      {
        id: 'get-user',
        name: 'Get User',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [220, 300],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/users`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: '*' },
              { name: 'id', value: '=eq.={{ $json.body.user_id }}' },
              { name: 'limit', value: '1' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET VICTORIES ──────────────────────────────────────────────────────
      {
        id: 'get-victories',
        name: 'Get Victories',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 100],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/victories`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,title,description,value,created_at,deal_type,industry,persona' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '20' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET CALLS ─────────────────────────────────────────────────────────
      {
        id: 'get-calls',
        name: 'Get Calls',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 220],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/calls`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,contact_email,outcome,duration,notes,sentiment,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '30' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET SMS ───────────────────────────────────────────────────────────
      {
        id: 'get-sms',
        name: 'Get SMS',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 340],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/sms`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,contact_phone,direction,message,status,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '30' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET EMAILS ────────────────────────────────────────────────────────
      {
        id: 'get-emails',
        name: 'Get Emails',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 460],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/emails`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,to_email,subject,body,direction,opened,replied,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '30' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET CONTACTS ──────────────────────────────────────────────────────
      {
        id: 'get-contacts',
        name: 'Get Contacts',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 580],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/contacts`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,name,email,phone,company,title,stage,score,tags,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'score.desc' },
              { name: 'limit', value: '30' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET SOCIAL ────────────────────────────────────────────────────────
      {
        id: 'get-social',
        name: 'Get Social',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 700],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/social`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,platform,content,likes,comments,shares,status,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '20' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET CAMPAIGNS ─────────────────────────────────────────────────────
      {
        id: 'get-campaigns',
        name: 'Get Campaigns',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 820],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/campaigns`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,name,type,status,sent,opened,clicked,converted,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '10' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET PAGES ─────────────────────────────────────────────────────────
      {
        id: 'get-pages',
        name: 'Get Pages',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 940],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/pages`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,title,slug,views,conversions,status,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'views.desc' },
              { name: 'limit', value: '10' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET MEETINGS ──────────────────────────────────────────────────────
      {
        id: 'get-meetings',
        name: 'Get Meetings',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 1060],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/meetings`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,contact_email,status,outcome,duration,notes,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '20' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── GET PAST PLANS ────────────────────────────────────────────────────
      {
        id: 'get-past-plans',
        name: 'Get Past Plans',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [440, 1180],
        parameters: {
          method: 'GET',
          url: `=${SUPABASE_URL}/rest/v1/plans`,
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: 'select', value: 'id,title,content,status,executed_at,created_at' },
              { name: 'user_id', value: '=eq.={{ $("Webhook - Generate Plan").item.json.body.user_id }}' },
              { name: 'order', value: 'created_at.desc' },
              { name: 'limit', value: '5' }
            ]
          },
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' }
            ]
          }
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── COMPILE DATA ──────────────────────────────────────────────────────
      {
        id: 'compile-data',
        name: 'Compile Data',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [700, 640],
        parameters: {
          jsCode: `
// Safely collect all upstream data
function safeGet(nodeName) {
  try { return $node[nodeName].json || {}; } catch { return {}; }
}
function safeGetAll(nodeName) {
  try {
    const items = $node[nodeName].all();
    return items.map(i => i.json);
  } catch { return []; }
}

const userId = $("Webhook - Generate Plan").item.json.body.user_id;
const user = safeGet('Get User');

// All data tables
const victories  = safeGetAll('Get Victories');
const calls      = safeGetAll('Get Calls');
const sms        = safeGetAll('Get SMS');
const emails     = safeGetAll('Get Emails');
const contacts   = safeGetAll('Get Contacts');
const social     = safeGetAll('Get Social');
const campaigns  = safeGetAll('Get Campaigns');
const pages      = safeGetAll('Get Pages');
const meetings   = safeGetAll('Get Meetings');
const pastPlans  = safeGetAll('Get Past Plans');

// Compute stats
const winRate = victories.length;
const callOutcomes = calls.reduce((acc, c) => {
  acc[c.outcome || 'unknown'] = (acc[c.outcome || 'unknown'] || 0) + 1;
  return acc;
}, {});
const emailOpenRate = emails.length > 0
  ? Math.round((emails.filter(e => e.opened).length / emails.length) * 100)
  : 0;
const emailReplyRate = emails.length > 0
  ? Math.round((emails.filter(e => e.replied).length / emails.length) * 100)
  : 0;
const topContacts = contacts.filter(c => c.score > 50).slice(0, 10);
const socialEngagement = social.reduce((sum, s) => sum + (s.likes || 0) + (s.comments || 0) + (s.shares || 0), 0);
const campaignConversionRate = campaigns.length > 0
  ? campaigns.reduce((sum, c) => sum + (c.converted || 0), 0) / campaigns.reduce((sum, c) => sum + (c.sent || 1), 0)
  : 0;

return [{
  json: {
    userId,
    user,
    stats: {
      victories: winRate,
      totalCalls: calls.length,
      callOutcomes,
      totalSMS: sms.length,
      totalEmails: emails.length,
      emailOpenRate,
      emailReplyRate,
      totalContacts: contacts.length,
      hotContacts: topContacts.length,
      totalSocial: social.length,
      socialEngagement,
      totalCampaigns: campaigns.length,
      campaignConversionRate: Math.round(campaignConversionRate * 100),
      totalPages: pages.length,
      totalMeetings: meetings.length,
      pastPlansCount: pastPlans.length
    },
    data: {
      victories:  victories.slice(0, 10),
      calls:      calls.slice(0, 15),
      sms:        sms.slice(0, 15),
      emails:     emails.slice(0, 15),
      contacts:   topContacts,
      social:     social.slice(0, 10),
      campaigns,
      pages,
      meetings:   meetings.slice(0, 10),
      pastPlans
    }
  }
}];
`
        }
      },

      // ─── AI PLAN GENERATOR ─────────────────────────────────────────────────
      {
        id: 'ai-plan',
        name: 'Victory Planner AI',
        type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
        typeVersion: 1.3,
        position: [920, 640],
        parameters: {
          model: 'claude-sonnet-4-5',
          options: { maxTokensToSample: 4096 }
        },
        credentials: { anthropicApi: { id: ANTHROPIC_CRED_ID, name: 'Anthropic account' } }
      },

      // ─── BUILD PROMPT ──────────────────────────────────────────────────────
      {
        id: 'build-prompt',
        name: 'Build Prompt',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [920, 400],
        parameters: {
          jsCode: `
const d = $json;
const s = d.stats;
const data = d.data;

const prompt = \`You are Victory Vision's AI Sales Planner. Analyze this user's complete sales data and generate a comprehensive, actionable plan.

## USER PERFORMANCE SUMMARY
- Victories (closed deals): \${s.victories}
- Total Calls: \${s.totalCalls} | Outcomes: \${JSON.stringify(s.callOutcomes)}
- Total SMS: \${s.totalSMS}
- Emails: \${s.totalEmails} | Open Rate: \${s.emailOpenRate}% | Reply Rate: \${s.emailReplyRate}%
- Contacts: \${s.totalContacts} total, \${s.hotContacts} hot (score > 50)
- Social Posts: \${s.totalSocial} | Total Engagement: \${s.socialEngagement}
- Campaigns: \${s.totalCampaigns} | Avg Conversion: \${s.campaignConversionRate}%
- Landing Pages: \${s.totalPages}
- Meetings: \${s.totalMeetings}

## RECENT VICTORIES (wins to replicate)
\${JSON.stringify(data.victories.map(v => ({
  title: v.title, value: v.value, type: v.deal_type,
  industry: v.industry, persona: v.persona
})), null, 2)}

## RECENT CALLS
\${JSON.stringify(data.calls.map(c => ({
  outcome: c.outcome, sentiment: c.sentiment, duration: c.duration,
  notes: c.notes?.substring(0, 200)
})), null, 2)}

## EMAIL PERFORMANCE
\${JSON.stringify(data.emails.map(e => ({
  subject: e.subject, opened: e.opened, replied: e.replied,
  direction: e.direction
})), null, 2)}

## HOT CONTACTS (prioritize these)
\${JSON.stringify(data.contacts.map(c => ({
  name: c.name, company: c.company, title: c.title,
  stage: c.stage, score: c.score, tags: c.tags
})), null, 2)}

## SOCIAL CONTENT PERFORMANCE
\${JSON.stringify(data.social.map(s => ({
  platform: s.platform, status: s.status,
  engagement: (s.likes||0)+(s.comments||0)+(s.shares||0),
  content: s.content?.substring(0, 150)
})), null, 2)}

## CAMPAIGN RESULTS
\${JSON.stringify(data.campaigns, null, 2)}

## LANDING PAGES
\${JSON.stringify(data.pages, null, 2)}

## PAST PLANS (what was tried before)
\${JSON.stringify(data.pastPlans.map(p => ({
  title: p.title, status: p.status,
  content: p.content?.substring(0, 300)
})), null, 2)}

## AVAILABLE ACTIONS (webhooks you can recommend)
Victory Vision has these executable actions:
- POST /victories/create — Log a new victory/win
- POST /calls/create — Schedule or log a call
- POST /sms/send — Send SMS to a contact
- POST /emails/send — Send email to a contact
- POST /emails/draft — AI-draft an email
- POST /social/create — Create social post
- POST /social/plan — Plan social content calendar
- POST /campaigns/create — Launch email campaign
- POST /pages/create — Build landing page
- POST /meetings/schedule — Schedule a meeting
- POST /contacts/create — Add new contact
- POST /contacts/update — Update contact stage/score

## YOUR TASK
Generate a JSON response with this exact structure:

{
  "plan_title": "string — compelling title for this week's plan",
  "plan_summary": "string — 2-3 sentence executive summary of the strategy",
  "plan_content": "string — detailed markdown plan with sections: ## Top Priority, ## This Week's Actions (numbered list), ## Why This Will Work",
  "actions": [
    {
      "priority": 1,
      "title": "string",
      "description": "string",
      "webhook": "/path/to/action",
      "payload": {},
      "impact": "High|Medium|Low",
      "effort": "Quick|Medium|Heavy"
    }
  ],
  "insights": {
    "email_notes": "string — what email subject lines/approaches work best, open/reply patterns",
    "social_notes": "string — what social content resonates, best platforms, optimal posting times",
    "call_insights": "string — call patterns, best outcomes, what works in calls",
    "sms_insights": "string — SMS response patterns, best message formats",
    "campaign_insights": "string — campaign performance patterns, what converts",
    "top_personas": "string — describe the 2-3 best buyer personas based on victories and hot contacts",
    "winning_messages": "string — the specific messages, subjects, or pitches that have driven results",
    "objections": "string — common objections found in calls/emails and how to handle them",
    "best_channels": "string — rank channels by effectiveness: email, SMS, social, calls, campaigns",
    "pipeline_insights": "string — pipeline health, which contacts to prioritize, predicted closes"
  }
}

Be specific and data-driven. Reference actual numbers and patterns from the data above. Prioritize the highest-impact actions first.\`;

return [{ json: { ...d, prompt } }];
`
        }
      },

      // ─── CALL AI ───────────────────────────────────────────────────────────
      {
        id: 'call-ai',
        name: 'Call AI',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1140, 400],
        parameters: {
          method: 'POST',
          url: 'https://api.anthropic.com/v1/messages',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'x-api-key', value: '={{ $env.ANTHROPIC_API_KEY }}' },
              { name: 'anthropic-version', value: '2023-06-01' },
              { name: 'content-type', value: 'application/json' }
            ]
          },
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'model', value: 'claude-sonnet-4-5' },
              { name: 'max_tokens', value: '4096' },
              { name: 'messages', value: '={{ JSON.stringify([{ "role": "user", "content": $json.prompt }]) }}' }
            ]
          }
        }
      },

      // ─── PARSE AI RESPONSE ─────────────────────────────────────────────────
      {
        id: 'parse-response',
        name: 'Parse AI Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1360, 400],
        parameters: {
          jsCode: `
const aiResponse = $json;
const compiledData = $("Build Prompt").item.json;

let planData = {};
let rawText = '';

try {
  // Extract text from Anthropic response
  rawText = aiResponse.content?.[0]?.text || '';

  // Find JSON block
  const jsonMatch = rawText.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    planData = JSON.parse(jsonMatch[0]);
  } else {
    throw new Error('No JSON found in response');
  }
} catch (e) {
  // Fallback structure
  planData = {
    plan_title: 'Victory Vision Action Plan',
    plan_summary: rawText.substring(0, 300) || 'AI plan generated',
    plan_content: rawText || 'See insights for details.',
    actions: [],
    insights: {
      email_notes: 'Review email performance for patterns.',
      social_notes: 'Continue posting on best-performing platforms.',
      call_insights: 'Focus on calls with positive outcomes.',
      sms_insights: 'Keep SMS messages concise and action-oriented.',
      campaign_insights: 'Monitor conversion rates closely.',
      top_personas: 'Focus on contacts with scores above 50.',
      winning_messages: 'Personalize outreach based on past victories.',
      objections: 'Address pricing and timing concerns proactively.',
      best_channels: 'Email, then calls, then social.',
      pipeline_insights: 'Prioritize hot contacts for immediate follow-up.'
    }
  };
}

return [{
  json: {
    userId: compiledData.userId,
    planData,
    stats: compiledData.stats,
    rawText
  }
}];
`
        }
      },

      // ─── SAVE PLAN ─────────────────────────────────────────────────────────
      {
        id: 'save-plan',
        name: 'Save Plan',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1580, 300],
        parameters: {
          method: 'POST',
          url: `=${SUPABASE_URL}/rest/v1/plans`,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Prefer', value: 'return=representation' }
            ]
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={
  "user_id": "{{ $json.userId }}",
  "title": "{{ $json.planData.plan_title }}",
  "summary": "{{ $json.planData.plan_summary }}",
  "content": {{ JSON.stringify($json.planData.plan_content) }},
  "actions": {{ JSON.stringify($json.planData.actions || []) }},
  "status": "active",
  "created_at": "{{ new Date().toISOString() }}"
}`
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── SAVE USER INSIGHTS ────────────────────────────────────────────────
      {
        id: 'save-insights',
        name: 'Save User Insights',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1580, 500],
        parameters: {
          method: 'PATCH',
          url: `=${SUPABASE_URL}/rest/v1/users?id=eq.={{ $json.userId }}`,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Authorization', value: 'Bearer {{ $env.SUPABASE_SERVICE_KEY }}' },
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Prefer', value: 'return=minimal' }
            ]
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={
  "email_notes":       {{ JSON.stringify($json.planData.insights?.email_notes     || '') }},
  "social_notes":      {{ JSON.stringify($json.planData.insights?.social_notes    || '') }},
  "call_insights":     {{ JSON.stringify($json.planData.insights?.call_insights   || '') }},
  "sms_insights":      {{ JSON.stringify($json.planData.insights?.sms_insights    || '') }},
  "campaign_insights": {{ JSON.stringify($json.planData.insights?.campaign_insights || '') }},
  "top_personas":      {{ JSON.stringify($json.planData.insights?.top_personas    || '') }},
  "winning_messages":  {{ JSON.stringify($json.planData.insights?.winning_messages || '') }},
  "objections":        {{ JSON.stringify($json.planData.insights?.objections      || '') }},
  "best_channels":     {{ JSON.stringify($json.planData.insights?.best_channels   || '') }},
  "pipeline_insights": {{ JSON.stringify($json.planData.insights?.pipeline_insights || '') }},
  "plan_updated_at":   "{{ new Date().toISOString() }}"
}`
        },
        credentials: { supabaseApi: { id: SUPABASE_CRED_ID, name: 'Supabase account' } }
      },

      // ─── RESPOND ───────────────────────────────────────────────────────────
      {
        id: 'respond',
        name: 'Respond',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [1800, 400],
        parameters: {
          respondWith: 'json',
          responseBody: `={
  "success": true,
  "plan": {
    "title": "{{ $("Parse AI Response").item.json.planData.plan_title }}",
    "summary": "{{ $("Parse AI Response").item.json.planData.plan_summary }}",
    "content": {{ JSON.stringify($("Parse AI Response").item.json.planData.plan_content || '') }},
    "actions": {{ JSON.stringify($("Parse AI Response").item.json.planData.actions || []) }},
    "insights": {{ JSON.stringify($("Parse AI Response").item.json.planData.insights || {}) }}
  }
}`,
          options: {}
        }
      }

    ],

    connections: {
      // Webhook → Get User (and fan out to all data nodes)
      'Webhook - Generate Plan': {
        main: [[
          { node: 'Get User', type: 'main', index: 0 },
          { node: 'Get Victories', type: 'main', index: 0 },
          { node: 'Get Calls', type: 'main', index: 0 },
          { node: 'Get SMS', type: 'main', index: 0 },
          { node: 'Get Emails', type: 'main', index: 0 },
          { node: 'Get Contacts', type: 'main', index: 0 },
          { node: 'Get Social', type: 'main', index: 0 },
          { node: 'Get Campaigns', type: 'main', index: 0 },
          { node: 'Get Pages', type: 'main', index: 0 },
          { node: 'Get Meetings', type: 'main', index: 0 },
          { node: 'Get Past Plans', type: 'main', index: 0 }
        ]]
      },
      // All data nodes → Compile Data
      'Get User':      { main: [[{ node: 'Compile Data', type: 'main', index: 0 }]] },
      'Get Victories': { main: [[{ node: 'Compile Data', type: 'main', index: 1 }]] },
      'Get Calls':     { main: [[{ node: 'Compile Data', type: 'main', index: 2 }]] },
      'Get SMS':       { main: [[{ node: 'Compile Data', type: 'main', index: 3 }]] },
      'Get Emails':    { main: [[{ node: 'Compile Data', type: 'main', index: 4 }]] },
      'Get Contacts':  { main: [[{ node: 'Compile Data', type: 'main', index: 5 }]] },
      'Get Social':    { main: [[{ node: 'Compile Data', type: 'main', index: 6 }]] },
      'Get Campaigns': { main: [[{ node: 'Compile Data', type: 'main', index: 7 }]] },
      'Get Pages':     { main: [[{ node: 'Compile Data', type: 'main', index: 8 }]] },
      'Get Meetings':  { main: [[{ node: 'Compile Data', type: 'main', index: 9 }]] },
      'Get Past Plans':{ main: [[{ node: 'Compile Data', type: 'main', index: 10 }]] },
      // Compile → Build Prompt → Call AI → Parse → Save Plan + Save Insights → Respond
      'Compile Data':       { main: [[{ node: 'Build Prompt', type: 'main', index: 0 }]] },
      'Build Prompt':       { main: [[{ node: 'Call AI', type: 'main', index: 0 }]] },
      'Call AI':            { main: [[{ node: 'Parse AI Response', type: 'main', index: 0 }]] },
      'Parse AI Response':  { main: [[
        { node: 'Save Plan', type: 'main', index: 0 },
        { node: 'Save User Insights', type: 'main', index: 0 }
      ]]},
      'Save Plan':          { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
      'Save User Insights': { main: [[{ node: 'Respond', type: 'main', index: 1 }]] }
    },

    settings: {
      executionOrder: 'v1',
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner',
      saveDataSuccessExecution: 'all',
      saveDataErrorExecution: 'all'
    }
  };

  // Create workflow
  console.log('  Creating workflow...');
  const createRes = await apiCall('POST', '/workflows', workflow);

  if (createRes.status !== 200 && createRes.status !== 201) {
    console.error('  Failed to create:', JSON.stringify(createRes.body, null, 2));
    process.exit(1);
  }

  const wfId = createRes.body.id;
  console.log(`  Created: id=${wfId}`);

  // Activate
  await new Promise(r => setTimeout(r, 1000));
  const activateRes = await apiCall('POST', `/workflows/${wfId}/activate`);

  if (activateRes.status === 200 || activateRes.status === 201) {
    console.log(`\n✅  "Plans - Generate" created and activated`);
    console.log(`   id=${wfId}`);
    console.log(`   Webhook: POST https://victoryvision.app.n8n.cloud/webhook/plans/generate`);
    console.log(`   Fetches: victories, calls, SMS, emails, contacts, social, campaigns, pages, meetings, past plans`);
    console.log(`   Saves: plans table + 10 insight fields on users table`);
  } else {
    console.log(`  Activation response: ${activateRes.status}`);
    console.log(`  Body: ${JSON.stringify(activateRes.body)}`);
    console.log(`  Workflow created (id=${wfId}) but may need manual activation`);
  }
}

main().catch(console.error);
