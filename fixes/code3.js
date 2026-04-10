// Safe access — User14 may return no rows if user not found
let existing = [];
try {
  existing = $('User14').first().json.email_templates || [];
} catch(e) {
  existing = [];
}

// Validate required fields from Save Template webhook
let templateName, emails;
try {
  templateName = $('Save Template').first().json.body.template_name;
  emails = $('Save Template').first().json.body.emails;
} catch(e) {
  throw new Error('Missing required input: template_name or emails not provided');
}

if (!templateName) throw new Error('template_name is required');

const newTemplate = { template_name: templateName, emails, saved_at: new Date().toISOString() };
const idx = existing.findIndex(t => t.template_name === newTemplate.template_name);
if (idx >= 0) {
  existing[idx] = newTemplate;
} else {
  existing.push(newTemplate);
}
return [{ json: { updated_templates: existing } }];
