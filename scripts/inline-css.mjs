import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "assets/styles.css"), "utf8").trim();
const pages = [
  "index.html",
  "articles/local-toolchain-state-ownership.html",
];
const analyticsBlock =
  '    <!-- Cloudflare Web Analytics -->\n' +
  '    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"7cb07b7a4b6644b89e8227d8504f08f1"}\'></script>\n' +
  "    <!-- End Cloudflare Web Analytics -->";

const styleBlock = [
  '    <style data-inline-source="/assets/styles.css">',
  "      /* Inlined to avoid an extra render-blocking request on slow routes. */",
  ...css.split("\n").map((line) => (line ? `      ${line}` : "")),
  "    </style>",
].join("\n");

for (const page of pages) {
  const path = join(root, page);
  const html = readFileSync(path, "utf8");
  const next = html.replace(
    /    <link rel="stylesheet" href="\/assets\/styles\.css">|    <style data-inline-source="\/assets\/styles\.css">[\s\S]*?    <\/style>/,
    styleBlock,
  );

  if (next === html) {
    if (html.includes(styleBlock)) {
      continue;
    }

    throw new Error(`Could not find stylesheet marker in ${page}`);
  }

  writeFileSync(path, next);
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        return [];
      }

      return htmlFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".html")
      ? [relative(root, path)]
      : [];
  });
}

for (const page of htmlFiles(root)) {
  const path = join(root, page);
  const html = readFileSync(path, "utf8");
  const withoutExistingAnalytics = html.replace(
    /\n?    <!-- Cloudflare Web Analytics -->\n    <script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='[^']*'><\/script>\n    <!-- End Cloudflare Web Analytics -->/g,
    "",
  );
  const next = withoutExistingAnalytics.replace(
    /\n  <\/body>/,
    `\n${analyticsBlock}\n  </body>`,
  );

  if (next === withoutExistingAnalytics) {
    throw new Error(`Could not find body close marker in ${page}`);
  }

  writeFileSync(path, next);
}
