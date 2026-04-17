#!/usr/bin/env node
// Cleanup _source markdown -> src/content/clanky + copies images to public/images
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_MD = join(ROOT, "_source/markdown");
const SRC_IMG = join(ROOT, "_source/images");
const OUT_MD = join(ROOT, "src/content/clanky");
const OUT_IMG = join(ROOT, "public/images");

// Publication dates (scraped from /clanky listing, YYYY-MM-DD)
const DATES = {
  "male-kroky-k-velkym-zmenam": "2025-01-10",
  "trefa-jsou-prodejny-v-jihoceskem-kraji": "2024-07-13",
  "zakaznicka-zkusenost-mystery-shopping-terno": "2024-02-27",
  "narocna-komunikace-v-anglictine-nejen-pro-tymy-zakaznicke-podpory": "2024-01-14",
  "pripadova-studie-tankcafe-halamky": "2023-10-24",
  "az-na-veky-aneb-o-vztazich-a-partnerstvi": "2023-07-26",
  "kdyz-zakaznicky-servis-nema-sanci": "2023-05-30",
  "3-nejcastejsi-chyby-ve-wellness-sluzbach": "2023-05-13",
  "pripadova-studie-schwan-cosmetics": "2023-01-19",
  "jak-jsem-se-ucila-vlamsky-a-stala-se-jazykovym-zlodejem": "2022-12-02",
  "novy-clen-tymu-odlozte-skoleni": "2022-10-27",
  "jak-nam-milenialove-zkazili-prescasy": "2022-10-27",
};

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const lines = m[1].split("\n");
  const fm = {};
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z_0-9]*):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch {}
    }
    fm[kv[1]] = val;
  }
  return { fm, body: m[2] };
}

function stripBoilerplate(body) {
  // Cut everything from "### Zaujal vás článek" footer onwards
  const cutAt = body.search(/###\s+Zaujal\s+vás\s+článek/);
  if (cutAt >= 0) body = body.slice(0, cutAt);
  return body.trim();
}

function stripLeadingH1(body, title) {
  // Drop the first `# Heading` if it matches the article title (title already in frontmatter)
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const h1 = l.match(/^#\s+(.+)$/);
    if (h1) {
      lines.splice(i, 1);
      // also drop immediate blank line
      if (lines[i]?.trim() === "") lines.splice(i, 1);
      break;
    }
    break; // first non-empty line wasn't H1; leave as-is
  }
  return lines.join("\n").trim();
}

function rewriteImages(body) {
  // Convert ../images/foo.png → /images/foo.png (public/ serves at /)
  return body.replace(/!\[([^\]]*)\]\(\.\.\/images\/([^)]+)\)/g, "![$1](/images/$2)");
}

function firstLine(body) {
  const plain = body.replace(/^#+\s.*$/gm, "").replace(/[*_`]/g, "").trim();
  const first = plain.split(/\n{2,}/).find(p => p.trim().length > 40);
  return first ? first.trim().replace(/\s+/g, " ").slice(0, 220) : "";
}

function fmField(k, v) {
  if (v === undefined || v === null || v === "") return "";
  const needsQuote = /[:#"'\n\r]/.test(String(v));
  return `${k}: ${needsQuote ? JSON.stringify(v) : v}\n`;
}

async function run() {
  await mkdir(OUT_MD, { recursive: true });
  await mkdir(OUT_IMG, { recursive: true });

  // Copy all images
  const images = await readdir(SRC_IMG);
  for (const img of images) {
    await copyFile(join(SRC_IMG, img), join(OUT_IMG, img));
  }
  console.log(`✓ Copied ${images.length} images → public/images/`);

  let converted = 0;
  for (const [slug, date] of Object.entries(DATES)) {
    const raw = await readFile(join(SRC_MD, `${slug}.md`), "utf8");
    const { fm, body } = parseFrontmatter(raw);

    let cleaned = stripBoilerplate(body);
    cleaned = stripLeadingH1(cleaned, fm.title);
    cleaned = rewriteImages(cleaned);

    const description = (fm.description || firstLine(cleaned))
      .toString()
      .replace(/\s+/g, " ")
      .replace(/^"|"$/g, "")
      .trim()
      .slice(0, 280);

    const out =
      "---\n" +
      fmField("title", fm.title) +
      fmField("description", description) +
      fmField("date", date) +
      "---\n\n" +
      cleaned +
      "\n";

    await writeFile(join(OUT_MD, `${slug}.md`), out, "utf8");
    converted++;
  }
  console.log(`✓ Converted ${converted} articles → src/content/clanky/`);
}

run().catch(e => { console.error(e); process.exit(1); });
