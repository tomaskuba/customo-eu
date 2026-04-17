#!/usr/bin/env node
// Clean service pages from _source/markdown into src/content/sluzby/.
// Strategy: cut trailing footer (Kontakt/Vyžádejte/Blog), rewrite URLs/anchors,
// deduplicate consecutive identical images and headings, remove empty-link scraps.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "_source/markdown");
const OUT = join(ROOT, "src/markdown/sluzby");

const SERVICES = ["pro-tymy-zakaznickeho-servisu", "pracovni-anglictina", "mystery-shopping"];

const CUT_RE = new RegExp(
  [
    "^##\\s*Kontakt\\s*$",
    "^##\\s*Vyžádejte si",
    "^##\\s*Blog\\s*$",
  ].map(s => `(?:${s})`).join("|"),
  "im"
);

function stripFrontmatter(raw) {
  const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1].trim() : raw;
}

function cutTail(body) {
  const match = body.match(CUT_RE);
  if (match && match.index !== undefined) return body.slice(0, match.index).trim();
  return body;
}

function removeFormLabels(body) {
  return body
    .split("\n")
    .filter(line => !/^(Jméno\*|Příjmení\*|E-mail\*|Telefon\*|Název vaší společnosti|Vaše zpráva\*|poslat|MÁME O KURZ ZÁJEM|CHCI O KURZU VĚDĚT VÍC)\s*$/i.test(line.trim()))
    .join("\n");
}

function rewriteImages(body) {
  return body.replace(/!\[([^\]]*)\]\(\.\.\/images\/([^)]+)\)/g, "![$1](/images/$2)");
}

function rewriteLinks(body) {
  return body
    // /#kdo internal anchor → /#kontakt (our contact section id)
    .replace(/\]\(#kdo\)/g, "](/#kontakt)")
    // absolute customo.eu internal links → relative
    .replace(/\]\(https?:\/\/(?:www\.)?customo\.eu(\/[^)]*)\)/g, "]($1)")
    // customo-eu.reservio.com stays absolute but keep them
    ;
}

function removeEmptyLinks(body) {
  // `[](url)` and `[]()` – empty text link
  body = body.replace(/\[\]\([^)]*\)/g, "");
  // bullet items that were only empty links (e.g. social icons)
  body = body.replace(/^\*\s+\[.*?\]\(https?:\/\/(?:www\.)?(linkedin|facebook)\.com[^)]*\)\s*$/gim, "");
  // standalone small CTA links like "[kontakt](url)" that are visual buttons -> keep them as-is
  return body;
}

function dedupe(body) {
  const lines = body.split("\n");
  const out = [];
  let prev = "";
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip duplicate consecutive images
    if (/^!\[.*?\]\(.+?\)$/.test(trimmed) && trimmed === prev) continue;
    // Skip duplicate heading + following empty line (we only dedupe heading line itself)
    if (/^#{2,4}\s+/.test(trimmed) && trimmed === prev) continue;
    out.push(line);
    if (trimmed) prev = trimmed;
  }
  return out.join("\n");
}

function dedupeSections(body) {
  // If a section heading (##/###) appears twice with identical heading line, drop the 2nd occurrence
  // (along with its content until the next same-or-higher heading).
  const lines = body.split("\n");
  const seen = new Map(); // heading -> firstIndex
  const markedForRemoval = new Set();

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(#{2,4})\s+(.+)$/);
    if (!h) continue;
    const key = `${h[1]} ${h[2].trim()}`;
    if (!seen.has(key)) {
      seen.set(key, i);
      continue;
    }
    // found duplicate - mark this heading + following content until next heading of same/higher level
    const level = h[1].length;
    markedForRemoval.add(i);
    for (let j = i + 1; j < lines.length; j++) {
      const nh = lines[j].match(/^(#{2,6})\s+/);
      if (nh && nh[1].length <= level) break;
      markedForRemoval.add(j);
    }
  }
  return lines.filter((_, i) => !markedForRemoval.has(i)).join("\n");
}

function collapseBlanks(body) {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

async function run() {
  await mkdir(OUT, { recursive: true });
  for (const slug of SERVICES) {
    const raw = await readFile(join(SRC, `${slug}.md`), "utf8");
    let body = stripFrontmatter(raw);
    body = cutTail(body);
    body = removeFormLabels(body);
    body = rewriteImages(body);
    body = rewriteLinks(body);
    body = removeEmptyLinks(body);
    body = dedupeSections(body);
    body = dedupe(body);
    body = collapseBlanks(body);
    await writeFile(join(OUT, `${slug}.md`), body + "\n", "utf8");
    console.log(`✓ ${slug} (${body.length} chars)`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
