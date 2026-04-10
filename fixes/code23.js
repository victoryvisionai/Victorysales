// Skip contacts with no valid email — Mailgun rejects null/empty 'to'
const email = $input.item.json.email;
if (!email || typeof email !== 'string' || !email.includes('@')) {
  return [];
}

const raw = $input.item.json.output ||
            $input.item.json.text ||
            $input.item.json.choices?.[0]?.message?.content || '';

let parsed;
try {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  parsed = JSON.parse(cleaned);
} catch(e) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    parsed = JSON.parse(match[0]);
  } else {
    throw new Error('Could not parse AI response: ' + raw.substring(0, 200));
  }
}

return {
  json: {
    ...$input.item.json,
    subject: parsed.subject,
    htmlemailbody: parsed.htmlemailbody,
    plainbody: parsed.plainbody
  }
};
