# CWO Strategy Group — Site v4

Static site. **Zero dependencies. Zero CDN requests. No build step.**
Drop these files in one flat folder and it works.

---

## 1. What changed in v4

Two fixes only. Everything else from v3 is unchanged.

### The horizontal rail

The pinned sideways-scrolling sections were broken. Three causes, all fixed:

| Cause | Fix |
|---|---|
| `.rail__track` also carried the `.wrap` class, so `max-width: 1180px` capped its width. `scrollWidth - innerWidth` came out at zero or negative, so there was nothing to travel across. | `.wrap` removed from the track. The track is now an unbounded flex row and the horizontal padding is handled by `padding-inline: max(var(--pad), (100vw - maxw)/2)`. |
| The rail section had no explicit height, so pin duration and horizontal travel were unrelated — motion either finished instantly or juddered. | JS now **writes** `rail.style.height = stickyHeight + travel`. One pixel of vertical scroll moves the track exactly one pixel sideways. |
| Rail panels used `.reveal`, but an element parked off-screen to the right never intersects the viewport, so IntersectionObserver never fired and panels stayed invisible. | Rail children are excluded from the reveal observer and are visible by default. |

Also added: a fourth panel to each rail (three panels rarely overflow a wide
monitor, which made the pin look like it did nothing), re-measurement on resize
and after `window.load`, sub-pixel rounding to stop text shimmer, and a
`translate3d` transform to keep it on the compositor.

### Navigation

Every page now carries the **identical 7-link nav**: Services, Process,
Testimonials, FAQ, About, Client Login, Start a Project. Previously `login.html`,
`reset-password.html`, `404.html`, and the legal pages each had a different
subset, so links vanished depending on where you were.

Cross-page anchors are absolute-by-file — `index.html#services` rather than
`#services` — so Services and Process work from every page, not just the
homepage. The mobile drawer also gained a Home link in its footer area.

Every footer is now the same 4-column structure. Every link on every page
resolves to a real file.

---

## 2. Complete file list

Every file goes in the **same folder**. No subfolders. Exact lowercase names.

```
index.html              Homepage
about.html              About + leadership
testimonials.html       Client quotes
start-a-project.html    Lead capture form
login.html              Client sign-in            [noindex]
reset-password.html     Password recovery         [noindex]
portal.html             Client dashboard          [noindex]
privacy-policy.html     Privacy policy
terms.html              Terms of service
accessibility.html      WCAG 2.1 AA statement
404.html                Custom error page         [noindex]

styles.css              Entire design system
scroll.js               Scroll engine + nav + forms
portal.js               Dashboard logic

favicon.svg             Brand mark
site.webmanifest        PWA manifest
robots.txt              Crawler rules + AI allowlist
sitemap.xml             Indexable pages
llms.txt                Brief for AI answer engines
netlify.toml            Headers, HTTPS, redirects, caching
README.md               This file
```

**20 files.** If a file isn't on this list, you don't need it.

Unchanged from v3 and safe to keep as-is: `portal.js`, `favicon.svg`,
`site.webmanifest`, `robots.txt`, `sitemap.xml`, `llms.txt`, `netlify.toml`.

---

## 3. Run it locally

```bash
cd path/to/the/folder     # the folder containing index.html
python3 -m http.server 8000
```

Open **http://localhost:8000**.

Double-clicking `index.html` also works — all asset paths are relative.

### If it looks unstyled

1. Open `styles.css` in a text editor. First line should be `/* ====`.
   If it starts with `<!DOCTYPE html>`, you saved a web page instead of the file.
2. Check the filename is exactly `styles.css` — not `styles.css.txt`.
3. `styles.css` must sit **next to** `index.html`, not in a `/css/` folder.

---

## 4. Testing the rail

The pinned horizontal sections only engage **above 900px wide** and only when
`prefers-reduced-motion` is off. That's deliberate — sideways scroll-jacking on
a phone is hostile.

To verify it works:

1. Open the homepage on a desktop browser at 1200px+ wide.
2. Scroll to the Services section. The section should pin in place and the four
   cards should slide left as you continue scrolling.
3. The `Keep scrolling →` hint sits at the bottom of the pinned viewport.
4. Narrow the window below 900px. The rail should immediately become a normal
   vertical stack of cards with no pinning.

If it doesn't pin: open DevTools console. Any `[cwo] module failed` warning
names the culprit. If there's no warning, check that `.rail__track` in your HTML
does **not** also have the `wrap` class.

---

## 5. Performance

| Metric | Value |
|---|---|
| Total page weight | ~48 KB uncompressed, ~15 KB gzipped |
| HTTP requests | 3 (HTML, CSS, JS) |
| Third-party requests | **0** |
| Blocking resources | 1 (the stylesheet) |
| Raster images | 0 — everything is SVG, CSS, or text |

---

## 6. Deploy

### Netlify / Cloudflare Pages / Vercel
Push the folder. `netlify.toml` handles HTTPS, security headers, caching,
redirects, and the custom 404.

### Traditional hosting (cPanel)
Upload everything to `public_html/`. Apache and Nginx config blocks are in the
comments at the bottom of `netlify.toml`.

### GitHub Pages / subfolder hosting
Works as-is — paths are relative. One exception: `404.html` uses root-absolute
paths, because a 404 can be served from any URL depth, so it only renders
correctly from a domain root.

---

## 7. Wire up the forms

Four forms currently post to `action="#"`, which triggers the demo handler in
`scroll.js`. Each has a custom success message via `data-success`.

**Netlify Forms** (easiest — zero backend)
```html
<form data-netlify="true" netlify-honeypot="company_url" method="post" action="/thanks">
```

**Formspree**
```html
<form method="post" action="https://formspree.io/f/YOUR_ID">
```

The honeypot field (`company_url`) and the 2.5-second timing floor are already
wired into every form.

---

## 8. Pre-launch checklist

- [ ] Add a real phone number to the nav drawer and footer, or leave email only
- [ ] Replace `SERVER_RENDERS_CSRF_TOKEN` in `login.html`, `reset-password.html`,
      and `portal.html` with a real server-rendered token
- [ ] Point the four forms at a real endpoint
- [ ] Create and verify a **Google Business Profile** — the single biggest local
      ranking factor, and nothing in this repo substitutes for it
- [ ] Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools
- [ ] Add an OG share image at `/assets/og-cover.jpg` (1200×630) and add the
      `og:image` tags if you want rich link previews
- [ ] Run Lighthouse — should score 100 across the board
- [ ] Test the rail on a real desktop and the drawer on a real phone

---

## 9. Making changes

**Colours, spacing, type scale** — all tokens are at the top of `styles.css`
under `:root`.

**Add a scroll-revealed element** — give it `class="reveal"`, optionally
`style="--d:1"` to stagger it behind siblings. Do **not** put `.reveal` on
anything inside a `.rail`.

**Add a counting number** — `<span data-count="1250">0</span>`, plus
`data-suffix="%"` or `data-prefix="$"`.

**Add a horizontal rail:**
```html
<section class="rail" data-rail aria-label="...">
  <div class="rail__sticky">
    <div class="rail__track">          <!-- NEVER add .wrap here -->
      <div class="rail__head">…</div>
      <article class="rail__panel">…</article>
      <!-- 3+ panels, or there won't be enough overflow to pin -->
    </div>
  </div>
  <span class="rail__hint" aria-hidden="true">Keep scrolling &rarr;</span>
</section>
```
Height and pin duration are calculated automatically. Don't set them yourself.
