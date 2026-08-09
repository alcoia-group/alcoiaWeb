# alcoia — marketing site

Plain HTML, CSS and a little JavaScript. No framework, no bundler — a ~200-line
includes-only builder (`build.js`) stitches partials into pages and copies assets. See
`WEBSITE-BRIEF.md` in the source project for the full design/content brief this was built from.
 
## Local development

```bash
npm run dev
```

Builds `src/` → `dist/` and serves it at **http://localhost:8080** with clean URLs
(`/pricing`, not `/pricing.html`) and live rebuild on save. Just edit files under `src/` and
refresh the browser.

```bash
npm run build
```

One-shot build to `dist/`, no server. This is what Vercel runs.

## Deploying

1. **Push to a repo:**
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
   `dist/` and `node_modules/` are gitignored — Vercel builds `dist/` itself from source.

2. **Import into Vercel:** vercel.com → New Project → import the repo. `vercel.json` already
   sets the build command (`npm run build`), output directory (`dist`), and clean URLs, so the
   defaults should just work — no dashboard configuration needed.

## Before this goes live for real

A lot of content on this site is marked `TODO` on purpose — the domain, the GitHub repo URL,
the Chrome Web Store link, the legal entity/address in the footer and `/legal/imprint`, and
every `/legal/*` page needs a lawyer's review. Search the built site for `TODO` or grep
`src/` for `legal-todo` and `TODO:` to find them all.
