#!/usr/bin/env node
/**
 * Lightweight theme regression guard — flags likely light-mode contrast traps
 * inside the dashboard shell when palette inversion is scoped to .theme-inverted.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src');
const IGNORE = new Set(['node_modules', '.next']);

const patterns = [
  { name: 'light-page-slate-900', regex: /text-slate-900(?![\w-])/g, hint: 'Use text-foreground or wrap in surface-light' },
  { name: 'light-page-bg-white', regex: /\bbg-white\b/g, hint: 'Use bg-card or surface-light for theme-safe light surfaces' },
  { name: 'modal-slate-scrim', regex: /fixed inset-0[^\"']*bg-slate-950\//g, hint: 'Use modal-scrim for overlays' },
  { name: 'broken-dark-variant-only', regex: /text-slate-900 dark:text-slate-100/g, hint: 'Prefer semantic tokens; ensure @custom-variant dark is active' },
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (/\.(tsx|jsx|css)$/.test(entry)) files.push(path);
  }
  return files;
}

let issueCount = 0;
for (const file of walk(ROOT)) {
  const rel = relative(join(import.meta.dirname, '..'), file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  if (rel.includes('(auth)/') || rel.includes('auth.css')) continue;

  for (const { name, regex, hint } of patterns) {
    const matches = [...text.matchAll(regex)];
    if (!matches.length) continue;
    issueCount += matches.length;
    console.log(`[${name}] ${rel} (${matches.length}) — ${hint}`);
  }
}

if (issueCount === 0) {
  console.log('Theme contrast check: no flagged patterns.');
} else {
  console.log(`\nTheme contrast check: ${issueCount} potential issue(s). Review manually — some may be intentional.`);
}
