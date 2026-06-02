# jaryarbn.github.io

Personal technical notes published with GitHub Pages.

This site is intentionally static: HTML, CSS, and Markdown source notes only.
GitHub Pages can publish it from the repository root without a build step.

The stylesheet is inlined into the published HTML to avoid an extra
render-blocking request on slow `github.io` routes. Edit `assets/styles.css`,
then run:

```bash
node scripts/inline-css.mjs
```

## Local Preview

Open `index.html` directly in a browser, or run a tiny local server:

```bash
python3 -m http.server 8080
```

Then visit `http://127.0.0.1:8080/`.

## Structure

- `index.html` - homepage and article list
- `articles/` - published article HTML
- `writing/` - Markdown source drafts
- `assets/styles.css` - site styles
- `scripts/inline-css.mjs` - syncs the stylesheet into published HTML
