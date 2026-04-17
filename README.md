# customo.eu — statický mirror

Kompletní statická kopie webu [customo.eu](https://www.customo.eu), staženého z původního SolidPixels hostingu. Žádný framework, žádný build — jen HTML, CSS a obrázky.

Hostovaný zdarma na **GitHub Pages**, kontaktní formulář přes **Web3Forms**.

## Struktura

| Složka | Co tam je |
| --- | --- |
| `site/` | **statický web** — co se deployuje |
| `site/index.html`, `site/blog/*/`, `site/<page>/` | jednotlivé stránky (clean URL přes `index.html` v podsložce) |
| `site/files/` | všechny obrázky (včetně responsive variant) |
| `site/assets/` | CSS a další assety |
| `site/js/contact-form-patch.js` | JS, který přesměruje formulář na Web3Forms |
| `_scrape/` | skripty pro stažení webu (pro případné obnovení snímku) |
| `_source/` | surové stažené HTML z customo.eu (referenční archiv, v `.gitignore`) |

## Lokální náhled

```bash
# potřebuje jen Node (žádné pnpm install)
npx serve site -l 4321
# otevři http://localhost:4321
```

## Deploy

Každý `git push` do `main` → [GitHub Actions](.github/workflows/deploy.yml) nahraje obsah `site/` na GitHub Pages.

**Před prvním deployem:**

1. Na GitHubu vytvoř repo a pushni sem.
2. V repu → **Settings → Secrets and variables → Actions** přidej secret `WEB3FORMS_KEY` (access key z [web3forms.com](https://web3forms.com)).
3. V **Settings → Pages** nastav source na „GitHub Actions".
4. Počkej na první deploy, ověř na `https://<user>.github.io/<repo>/`.
5. U registrátora `customo.eu` nastav DNS:
   - `A` záznamy pro `customo.eu` na `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
   - `CNAME` pro `www` na `<user>.github.io`
6. V GitHub Settings → Pages zapni **Enforce HTTPS**.

## Editace obsahu

Viz [CLAUDE.md](./CLAUDE.md) — jak upravit texty, přidat článek nebo nahrát nové obrázky pomocí Claude Code.

## Obnova z customo.eu (reset)

Dokud běží původní SolidPixels, můžeš si kopii vždy znovu stáhnout:

```bash
cd _scrape
pnpm install
node scrape.mjs        # uloží raw HTML do _source/
node mirror.mjs        # postaví site/ z _source/
```
