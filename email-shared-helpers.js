// email-shared-helpers.js
// Strings embedded into n8n code nodes across every email sequence workflow.
// Change ONE place → redeploy every workflow script that imports this.
//
// UNIFIED SEQUENCE ENGINE DESIGN (confirmed 2026-04-20):
//   Every email sequence (Nurture, Lead Magnet, Meeting Request, Newsletter,
//   Follow-up, and user-generated custom campaigns) is the SAME loop:
//
//     1. Decide next fire time  → SEND_TIME_DECISION
//     2. Wait Until that time   (n8n Wait node, "Wait Until" mode, $json._due_at)
//     3. Guard: stop if done    → LOOP_GUARD
//          - contact.last_responded > last_sent_at_of_this_sequence   → stop
//          - newsletter campaign AND contact.newsletter = true         → stop
//          - sequence_index >= total_emails                            → stop
//     4. Fetch fresh user + contact (Supabase GET by id)
//     5. Compose (Sonnet; reads the fresh CONTEXT block)
//     6. Capitalize              → CAPITALIZATION_FIX
//     7. Mailgun send
//     8. Log touchpoint row into existing `email` table (no new columns)
//     9. Increment sequence_index and loop back to step 1
//
//   total_emails + days_between change per sequence; everything else is identical.
//   No new DB columns. No cron/queue. Workflow execution holds state via Wait nodes.
//
// Exports:
//   SEND_TIME_DECISION   — code node JS that reads aiChooseTime boolean + days_between
//                          and writes _due_at for Wait / scheduled_at.
//   CAPITALIZATION_FIX   — code node JS that normalizes casing on subject + body_text
//                          (subject sentence-case; fixes lowercase-only paragraphs).
//   CONTACT_CONTEXT_SELECT — Supabase ?select= string that pulls every field the
//                            prompt templates reference, including contacts.type.
//   USER_CONTEXT_SELECT   — same for users.
//   COMPOSE_SYSTEM_BASE   — shared anti-AI / quality rules pinned to every outbound
//                            email compose prompt. Sequence-specific prompts append
//                            their arc/mission on top.
//   CONTEXT_BLOCK_CODE    — code node JS that receives a loaded user row + contact
//                            row and emits a compact JSON "CONTEXT" block for the LLM.

module.exports = {

// ────────────────────────────────────────────────────────────────────────────
SEND_TIME_DECISION: `
// Runs at the moment we need to stamp _due_at on an outbound email.
// Inputs available:
//   $json.ai_choose_time   — boolean from the webhook body (or row in pending_sends)
//   $json.user_requested_at — user-picked ISO datetime (single timestamp). Required when
//                              ai_choose_time is false AND this is the first email.
//   $json.days_between      — integer; spacing for subsequent emails in the sequence.
//   $json.sequence_index    — 0 for first email, 1..N-1 for later emails.
//   $json.prior_sent_at     — ISO timestamp of the previous email in this sequence (if any).
// Output:
//   _due_at (ISO string), _mode ('user' | 'ai_next_slot' | 'ai_spaced_slot')

function nextTuWedThuSlot(fromDate) {
  // Best slots: Tue/Wed/Thu at 10:00 or 13:30 America/New_York.
  // We compute candidates in UTC-offset terms; EDT = UTC-4 (Mar-Nov), EST = UTC-5 (Nov-Mar).
  // For simplicity: assume EDT/EST split by month. Not perfect on DST boundary days.
  const m = fromDate.getUTCMonth() + 1; // 1-12
  const isDST = (m >= 3 && m <= 10) || (m === 3 && fromDate.getUTCDate() >= 10) || (m === 11 && fromDate.getUTCDate() < 3);
  const etOffsetHours = isDST ? 4 : 5; // hours to ADD to local ET to get UTC
  const slots = [ { h: 10, m: 0 }, { h: 13, m: 30 } ];
  for (let addDays = 0; addDays < 14; addDays++) {
    const cand = new Date(fromDate.getTime() + addDays * 86400000);
    const dow = cand.getUTCDay(); // 0=Sun..6=Sat
    if (dow < 2 || dow > 4) continue; // want Tue(2)/Wed(3)/Thu(4)
    for (const s of slots) {
      const dueUtc = new Date(Date.UTC(cand.getUTCFullYear(), cand.getUTCMonth(), cand.getUTCDate(), s.h + etOffsetHours, s.m, 0));
      if (dueUtc.getTime() > fromDate.getTime() + 15 * 60000) return dueUtc; // must be at least 15 min in future
    }
  }
  return new Date(fromDate.getTime() + 86400000); // should never hit, fallback 24h
}

const now = new Date();
const aiPick = $json.ai_choose_time === true || $json.ai_choose_time === 'true';
const seqIdx = Number($json.sequence_index || 0);
const daysBetween = Number($json.days_between || 0);
const priorSent = $json.prior_sent_at ? new Date($json.prior_sent_at) : null;

let dueAt = null;
let mode = '';

if (seqIdx === 0) {
  // First email
  if (!aiPick && $json.user_requested_at) {
    dueAt = new Date($json.user_requested_at);
    mode = 'user';
  } else {
    dueAt = nextTuWedThuSlot(now);
    mode = 'ai_next_slot';
  }
} else {
  // Subsequent email — respect days_between from prior send, then slide to nearest Tu/W/Th slot
  const from = priorSent ? new Date(priorSent.getTime() + daysBetween * 86400000) : now;
  dueAt = nextTuWedThuSlot(from < now ? now : from);
  mode = 'ai_spaced_slot';
}

return [{ json: Object.assign({}, $json, { _due_at: dueAt.toISOString(), _mode: mode }) }];
`,

// ────────────────────────────────────────────────────────────────────────────
// CAMPAIGNS_APPEND — PATCH contacts.campaigns with "<name> @ <ISO>" (append, not replace).
// Wire as a code node producing _patch_url + _patch_body, then HTTP PATCH node reads them.
// Inputs on $json:
//   contact_id   — the contact to update
//   campaign_tag — what to append (e.g. "Lead Magnet: 7-Day Playbook" or "Template: Opening Ask")
// Upstream 'Fetch Contact Live' gives us the existing campaigns string so we append, not replace.
CAMPAIGNS_APPEND: `
const SB_URL = 'https://nyyvsdkumxvuwimmucdb.supabase.co';
const live = $('Fetch Contact Live').first()?.json || {};
const row = Array.isArray(live) ? live[0] : live;
if (!row || !row.id) return [{ json: Object.assign({}, $json, { _skip_campaign_append: true }) }];
let existing = (row.campaigns || '').toString().trim();
// Treat sentinel values as empty so the first real entry isn't prefixed with "none".
if (/^(none|null|-|n\\/a)$/i.test(existing)) existing = '';
const tag = ($json.campaign_tag || $json.campaign || '').toString().slice(0, 120);
if (!tag) return [{ json: Object.assign({}, $json, { _skip_campaign_append: true }) }];
const entry = tag + ' @ ' + new Date().toISOString();
const appended = existing ? (existing + ', ' + entry) : entry;
return [{ json: Object.assign({}, $json, {
  _campaign_patch_url: SB_URL + '/rest/v1/contacts?id=eq.' + row.id,
  _campaign_patch_body: JSON.stringify({ campaigns: appended })
}) }];
`,

// ────────────────────────────────────────────────────────────────────────────
// JOURNEY_APPEND — PATCH contacts.customer_journey with a dated entry for this email.
// Format: "\\n— YYYY-MM-DD: Email sent via <campaign> — <subject>\\n  • <bullet1>\\n  • <bullet2>"
// Inputs on $json:
//   campaign          — campaign name (e.g. 'leadmagnet')
//   subject           — email subject line that just went out
//   _summary_bullets  — array of 1-2 short strings describing the email (LLM-generated)
// Upstream Fetch Contact Live gives the current customer_journey to append to.
JOURNEY_APPEND: `
const SB_URL = 'https://nyyvsdkumxvuwimmucdb.supabase.co';
const live = $('Fetch Contact Live').first()?.json || {};
const row = Array.isArray(live) ? live[0] : live;
if (!row || !row.id) return [{ json: Object.assign({}, $json, { _skip_journey_append: true }) }];
const prior = (row.customer_journey || '').toString();
const d = new Date();
const ymd = d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
const bullets = Array.isArray($json._summary_bullets) ? $json._summary_bullets.slice(0,2).filter(Boolean) : [];
const campaign = ($json.campaign || 'outbound').toString();
const subject  = ($json.subject  || '(no subject)').toString().slice(0, 140);
const bulletLines = bullets.map(b => '  • ' + String(b).slice(0, 200)).join('\\n');
const entry = '\\n— ' + ymd + ': Email sent via ' + campaign + ' — "' + subject + '"' + (bulletLines ? '\\n' + bulletLines : '');
const appended = prior + entry;
return [{ json: Object.assign({}, $json, {
  _journey_patch_url:  SB_URL + '/rest/v1/contacts?id=eq.' + row.id,
  _journey_patch_body: JSON.stringify({ customer_journey: appended, last_emailed_date: d.toISOString(), number_emails_sent: (Number(row.number_emails_sent)||0) + 1 })
}) }];
`,

// ────────────────────────────────────────────────────────────────────────────
LOOP_GUARD: `
// Runs right after Wait Until fires. Checks stop conditions; emits _stop=true to
// short-circuit the rest of the loop body so no email is sent.
// Inputs on $json:
//   sequence_index     — 0-based slot we're about to send
//   total_emails       — hard cap
//   campaign           — 'nurture' | 'leadmagnet' | 'meeting' | 'newsletter' | 'followup' | 'user-generated' | custom
//   contact_id         — to look up the LIVE contact row
//   _sequence_started_at — ISO timestamp of when this whole sequence was enrolled
// Available from upstream 'Fetch Contact Live' HTTP node:
//   the LIVE contact row (with last_responded, newsletter, etc.)

const live = $('Fetch Contact Live').first()?.json || {};
const row  = Array.isArray(live) ? live[0] : live;
const seqStarted = $json._sequence_started_at ? new Date($json._sequence_started_at) : null;
const seqIdx  = Number($json.sequence_index || 0);
const total   = Number($json.total_emails || 1);
const campaign = String($json.campaign || '').toLowerCase();

const reasons = [];
if (!row || !row.id) reasons.push('contact_missing');
if (seqIdx >= total) reasons.push('sequence_complete');

// Response since sequence started → stop
if (row && row.last_responded && seqStarted && new Date(row.last_responded) > seqStarted) {
  reasons.push('contact_responded');
}

// Newsletter sign-up → stop (applies to newsletter campaign only)
if (campaign === 'newsletter' && row && (row.newsletter === true || row.newsletter === 'true')) {
  reasons.push('already_subscribed');
}

return [{ json: Object.assign({}, $json, {
  _stop: reasons.length > 0,
  _stop_reasons: reasons,
  _live_contact: row || null
}) }];
`,

// ────────────────────────────────────────────────────────────────────────────
CAPITALIZATION_FIX: `
// Cleans common LLM casing glitches on a drafted email before queue/send.
// Inputs: $json.subject, $json.body_text, $json.body_html (strings)
// Outputs: mutated subject / body_text / body_html with:
//   - Subject: capitalize first letter of each sentence, don't touch ALL-CAPS acronyms.
//   - body_text: capitalize first letter of each sentence. Preserve proper nouns / acronyms.
//   - body_html: apply same rule to text nodes only; leave tags untouched.

function titleishSubject(s) {
  if (!s) return s;
  s = String(s).trim();
  // If entire subject is lowercase (LLM slop), sentence-case it.
  if (s === s.toLowerCase()) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Ensure first character is uppercase.
  if (s.length) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

function sentenceCase(text) {
  if (!text) return text;
  // Capitalize first letter after period/question/exclamation + whitespace, AND first char.
  let out = String(text);
  out = out.replace(/(^|[.!?]\\s+|\\n\\s*)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
  // I always capitalized
  out = out.replace(/\\bi\\b/g, 'I').replace(/\\bi'(m|ve|ll|d)\\b/g, (_, s) => "I'" + s);
  return out;
}

function fixHtml(html) {
  if (!html) return html;
  return String(html).replace(/>([^<]+)</g, (m, txt) => '>' + sentenceCase(txt) + '<');
}

const out = Object.assign({}, $json);
if (out.subject)   out.subject   = titleishSubject(out.subject);
if (out.body_text) out.body_text = sentenceCase(out.body_text);
if (out.body_html) out.body_html = fixHtml(out.body_html);
return [{ json: out }];
`,

// ────────────────────────────────────────────────────────────────────────────
// Sequence parameter table — one record per campaign. Webhook entry points set
// these on the item before the loop starts; the engine reads them each iteration.
SEQUENCE_PARAMS: {
  nurture:    { total_emails: 12, days_between: 7,  stop_on_response: true,  lead_magnet_page: false, newsletter_guard: false },
  leadmagnet: { total_emails: 6,  days_between: 3,  stop_on_response: true,  lead_magnet_page: true,  newsletter_guard: false },
  meeting:    { total_emails: 4,  days_between: 3.5,stop_on_response: true,  lead_magnet_page: false, newsletter_guard: false },
  newsletter: { total_emails: 1,  days_between: 0,  stop_on_response: false, lead_magnet_page: false, newsletter_guard: true  },
  followup:   { total_emails: 2,  days_between: 7,  stop_on_response: true,  lead_magnet_page: false, newsletter_guard: false }
  // user-generated campaigns pass their own total_emails + days_between from webhook body
},

// ────────────────────────────────────────────────────────────────────────────
// Supabase ?select= field lists. Use verbatim in HTTP node query params.
CONTACT_CONTEXT_SELECT: 'id,name,first_name,email,phone_number,title,company,industry,location,linkedin,type,tags,campaigns,source,customer_journey,analysis,next_steps,close_probability,meetings_to_close,personal_summary,company_summary,personal_priorities,company_priorities,conversion_tips,number_emails_sent,number_call_attempts,num_emails_opened,num_links_clicked,last_emailed_date,last_opened_date,last_responded,last_called',

USER_CONTEXT_SELECT: 'email,name,company_name,vv_domain,industry,company_description,product_descriptions,offer,terms,icp,goal,brand_colors,logo_URL,email_notes,ai_suggestions,victories,campaign_notes,lead_notes,calendar,signature',

// ────────────────────────────────────────────────────────────────────────────
COMPOSE_SYSTEM_BASE: `You write outbound B2B email at founder caliber. Output JSON only:
{"subject": "...", "body_text": "...", "body_html": "...", "summary_bullets": ["one short phrase describing angle of this email", "one short phrase describing the ask/CTA"]}
summary_bullets is 1-2 short sentences (<= 120 chars each) that the platform appends to customer_journey so the next email knows what this one said. Writing rules:

1. Every email is DISTINCT. Read the contact's customer_journey, tags, status (type = Lead | Client | Partner), last_responded, num_emails_opened, num_links_clicked, analysis, next_steps, conversion_tips, personal_priorities, company_priorities, source, and campaigns. Reference something specific. No generic "just checking in".
2. Ground the pitch in the user's real business — company_description, product_descriptions, offer, icp, goal, victories, email_notes, ai_suggestions. Never invent stats, clients, testimonials, or product features.
3. Contact status shapes the tone:
   - Lead: earn the meeting. Name the ICP fit. Use their customer_journey to avoid repeating what the prior outbound already said.
   - Client: reinforce outcome, ask for expansion/referral, reference what they already bought.
   - Partner: propose a specific shared motion grounded in victories or offer.
4. Subject: 4-8 words, lowercase-word style allowed EXCEPT first letter capitalized. No emoji. No question mark unless ending a quoted question.
5. Body: 70-160 words. Specific opener that references THIS contact's customer_journey or personal_priorities. One ask. One line CTA. Sign "— " + user.name.
6. Banned phrases: circling back, synergy, leverage, value-add, hope this finds you well, quick chat, touching base, revolutionary, industry-leading, cutting-edge, world-class, game-changing, unlock potential, mission-critical, robust, seamless, best-in-class, wanted to share. No emoji. No exclamation points.
7. body_html mirrors body_text with simple <p> paragraphs + inline <a href="..."> anchors only; no images, no inline styles, no tracking pixels (the platform injects those).
8. Capitalization: begin every sentence with a capital letter. Proper nouns + "I" capitalized.`,

// ────────────────────────────────────────────────────────────────────────────
CONTEXT_BLOCK_CODE: `
// Compose the CONTEXT JSON block that gets passed to the LLM user-prompt.
// Expects upstream nodes: 'Fetch User' (single user row) + 'Fetch Contact' (single contact row)
// and optionally 'Fetch Pages Lead Magnets' for magnet URLs.
const u = $('Fetch User').first()?.json || {};
const c = $('Fetch Contact').first()?.json || {};

const contact = {
  id: c.id, name: c.name, first_name: c.first_name, email: c.email,
  title: c.title, company: c.company, industry: c.industry, location: c.location, linkedin: c.linkedin,
  status: c.type || 'Lead',
  source: c.source, tags: c.tags, campaigns: c.campaigns,
  customer_journey: (c.customer_journey || '').slice(-2000),
  analysis: (c.analysis || '').slice(0, 600),
  next_steps: (c.next_steps || '').slice(0, 400),
  close_probability: c.close_probability,
  conversion_tips: (c.conversion_tips || '').slice(0, 400),
  personal_priorities: (c.personal_priorities || '').slice(0, 400),
  company_priorities:  (c.company_priorities  || '').slice(0, 400),
  personal_summary: (c.personal_summary || '').slice(0, 400),
  company_summary:  (c.company_summary  || '').slice(0, 400),
  engagement: {
    num_emails_sent:   c.number_emails_sent || 0,
    num_emails_opened: c.num_emails_opened   || 0,
    num_links_clicked: c.num_links_clicked   || 0,
    num_call_attempts: c.number_call_attempts|| 0,
    last_emailed_date: c.last_emailed_date,
    last_opened_date:  c.last_opened_date,
    last_responded:    c.last_responded,
    last_called:       c.last_called
  }
};

const user = {
  name: u.name, company_name: u.company_name, industry: u.industry,
  company_description: (u.company_description || '').slice(0, 800),
  product_descriptions:(u.product_descriptions|| '').slice(0, 800),
  offer: (u.offer || '').slice(0, 500),
  icp:   (u.icp   || '').slice(0, 500),
  goal:  (u.goal  || '').slice(0, 500),
  victories_summary: (typeof u.victories === 'string' ? u.victories : JSON.stringify(u.victories || '')).slice(0, 1000),
  email_notes:    (u.email_notes    || '').slice(0, 600),
  ai_suggestions: (u.ai_suggestions || '').slice(0, 800),
  signature:      (u.signature || ('— ' + (u.name || ''))).slice(0, 200),
  calendar: u.calendar || null
};

return [{ json: Object.assign({}, $json, { _user: user, _contact: contact }) }];
`
};
