#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join, basename, extname } from "node:path";
import { load } from "cheerio";
import TurndownService from "turndown";

const BASE = "https://www.customo.eu";
const OUT = new URL("../_source/", import.meta.url).pathname;

const PAGES = [
  { url: "/", slug: "index", kind: "home" },
  { url: "/pro-tymy-zakaznickeho-servisu", slug: "pro-tymy-zakaznickeho-servisu", kind: "service" },
  { url: "/pracovni-anglictina", slug: "pracovni-anglictina", kind: "service" },
  { url: "/mystery-shopping", slug: "mystery-shopping", kind: "service" },
  { url: "/clanky", slug: "clanky", kind: "list" },
  { url: "/blog/male-kroky-k-velkym-zmenam", slug: "male-kroky-k-velkym-zmenam", kind: "article" },
  { url: "/blog/trefa-jsou-prodejny-v-jihoceskem-kraji", slug: "trefa-jsou-prodejny-v-jihoceskem-kraji", kind: "article" },
  { url: "/blog/zakaznicka-zkusenost-mystery-shopping-terno", slug: "zakaznicka-zkusenost-mystery-shopping-terno", kind: "article" },
  { url: "/blog/narocna-komunikace-v-anglictine-nejen-pro-tymy-zakaznicke-podpory", slug: "narocna-komunikace-v-anglictine-nejen-pro-tymy-zakaznicke-podpory", kind: "article" },
  { url: "/blog/pripadova-studie-tankcafe-halamky", slug: "pripadova-studie-tankcafe-halamky", kind: "article" },
  { url: "/blog/az-na-veky-aneb-o-vztazich-a-partnerstvi", slug: "az-na-veky-aneb-o-vztazich-a-partnerstvi", kind: "article" },
  { url: "/blog/kdyz-zakaznicky-servis-nema-sanci", slug: "kdyz-zakaznicky-servis-nema-sanci", kind: "article" },
  { url: "/blog/3-nejcastejsi-chyby-ve-wellness-sluzbach", slug: "3-nejcastejsi-chyby-ve-wellness-sluzbach", kind: "article" },
  { url: "/blog/pripadova-studie-schwan-cosmetics", slug: "pripadova-studie-schwan-cosmetics", kind: "article" },
  { url: "/blog/jak-jsem-se-ucila-vlamsky-a-stala-se-jazykovym-zlodejem", slug: "jak-jsem-se-ucila-vlamsky-a-stala-se-jazykovym-zlodejem", kind: "article" },
  { url: "/blog/novy-clen-tymu-odlozte-skoleni", slug: "novy-clen-tymu-odlozte-skoleni", kind: "article" },
  { url: "/blog/jak-nam-milenialove-zkazili-prescasy", slug: "jak-nam-milenialove-zkazili-prescasy", kind: "article" },
];

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
td.keep(["iframe"]);

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (customo migration scrape)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const imageQueue = new Map(); // absoluteUrl -> localRelPath

function registerImage(absUrl) {
  if (imageQueue.has(absUrl)) return imageQueue.get(absUrl);
  try {
    const u = new URL(absUrl);
    let ext = extname(u.pathname) || ".jpg";
    if (ext.length > 6) ext = ".jpg";
    const name = basename(u.pathname, ext).replace(/[^a-z0-9-_]/gi, "-").slice(0, 80) || "img";
    let localName = `${name}${ext}`;
    let i = 1;
    while ([...imageQueue.values()].includes(`images/${localName}`)) {
      localName = `${name}-${i++}${ext}`;
    }
    const rel = `images/${localName}`;
    imageQueue.set(absUrl, rel);
    return rel;
  } catch {
    return absUrl;
  }
}

function extractMain($) {
  const candidates = ["main", "article", "[role=main]", "#content", ".content", ".page-content", ".article-content"];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) return el;
  }
  $("header, nav, footer, script, style, noscript, .cookie, .cookies, [class*=cookie]").remove();
  return $("body");
}

function stripChrome($, $main) {
  $main.find("header, nav, footer, script, style, noscript").remove();
  $main.find("[class*=cookie], [id*=cookie]").remove();
  $main.find("[class*=nav], [class*=menu]").filter((_, el) => $(el).find("a").length > 3).remove();
  return $main;
}

function rewriteImages($, $root) {
  $root.find("img").each((_, el) => {
    const $img = $(el);
    const src = $img.attr("src") || $img.attr("data-src");
    if (!src) return;
    const abs = new URL(src, BASE).toString();
    const rel = registerImage(abs);
    $img.attr("src", `../${rel}`);
    $img.removeAttr("srcset");
    $img.removeAttr("data-src");
  });
}

function extractMeta($) {
  return {
    title: $("meta[property='og:title']").attr("content") || $("title").text().trim(),
    description: $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "",
    image: $("meta[property='og:image']").attr("content") || "",
  };
}

function slurpCssVariables(html) {
  const result = {};
  const reVar = /--([a-zA-Z0-9-_]+)\s*:\s*([^;}\n]+)/g;
  let m;
  while ((m = reVar.exec(html))) {
    result[m[1]] = m[2].trim();
  }
  return result;
}

function extractGoogleFonts(html) {
  const fonts = new Set();
  const re = /fonts\.googleapis\.com\/css2?\?[^"'\s]+/g;
  let m;
  while ((m = re.exec(html))) fonts.add(m[0]);
  return [...fonts];
}

async function run() {
  await mkdir(join(OUT, "html"), { recursive: true });
  await mkdir(join(OUT, "markdown"), { recursive: true });
  await mkdir(join(OUT, "images"), { recursive: true });

  const manifest = [];
  const designNotes = { cssVars: {}, fonts: new Set(), rawStylesSamples: [] };

  for (const page of PAGES) {
    const url = BASE + page.url;
    console.log(`→ ${url}`);
    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.error(`  ! skip: ${e.message}`);
      manifest.push({ ...page, ok: false, error: e.message });
      continue;
    }

    // Save raw HTML
    await writeFile(join(OUT, "html", `${page.slug}.html`), html, "utf8");

    // Design extraction from first page
    Object.assign(designNotes.cssVars, slurpCssVariables(html));
    extractGoogleFonts(html).forEach(f => designNotes.fonts.add(f));

    const $ = load(html);
    const meta = extractMeta($);
    const $main = stripChrome($, extractMain($));
    rewriteImages($, $main);

    const markdown = td.turndown($main.html() || "").trim();
    const frontmatter =
      `---\n` +
      `url: ${page.url}\n` +
      `slug: ${page.slug}\n` +
      `kind: ${page.kind}\n` +
      `title: ${JSON.stringify(meta.title)}\n` +
      `description: ${JSON.stringify(meta.description)}\n` +
      (meta.image ? `image: ${JSON.stringify(meta.image)}\n` : "") +
      `---\n\n`;

    await writeFile(join(OUT, "markdown", `${page.slug}.md`), frontmatter + markdown, "utf8");
    manifest.push({ ...page, ok: true, title: meta.title, description: meta.description });
  }

  // Download all referenced images
  console.log(`\nDownloading ${imageQueue.size} images…`);
  for (const [abs, rel] of imageQueue) {
    const outPath = join(OUT, rel);
    try {
      const buf = await fetchBuffer(abs);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, buf);
      console.log(`  ✓ ${rel}`);
    } catch (e) {
      console.error(`  ! ${abs}: ${e.message}`);
    }
  }

  // Write manifest + design notes
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(
    join(OUT, "design-notes.json"),
    JSON.stringify(
      { cssVars: designNotes.cssVars, fonts: [...designNotes.fonts] },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\nDone. Output in _source/`);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
