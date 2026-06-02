import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(root, "assets/styles.css"), "utf8").trim();
const pages = [
  "index.html",
  "articles/agent-llm-harness.html",
];

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
    throw new Error(`Could not find stylesheet marker in ${page}`);
  }

  writeFileSync(path, next);
}
