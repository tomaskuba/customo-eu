# Customo — pokyny pro Claude Code

Tohle je statická kopie webu [customo.eu](https://www.customo.eu). Žádný framework — jen HTML, CSS a obrázky pod složkou `site/`. Když chce Jana něco změnit, edituj přímo HTML soubory, commitni a pushni. GitHub Actions se postará o deploy během 1-2 minut.

---

## Kde je co

```
site/
├── index.html                                ← homepage
├── pro-tymy-zakaznickeho-servisu/index.html  ← stránka služby (stejně pro další 2)
├── pracovni-anglictina/index.html
├── mystery-shopping/index.html
├── clanky/index.html                         ← přehled článků
├── blog/<slug>/index.html                    ← 12 jednotlivých článků
├── files/                                    ← VŠECHNY obrázky (logo, fotky, ilustrace)
│   └── responsive/<sirka>/0/<nazev>.jpg      ← responsive varianty
├── assets/                                   ← CSS a další statika
├── js/contact-form-patch.js                  ← přepojuje formulář na Web3Forms
├── CNAME                                     ← www.customo.eu
├── robots.txt, sitemap.xml
```

## Nejčastější úkoly

### Změna textu na stránce

Otevři příslušný `site/*/index.html`, najdi text v HTML (třeba přes grep) a přepiš ho. **Nezapomeň, že týž obsah se může objevit ve více stránkách** (sdílený header/footer/bloky nabídky jsou v každém HTML zkopírované).

### Přidání nového článku

1. Zkopíruj libovolný existující článek jako šablonu:
   ```bash
   cp -r site/blog/male-kroky-k-velkym-zmenam site/blog/novy-slug
   ```
2. Edituj `site/blog/novy-slug/index.html` — hlavně:
   - `<title>`
   - `<meta name="description">` a OG tagy
   - `<h1>` nadpis
   - `<article>` tělo
   - případný hero obrázek (`<img src="/files/..." >`)
3. Přidej kartu článku do `site/clanky/index.html` i do bloku „Blog" na homepage `site/index.html`.
4. Obrázek k článku dej do `site/files/nazev.png` (nebo `jpg`).
5. Commitni + pushni → za minutku online.

### Úprava kontaktních údajů

Telefon `777 263 857` a e-mail `jana@customo.eu` se vyskytují ve **všech stránkách** (patička, kontakt). Nejjednodušší je hromadný replace přes sed, například:

```bash
find site -name "*.html" -exec sed -i '' 's/777 263 857/NOVE_CISLO/g' {} +
```

(na macOS `sed -i ''`, na Linuxu `sed -i`)

### Nahrazení obrázku

Přepis souboru v `site/files/<nazev>.png` stejným jménem — nemusíš měnit HTML. Pro responsive (`/files/responsive/360/0/...`, `720/0/`, `1280/0/`, atd.) nahraď všechny varianty, nebo nechej jen jednu a upravy `srcset` v HTML.

---

## Kontaktní formulář

Formulář na homepage a podstránkách SolidPixels původně posílal přes vlastní backend. Statický mirror to řeší přes `site/js/contact-form-patch.js` + [Web3Forms](https://web3forms.com) (zdarma do 250 zpráv/měsíc).

- **Access key** je uložený v GitHub Secretu `WEB3FORMS_KEY`. Při deployi se injectne do HTML (workflow dělá `sed` replace `window.WEB3FORMS_KEY = ""`).
- Když key chybí, formulář ukáže hlášku „napište prosím na jana@customo.eu".

Pokud chceš formulář testovat lokálně:

```bash
# po `npx serve site` otevři devtools → Console a nastav:
window.WEB3FORMS_KEY = "tvuj-klic"
```

---

## Deploy

- **Automaticky:** `git push origin main` → GitHub Actions → GitHub Pages (~1-2 min).
- **Ruční spuštění:** v GitHubu → Actions → „Deploy to GitHub Pages" → Run workflow.
- **Workflow:** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

---

## Obnova snímku z customo.eu

Dokud původní SolidPixels ještě běží, můžeš kdykoli znovu stáhnout aktuální stav:

```bash
cd _scrape
pnpm install        # jednorázově (cheerio + turndown)
node scrape.mjs     # uloží raw HTML + malé obrázky do _source/
node mirror.mjs     # postaví site/ — celý mirror včetně CSS a responsive obrázků (~70 MB)
```

**Pozor:** mirror.mjs **přepíše `site/`**. Než to spustíš, zálohuj si případné ruční úpravy.

---

## Pravidla pro Claude při úpravách

1. **Edituj pouze soubory v `site/`** (+ případně `.github/workflows/*` nebo dokumentaci).
2. **Nikdy neinstaluj npm balíčky** ani nepřidávej build step — web je záměrně bez buildu, aby Jana mohla editovat HTML přímo.
3. **Commit messages piš česky**, stručně (např. „nový článek o mystery shoppingu v hotelu X", „oprava telefonu v patičce").
4. **Po větší úpravě vždy spusť lokálně `npx serve site`** a otevři relevantní stránku, ať ověříš, že se zobrazuje správně.
5. **Obrázky před commitem zkontroluj velikost** — pro fotky preferuj JPG <300 KB, pro loga SVG.
6. **Zachovej URL** u existujících článků a stránek (SEO).
7. **Formulář nikdy neměň zpět na SolidPixels formu** — zůstáváme na Web3Forms.
8. **`_source/` a `_scrape/node_modules/` necommituj** (jsou v `.gitignore`).
