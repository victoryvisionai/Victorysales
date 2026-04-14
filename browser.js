#!/usr/bin/env node
/**
 * browser.js — Playwright page checker for Victory Vision
 *
 * Usage:
 *   node browser.js check "https://victoryvision.app/contacts"
 *   node browser.js check "https://victoryvision.app/ai"
 *
 * Exit codes:
 *   0 — page loaded, no console errors
 *   1 — console errors found or page failed to load
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const BASE_URL      = 'https://victoryvision.app';
const TEST_EMAIL    = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

const SCREENSHOTS_DIR = 'C:/Users/andre/OneDrive/Pictures/Screenshots/VV';

// Noise to ignore
const IGNORED_PATTERNS = [
  'favicon',
  'net::ERR_ABORTED',
  'ERR_BLOCKED_BY_ORB',
  '__webpack',
  '[HMR]',
  'hot-update',
  'Extension context invalidated',
  'Non-Error promise rejection',
];

function shouldIgnore(msg) {
  return IGNORED_PATTERNS.some(p => msg.includes(p));
}

function slugify(url) {
  return url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').slice(0, 60);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── getSession() ─────────────────────────────────────────────────────────────
// Performs login in an isolated context and returns saved storage state.
// Cached for the process lifetime so repeated check() calls only login once.
let _sessionState = null;

async function getSession(browser) {
  if (_sessionState) return _sessionState;

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.warn('  ⚠️   TEST_EMAIL / TEST_PASSWORD not set — running unauthenticated');
    return null;
  }

  console.log(`  🔑  Logging in as ${TEST_EMAIL}...`);
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);

  await Promise.all([
    page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }),
    page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")'),
  ]);

  console.log(`  ✅  Logged in`);
  _sessionState = await ctx.storageState();
  await ctx.close();
  return _sessionState;
}

// ── screenshot() ──────────────────────────────────────────────────────────────
// Logs in, navigates to url, waits for networkidle, saves screenshot
async function screenshot(url) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const session = await getSession(browser);
  const context = await browser.newContext({ storageState: session || undefined });
  const page    = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  const filename = `${slugify(url)}-${timestamp()}.png`;
  const filepath = `${SCREENSHOTS_DIR}/${filename}`;
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  📸  Saved: screenshots/${filename}`);

  await browser.close();
  return filepath;
}

// ── check() ───────────────────────────────────────────────────────────────────
// Screenshot + collect all console errors/warnings, exit 1 if any found
async function check(url) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const session = await getSession(browser);
  const context = await browser.newContext({ storageState: session || undefined });
  const page    = await context.newPage();

  const consoleErrors   = [];
  const consoleWarnings = [];
  const pageErrors      = [];

  page.on('console', msg => {
    const text = msg.text();
    if (shouldIgnore(text)) return;
    if (msg.type() === 'error')   consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });

  page.on('pageerror', err => {
    if (!shouldIgnore(err.message)) pageErrors.push(err.message);
  });

  console.log(`\n🔍  Checking: ${url}`);

  let navFailed = false;
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const status = response?.status();
    if (status && status >= 400) {
      pageErrors.push(`HTTP ${status} loading ${url}`);
      navFailed = true;
    }
    // Wait for any deferred JS errors
    await page.waitForTimeout(2000);
  } catch (err) {
    pageErrors.push(`Navigation failed: ${err.message}`);
    navFailed = true;
  }

  // Always take a screenshot
  const filename = `${slugify(url)}-${timestamp()}.png`;
  try {
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${filename}`, fullPage: true });
    console.log(`  📸  Screenshot: screenshots/${filename}`);
  } catch {}

  await browser.close();

  // ── Output ────────────────────────────────────────────────────────────────
  if (pageErrors.length) {
    console.log(`\n  ❌  Page errors (${pageErrors.length}):`);
    pageErrors.forEach(e => {
      console.log(`      ${e}`);
      console.log(`::error title=Page Error [${url}]::${e}`);
    });
  }

  if (consoleErrors.length) {
    console.log(`\n  ❌  Console errors (${consoleErrors.length}):`);
    consoleErrors.forEach(e => {
      console.log(`      ${e}`);
      console.log(`::error title=Console Error [${url}]::${e}`);
    });
  }

  if (consoleWarnings.length) {
    console.log(`\n  ⚠️   Console warnings (${consoleWarnings.length}):`);
    consoleWarnings.forEach(w => console.log(`      ${w}`));
  }

  const hasErrors = pageErrors.length > 0 || consoleErrors.length > 0;

  if (!hasErrors) {
    console.log(`  ✅  No errors — page loaded cleanly\n`);
  } else {
    console.log(`\n  ❌  FAILED: ${url}\n`);
  }

  return hasErrors ? 1 : 0;
}

// ── test() ────────────────────────────────────────────────────────────────────
// Interactive webhook verification. Pass a list of test specs:
//   { label, action(page), assert(result) }
// Each spec runs action, waits for the network response matching a URL pattern,
// then calls assert with { status, body, json }.
async function test(url, specs) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const session = await getSession(browser);
  const context = await browser.newContext({ storageState: session || undefined });
  const page    = await context.newPage();

  const consoleErrors = [];
  const networkLog    = {};   // url-pattern → { status, text }

  page.on('console', msg => {
    const text = msg.text();
    if (shouldIgnore(text)) return;
    if (msg.type() === 'error') consoleErrors.push(text);
  });

  // Capture every response body for later assertion
  page.on('response', async resp => {
    try {
      const u = resp.url();
      const status = resp.status();
      const body = await resp.text().catch(() => '');
      networkLog[u] = { status, text: body };
      // Log non-2xx non-3xx as noticeable warnings
      if (status >= 400 && !shouldIgnore(u)) {
        console.log(`  ⚠️   HTTP ${status}: ${u.replace(/^https?:\/\/[^/]+/, '')}`);
      }
    } catch {}
  });

  console.log(`\n🧪  Testing: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);   // let deferred calls settle

  const results = [];

  for (const spec of specs) {
    process.stdout.write(`  ⏳  ${spec.label} … `);
    try {
      if (spec.action) await spec.action(page);
      if (spec.waitMs) await page.waitForTimeout(spec.waitMs);

      // Find matching network response
      const key = spec.urlPattern
        ? Object.keys(networkLog).find(u => u.includes(spec.urlPattern))
        : null;
      const net = key ? networkLog[key] : null;
      let json = null;
      if (net) {
        try { json = JSON.parse(net.text); } catch {}
      }

      const result = { status: net?.status, body: net?.text, json };
      const assertResult = spec.assert ? spec.assert(result, page) : true;

      if (assertResult === true || assertResult === undefined) {
        console.log('✅ pass');
        results.push({ label: spec.label, pass: true });
      } else {
        console.log('❌ FAIL — ' + assertResult);
        results.push({ label: spec.label, pass: false, reason: assertResult });
      }
    } catch (err) {
      console.log('❌ ERROR — ' + err.message);
      results.push({ label: spec.label, pass: false, reason: err.message });
    }
  }

  // Screenshot after all tests
  const filename = `test-${slugify(url)}-${timestamp()}.png`;
  try {
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${filename}`, fullPage: true });
    console.log(`\n  📸  Screenshot: ${filename}`);
  } catch {}

  await browser.close();

  // Console error summary
  if (consoleErrors.length) {
    console.log(`\n  ❌  Console errors (${consoleErrors.length}):`);
    consoleErrors.forEach(e => console.log(`      ${e}`));
  } else {
    console.log('  ✅  No console errors');
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n  Results: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach(r => console.log(`  ✗  ${r.label}: ${r.reason}`));
  }

  return (failed.length > 0 || consoleErrors.length > 0) ? 1 : 0;
}

// ── testSettings() ────────────────────────────────────────────────────────────
async function testSettings() {
  return test('https://victoryvision.app/settings.html', [
    {
      label: 'Page loads (networkidle)',
      urlPattern: null,
      assert: () => true   // navigation itself is the assertion
    },
    {
      label: 'oauth/status — returns 200 with tokens array',
      urlPattern: 'webhook/oauth/status',
      assert: ({ status, json }) => {
        if (!status) return 'no network request captured';
        if (status !== 200) return `HTTP ${status}`;
        if (!json) return 'response body not JSON';
        const tokens = Array.isArray(json) ? json : (json.tokens || null);
        if (!Array.isArray(tokens)) return 'tokens is not an array';
        return true;
      }
    },
    {
      label: 'user/get — returns user object',
      urlPattern: 'webhook/user/get',
      assert: ({ status, json }) => {
        if (!status) return 'no network request captured';
        if (status !== 200) return `HTTP ${status}`;
        if (!json) return 'response body not JSON';
        return true;
      }
    },
    {
      label: 'Save Tracking IDs — posts to user/ad-tracking',
      urlPattern: 'webhook/user/ad-tracking',
      waitMs: 2000,
      action: async (page) => {
        // Fill in a test value and click save
        await page.fill('#google_pixel', 'G-TEST123').catch(() => {});
        const btn = page.locator('button:has-text("Save Tracking IDs")');
        if (await btn.count() > 0) await btn.click();
        else throw new Error('"Save Tracking IDs" button not found');
      },
      assert: ({ status, json }) => {
        if (!status) return 'no network request captured';
        if (status !== 200) return `HTTP ${status}`;
        if (!json) return 'response body not JSON';
        if (json.ok === false) return 'server returned ok:false — ' + (json.error || '');
        return true;
      }
    },
  ]);
}

// ── testAds() ─────────────────────────────────────────────────────────────────
async function testAds() {
  return test('https://victoryvision.app/ads.html', [
    {
      label: 'Page loads (networkidle)',
      urlPattern: null,
      assert: () => true
    },
    {
      label: 'ads/get — returns 200 with totals object',
      urlPattern: 'webhook/ads/get',
      assert: ({ status, json }) => {
        if (!status) return 'no network request captured';
        if (status !== 200) return `HTTP ${status}`;
        if (!json) return 'response body not JSON';
        if (!json.totals) return 'missing totals field';
        return true;
      }
    },
    {
      label: 'ads/get-attribution — returns 200',
      urlPattern: 'webhook/ads/get-attribution',
      assert: ({ status, json }) => {
        if (!status) return 'no network request captured';
        if (status !== 200) return `HTTP ${status}`;
        if (!json) return 'response body not JSON';
        return true;
      }
    },
  ]);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, cmd, url] = process.argv;

if (!cmd) {
  console.log(`
browser.js — Victory Vision page checker

  node browser.js check      "https://victoryvision.app/contacts"
  node browser.js screenshot "https://victoryvision.app/ai"
  node browser.js test-settings
  node browser.js test-ads
`);
  process.exit(0);
}

let exitCode = 0;

if (cmd === 'check') {
  if (!url) { console.error('check requires a URL'); process.exit(1); }
  exitCode = await check(url);
} else if (cmd === 'screenshot') {
  if (!url) { console.error('screenshot requires a URL'); process.exit(1); }
  await screenshot(url);
} else if (cmd === 'test-settings') {
  exitCode = await testSettings();
} else if (cmd === 'test-ads') {
  exitCode = await testAds();
} else {
  console.error(`Unknown command: ${cmd}`);
  exitCode = 1;
}

process.exit(exitCode);
