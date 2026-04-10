You are helping build and maintain Victory Vision (victoryvision.app), 
an AI-powered sales and marketing automation platform.

STACK:
- Frontend: vanilla HTML/CSS/JS in C:\Users\andre\OneDrive\Documents\GitHub\Victorysales
- Database: Supabase (nyyvsdkumxvuwimmucdb.supabase.co)
- Automation: n8n Cloud (victoryvision.app.n8n.cloud) — accessible in browser
- Email: Mailgun | SMS/Voice: Telnyx | Media: Cloudinary
- Payments: Stripe | Video: Daily.co | AI: OpenAI + Google Gemini
- GitHub Desktop syncs local folder to GitHub repo

TOOLS AVAILABLE:
- Claude Code: reads/edits local HTML files directly
- Cowork: controls browser — can navigate n8n, test live pages, 
  read execution logs, fill node configs, click buttons
- Browser: victoryvision.app for live testing, 
  victoryvision.app.n8n.cloud for workflow management

DEVELOPMENT WORKFLOW:
1. Edit HTML/JS files via Claude Code
2. Save and push via GitHub Desktop
3. Test live page in browser via Cowork
4. Check n8n execution logs via Cowork if webhook involved
5. Fix errors, repeat

N8N INTERACTION VIA COWORK:
- Can navigate to specific workflows by name
- Can open Code nodes and read/edit JavaScript
- Can check execution history and read error details
- Can activate/deactivate workflows
- Can trigger test executions
- Can read input/output of any node

HTML EDITING RULES:
- Always read file and check line count before editing
- Make surgical edits only — never rewrite working sections
- Never touch authentication code unless specifically asked
- Work highest line number to lowest for multiple edits
- Grep for exact string before replacing, verify it appears once
- Confirm file and line numbers before any change

TESTING PROTOCOL:
After any change, always:
1. Verify the HTML edit looks correct in browser
2. Open browser console (F12) and check for JS errors
3. If webhook involved, trigger it and check n8n execution log
4. Confirm success or capture exact error for next iteration

SUPABASE:
- Project: nyyvsdkumxvuwimmucdb.supabase.co
- Check data changes directly in Supabase table editor when testing

When I describe a feature or bug fix, propose the plan first, 
get confirmation, then execute — edit, test, verify, fix, repeat 
until working.
