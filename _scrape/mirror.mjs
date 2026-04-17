#!/usr/bin/env node
// Full site mirror: takes raw HTML from _source/html/, downloads all referenced
// assets (CSS, images, fonts), rewrites absolute URLs to relative, writes the
// result into `site/` ready for static hosting (GitHub Pages).
//
// Output layout mirrors customo.eu URL structure:
//   site/index.html
//   site/blog/<slug>/index.html
//   site/<page>/index.html
//   site/files/...             (all /files/*, /files/responsive/*)
//   site/assets/...             (all /assets/*)
//   site/fonts/...              (fetched from Google Fonts etc.)

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_HTML = join(ROOT, "_source/html");
const OUT = join(ROOT, "site");
const ORIGIN = "https://www.customo.eu";

// Map HTML file names to output URL paths (directory + index.html = clean URLs)
const PAGES = {
  "index.html": "/",
  "clanky.html": "/clanky/",
  "pro-tymy-zakaznickeho-servisu.html": "/pro-tymy-zakaznickeho-servisu/",
  "pracovni-anglictina.html": "/pracovni-anglictina/",
  "mystery-shopping.html": "/mystery-shopping/",
  "male-kroky-k-velkym-zmenam.html": "/blog/male-kroky-k-velkym-zmenam/",
  "trefa-jsou-prodejny-v-jihoceskem-kraji.html": "/blog/trefa-jsou-prodejny-v-jihoceskem-kraji/",
  "zakaznicka-zkusenost-mystery-shopping-terno.html": "/blog/zakaznicka-zkusenost-mystery-shopping-terno/",
  "narocna-komunikace-v-anglictine-nejen-pro-tymy-zakaznicke-podpory.html": "/blog/narocna-komunikace-v-anglictine-nejen-pro-tymy-zakaznicke-podpory/",
  "pripadova-studie-tankcafe-halamky.html": "/blog/pripadova-studie-tankcafe-halamky/",
  "az-na-veky-aneb-o-vztazich-a-partnerstvi.html": "/blog/az-na-veky-aneb-o-vztazich-a-partnerstvi/",
  "kdyz-zakaznicky-servis-nema-sanci.html": "/blog/kdyz-zakaznicky-servis-nema-sanci/",
  "3-nejcastejsi-chyby-ve-wellness-sluzbach.html": "/blog/3-nejcastejsi-chyby-ve-wellness-sluzbach/",
  "pripadova-studie-schwan-cosmetics.html": "/blog/pripadova-studie-schwan-cosmetics/",
  "jak-jsem-se-ucila-vlamsky-a-stala-se-jazykovym-zlodejem.html": "/blog/jak-jsem-se-ucila-vlamsky-a-stala-se-jazykovym-zlodejem/",
  "novy-clen-tymu-odlozte-skoleni.html": "/blog/novy-clen-tymu-odlozte-skoleni/",
  "jak-nam-milenialove-zkazili-prescasy.html": "/blog/jak-nam-milenialove-zkazili-prescasy/",
};

// Assets we've already downloaded (keyed by absolute URL) to avoid duplicate fetches
const assetsDone = new Map(); // absoluteUrl -> localPath (relative to site root, starts with "/")

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (customo-mirror)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (customo-mirror)" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function urlToLocalPath(absUrl) {
  // Given absolute URL, decide where to store it inside site/.
  // Strategy: keep the URL path structure for customo.eu URLs; Google Fonts -> /fonts/…
  try {
    const u = new URL(absUrl);
    if (u.hostname.endsWith("customo.eu")) {
      // Preserve path exactly
      return u.pathname; // e.g. /files/foo.png, /assets/cs/css/bar.css
    }
    if (u.hostname === "fonts.googleapis.com") {
      const hash = Buffer.from(u.search || u.pathname).toString("base64url").slice(0, 12);
      return `/fonts/google-${hash}.css`;
    }
    if (u.hostname === "fonts.gstatic.com") {
      return `/fonts/gstatic${u.pathname}`;
    }
    // Other external - skip (return null to signal "leave as-is")
    return null;
  } catch {
    return null;
  }
}

async function downloadAsset(absUrl, depth = 0) {
  if (assetsDone.has(absUrl)) return assetsDone.get(absUrl);
  const local = urlToLocalPath(absUrl);
  if (!local) return null; // external, leave as absolute

  // Mark now to prevent recursion loops
  assetsDone.set(absUrl, local);

  const outPath = join(OUT, local);
  await mkdir(dirname(outPath), { recursive: true });

  try {
    const isText = /\.(css|svg|js|json|xml|txt|html)$/i.test(local);
    if (isText) {
      let body = await fetchText(absUrl);
      // For CSS, rewrite url(...) and @import to local + queue their assets
      if (local.endsWith(".css")) {
        body = await rewriteCssUrls(body, absUrl, depth);
      }
      await writeFile(outPath, body, "utf8");
    } else {
      const buf = await fetchBuffer(absUrl);
      await writeFile(outPath, buf);
    }
    console.log(`  ✓ ${local}`);
  } catch (e) {
    console.error(`  ! ${absUrl}: ${e.message}`);
    assetsDone.delete(absUrl);
    return null;
  }
  return local;
}

async function rewriteCssUrls(css, baseUrl, depth) {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const tasks = [];
  const replacements = [];
  let m;
  while ((m = urlRe.exec(css))) {
    const raw = m[2];
    if (raw.startsWith("data:")) continue;
    const abs = new URL(raw, baseUrl).toString();
    tasks.push(downloadAsset(abs, depth + 1).then(local => {
      if (local) replacements.push({ match: m[0], raw, local });
    }));
  }
  await Promise.all(tasks);
  for (const r of replacements) {
    css = css.split(r.match).join(`url("${r.local}")`);
  }
  // Also handle @import "..."
  const importRe = /@import\s+(?:url\()?\s*(['"])([^'"]+)\1\s*\)?\s*;/g;
  const importTasks = [];
  const importRepls = [];
  while ((m = importRe.exec(css))) {
    const raw = m[2];
    if (raw.startsWith("data:")) continue;
    const abs = new URL(raw, baseUrl).toString();
    importTasks.push(downloadAsset(abs, depth + 1).then(local => {
      if (local) importRepls.push({ match: m[0], raw, local });
    }));
  }
  await Promise.all(importTasks);
  for (const r of importRepls) {
    css = css.split(r.match).join(`@import "${r.local}";`);
  }
  return css;
}

function rewriteAbsolute(html) {
  // Turn absolute customo.eu URLs into root-relative.
  html = html.replace(/https?:\/\/(?:www\.)?customo\.eu/g, "");
  // Turn blog/page URLs that were scraped as /blog/foo into /blog/foo/
  // (to match our directory-index.html layout). Be careful not to break asset
  // URLs under /files/ or /assets/.
  return html;
}

function addTrailingSlash(html) {
  // Normalize internal page links to trailing-slash form so they map to /path/index.html
  const pageSlugs = Object.values(PAGES).map(p => p.replace(/\/$/, "")).filter(Boolean);
  for (const slug of pageSlugs) {
    const re = new RegExp(`href="${slug}"(?![\\w/])`, "g");
    html = html.replace(re, `href="${slug}/"`);
  }
  return html;
}

function stripTracking(html) {
  // Remove Google Analytics, Facebook Pixel, SolidPixels telemetry, cookiebot
  html = html.replace(/<script[^>]*gtag[^<]*<\/script>/gis, "");
  html = html.replace(/<script[^>]*google-analytics[^<]*<\/script>/gis, "");
  html = html.replace(/<script[^>]*fbevents[^<]*<\/script>/gis, "");
  html = html.replace(/<script[^>]*solidpixels[^<]*<\/script>/gis, "");
  html = html.replace(/<script[^>]*facebook\.net[^<]*<\/script>/gis, "");
  html = html.replace(/<script\s+[^>]*src="[^"]*gtag\/js[^"]*"[^>]*>\s*<\/script>/gi, "");
  return html;
}

function injectContactFormPatch(html) {
  // Inject our own JS before </body> so that SolidPixels forms are hijacked to Web3Forms.
  const tag = `\n<script>window.WEB3FORMS_KEY = ""; /* set at deploy */</script>\n<script src="/js/contact-form-patch.js" defer></script>\n`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, tag + "</body>");
  }
  return html + tag;
}

function eagerLoadImages(html) {
  // SolidPixels uses class="is-lazy" with data-src / data-srcset and a JS loader
  // we don't ship. Promote data-src→src and data-srcset→srcset so images render
  // without JS. Also drop the is-lazy class so any residual CSS doesn't hide them.
  html = html.replace(/<img([^>]*?)\sclass="([^"]*?)\bis-lazy\b([^"]*?)"([^>]*?)>/gi,
    (_, pre, c1, c2, post) => `<img${pre} class="${(c1 + c2).trim()}"${post}>`);
  html = html.replace(/<img([^>]*?)\sdata-src="([^"]+)"([^>]*?)>/gi, (m, pre, src, post) => {
    // Only add src= if one isn't already present in pre/post
    if (/\ssrc="/i.test(pre) || /\ssrc="/i.test(post)) return m;
    return `<img${pre} src="${src}"${post}>`;
  });
  html = html.replace(/<img([^>]*?)\sdata-srcset="([^"]+)"([^>]*?)>/gi, (m, pre, srcset, post) => {
    if (/\ssrcset="/i.test(pre) || /\ssrcset="/i.test(post)) return m;
    return `<img${pre} srcset="${srcset}"${post}>`;
  });
  html = html.replace(/<img([^>]*?)\sdata-sizes="([^"]+)"([^>]*?)>/gi, (m, pre, sizes, post) => {
    if (/\ssizes="/i.test(pre) || /\ssizes="/i.test(post)) return m;
    return `<img${pre} sizes="${sizes}"${post}>`;
  });
  return html;
}

async function findAndDownloadAssets(html, pageUrl) {
  // Collect all asset URLs from this HTML document and download them.
  const abs = s => { try { return new URL(s, pageUrl).toString(); } catch { return null; } };
  const urls = new Set();

  const collect = (re, group) => {
    let m;
    while ((m = re.exec(html))) {
      const raw = m[group];
      if (!raw || raw.startsWith("data:")) continue;
      const u = abs(raw);
      if (u) urls.add(u);
    }
  };

  collect(/<link[^>]+href="([^"]+)"/gi, 1);
  collect(/<script[^>]+src="([^"]+)"/gi, 1);
  collect(/<img[^>]+src="([^"]+)"/gi, 1);
  collect(/<img[^>]+data-src="([^"]+)"/gi, 1);
  collect(/<source[^>]+src="([^"]+)"/gi, 1);
  collect(/<video[^>]+src="([^"]+)"/gi, 1);

  // srcset + data-srcset (comma-separated "url Nw")
  const srcsetRe = /(?:srcset|data-srcset)="([^"]+)"/gi;
  let m;
  while ((m = srcsetRe.exec(html))) {
    const entries = m[1].split(",").map(e => e.trim().split(/\s+/)[0]).filter(Boolean);
    for (const e of entries) {
      const u = abs(e);
      if (u) urls.add(u);
    }
  }

  // inline style url(...)
  const styleRe = /style="[^"]*url\(([^)]+)\)/gi;
  while ((m = styleRe.exec(html))) {
    const raw = m[1].replace(/['"]/g, "").trim();
    if (!raw.startsWith("data:")) {
      const u = abs(raw);
      if (u) urls.add(u);
    }
  }

  // Filter to customo.eu + fonts.googleapis.com + fonts.gstatic.com
  const filtered = [...urls].filter(u => {
    const h = new URL(u).hostname;
    return h.endsWith("customo.eu") || h === "fonts.googleapis.com" || h === "fonts.gstatic.com";
  });

  // Parallelise downloads
  const BATCH = 8;
  for (let i = 0; i < filtered.length; i += BATCH) {
    await Promise.all(filtered.slice(i, i + BATCH).map(u => downloadAsset(u)));
  }
}

async function processPage(srcFile, outPath) {
  const html = await readFile(join(SRC_HTML, srcFile), "utf8");
  const pageUrl = ORIGIN + (outPath === "/" ? "/" : outPath);
  console.log(`\n▶ ${srcFile} → ${outPath}`);

  await findAndDownloadAssets(html, pageUrl);

  let rewritten = rewriteAbsolute(html);
  rewritten = stripTracking(rewritten);
  rewritten = eagerLoadImages(rewritten);
  rewritten = injectContactFormPatch(rewritten);
  rewritten = addTrailingSlash(rewritten);

  // Save to site/<outPath>index.html
  const dest = join(OUT, outPath, "index.html");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, rewritten, "utf8");
}

async function run() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  // Copy pre-downloaded assets (logos etc.) from _source/images into site/files
  // so image references like /files/logo-...svg resolve even before any mirror fetch.
  const preImg = join(ROOT, "_source/images");
  try {
    const preImgs = await readdir(preImg);
    await mkdir(join(OUT, "files"), { recursive: true });
    for (const f of preImgs) {
      const src = join(preImg, f);
      const dst = join(OUT, "files", f);
      const buf = await readFile(src);
      await writeFile(dst, buf);
    }
  } catch {}

  for (const [srcFile, outPath] of Object.entries(PAGES)) {
    await processPage(srcFile, outPath);
  }

  // CNAME + robots.txt + sitemap placeholder
  await writeFile(join(OUT, "CNAME"), "www.customo.eu\n");
  await writeFile(
    join(OUT, "robots.txt"),
    "User-agent: *\nAllow: /\n\nSitemap: https://www.customo.eu/sitemap.xml\n"
  );
  // Minimal sitemap.xml
  const urls = Object.values(PAGES).map(p => `https://www.customo.eu${p}`);
  await writeFile(
    join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`
  );

  console.log(`\n✓ Done. Total assets: ${assetsDone.size}. Output in site/`);
}

run().catch(e => { console.error(e); process.exit(1); });
