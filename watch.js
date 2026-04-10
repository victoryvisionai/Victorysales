#!/usr/bin/env node
/**
 * watch.js — Auto git commit + push on file changes
 *
 * Usage: node watch.js
 *   (or: npm run watch)
 *
 * Watches all .html and .js files in project root.
 * On change: git add → commit "Auto: [filename] [timestamp]" → push origin main
 * Debounce: 3 seconds
 */

import { watch } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));

// Files/dirs to ignore
const IGNORED = [
  '.env',
  'node_modules',
  'screenshots',
  '.git',
  'package-lock.json',
];

function shouldIgnore(filename) {
  if (!filename) return true;
  return IGNORED.some(ig => filename.startsWith(ig) || filename.includes(`/${ig}/`));
}

function isWatched(filename) {
  const ext = extname(filename);
  return ext === '.html' || ext === '.js';
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function git(cmd) {
  return execSync(cmd, { cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// Pending changes: filename → debounce timer
const pending = new Map();

function commit(filename) {
  const label = basename(filename);
  const time  = ts();

  try {
    // Stage only the changed file
    git(`git add "${filename}"`);

    // Check if there's actually something staged
    const staged = git('git diff --cached --name-only').trim();
    if (!staged) {
      console.log(`[${time}]  ⏭   ${label} — no changes to commit`);
      return;
    }

    const message = `Auto: ${label} ${time}`;
    git(`git commit -m "${message}"`);
    git('git push origin main');

    console.log(`[${time}]  ✅  Pushed — ${message}`);
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    console.error(`[${time}]  ❌  Git error for ${label}:`);
    console.error(`    ${msg.trim().split('\n')[0]}`);
  }
}

function onChange(filename) {
  if (!filename || shouldIgnore(filename) || !isWatched(filename)) return;

  // Clear existing debounce for this file
  if (pending.has(filename)) clearTimeout(pending.get(filename));

  const timer = setTimeout(() => {
    pending.delete(filename);
    commit(filename);
  }, 3000);

  pending.set(filename, timer);
  console.log(`[${ts()}]  👀  Change detected: ${filename} (committing in 3s...)`);
}

// Watch project root (non-recursive to avoid node_modules)
watch(__dirname, { recursive: false }, (event, filename) => onChange(filename));

// Also watch subdirectories we care about
const watchedDirs = ['.github/workflows'];
for (const dir of watchedDirs) {
  try {
    watch(resolve(__dirname, dir), { recursive: false }, (event, filename) => {
      if (filename) onChange(`${dir}/${filename}`);
    });
  } catch {}
}

console.log(`[${ts()}]  🚀  Watching for changes in ${__dirname}`);
console.log(`           Watching: *.html, *.js`);
console.log(`           Ignoring: ${IGNORED.join(', ')}`);
console.log(`           Debounce: 3s\n`);
