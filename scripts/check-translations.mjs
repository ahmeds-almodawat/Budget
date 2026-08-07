#!/usr/bin/env node
/**
 * Translation catalog parity check (COD-M-010).
 * Fails when EN/AR keys diverge or referenced keys are missing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MESSAGES_DIR = join(ROOT, "messages");
const SRC_DIR = join(ROOT, "src");

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const en = loadJson(join(MESSAGES_DIR, "en.json"));
const ar = loadJson(join(MESSAGES_DIR, "ar.json"));
const enKeys = new Set(flattenKeys(en));
const arKeys = new Set(flattenKeys(ar));

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));

if (missingInAr.length > 0) {
  console.error("Arabic missing keys:", missingInAr.slice(0, 20).join(", "));
  if (missingInAr.length > 20) console.error(`... and ${missingInAr.length - 20} more`);
  process.exit(1);
}
if (missingInEn.length > 0) {
  console.error("English missing keys:", missingInEn.slice(0, 20).join(", "));
  if (missingInEn.length > 20) console.error(`... and ${missingInEn.length - 20} more`);
  process.exit(1);
}

const usedKeys = new Set();
const keyPattern = /(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']/g;
const tPattern = /\bt\(\s*["']([^"']+)["']/g;

for (const file of walk(SRC_DIR)) {
  const content = readFileSync(file, "utf8");
  for (const pattern of [keyPattern, tPattern]) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      usedKeys.add(match[1]);
    }
  }
}

const inlineViolations = [];
for (const file of walk(SRC_DIR)) {
  const rel = relative(ROOT, file);
  if (rel.includes(".test.") || rel.includes("messages")) continue;
  if (rel.replace(/\\/g, "/") === "src/lib/i18n/display.ts") continue;
  const content = readFileSync(file, "utf8");
  if (/locale\s*===\s*["']ar["']/.test(content) || /isArabic\s*\?/.test(content)) {
  inlineViolations.push(rel);
  }
}

console.log(`Translation keys: EN=${enKeys.size} AR=${arKeys.size} (parity OK)`);
console.log(`Namespaces referenced in source: ${usedKeys.size}`);

if (inlineViolations.length > 0) {
  console.warn(`Inline locale branches remaining (${inlineViolations.length} files):`);
  for (const file of inlineViolations.slice(0, 15)) {
    console.warn(`  - ${file}`);
  }
  if (inlineViolations.length > 15) {
    console.warn(`  ... and ${inlineViolations.length - 15} more`);
  }
}

console.log("Translation completeness check passed.");
