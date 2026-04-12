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

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, cmd, url] = process.argv;

if (!cmd || !url) {
  console.log(`
browser.js — Victory Vision page checker

  node browser.js check      "https://victoryvision.app/contacts"
  node browser.js screenshot "https://victoryvision.app/ai"
`);
  process.exit(0);
}

let exitCode = 0;

if (cmd === 'check') {
  exitCode = await check(url);
} else if (cmd === 'screenshot') {
  await screenshot(url);
} else {
  console.error(`Unknown command: ${cmd}`);
  exitCode = 1;
}

process.exit(exitCode);
