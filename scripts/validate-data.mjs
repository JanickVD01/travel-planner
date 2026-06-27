#!/usr/bin/env node
// CI gate (the required `validate` check). Verifies:
//   1. every public/data/**/*.json parses as JSON
//   2. the wiki manifest (public/data/wiki/index.json) is well-formed:
//      every topic has slug/title/file, and the referenced .md file exists
// Exit non-zero on the first failure so a broken data/wiki change can't merge.
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DATA = join(ROOT, "public", "data");
const errors = [];
let jsonCount = 0;

async function walk(dir) {
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); }
  catch { return; } // data dir may not exist yet
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await walk(p); continue; }
    if (e.isFile() && e.name.endsWith(".json")) {
      jsonCount++;
      try { JSON.parse(await readFile(p, "utf8")); }
      catch (err) { errors.push(`Invalid JSON: ${relative(ROOT, p)} -> ${err.message}`); }
    }
  }
}

async function validateWiki() {
  const idx = join(DATA, "wiki", "index.json");
  if (!existsSync(idx)) return; // wiki is optional
  let manifest;
  try { manifest = JSON.parse(await readFile(idx, "utf8")); }
  catch (err) { errors.push(`wiki/index.json does not parse: ${err.message}`); return; }
  const topics = manifest && manifest.topics;
  if (!Array.isArray(topics)) { errors.push("wiki/index.json: `topics` must be an array"); return; }
  const seen = new Set();
  for (const [i, t] of topics.entries()) {
    const where = `wiki topic #${i}` + (t && t.slug ? ` (${t.slug})` : "");
    if (!t || !t.slug) errors.push(`${where}: missing "slug"`);
    if (!t || !t.title) errors.push(`${where}: missing "title"`);
    if (!t || !t.file) errors.push(`${where}: missing "file"`);
    if (t && t.slug) { if (seen.has(t.slug)) errors.push(`${where}: duplicate slug`); seen.add(t.slug); }
    if (t && t.file) {
      const f = join(DATA, "wiki", t.file);
      if (!existsSync(f)) errors.push(`${where}: referenced file not found -> wiki/${t.file}`);
    }
  }
}

await stat(DATA).then(() => walk(DATA)).catch(() => {});
await validateWiki();

if (errors.length) {
  console.error("✗ validate-data failed:\n" + errors.map(e => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ validate-data passed (${jsonCount} JSON file(s) checked).`);
