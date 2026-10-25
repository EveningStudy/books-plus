// Offline validation: local Markdown/HTML links, images, heading anchors and PNG/SVG files.
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
async function walk(dir) {
  const files = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
    .replace(/\s/g, "-");
async function main() {
  const { marked } = await import("marked");
  const all = await walk(path.join(root, "docs"));
  const files = [
    path.join(root, "README.md"),
    ...all.filter((p) => p.endsWith(".md")),
  ];
  const problems = [];
  let links = 0;
  const anchors = new Map();
  for (const f of files) {
    const ids = new Set(),
      counts = new Map();
    const tokens = marked.lexer(await fs.readFile(f, "utf8"));
    marked.walkTokens(tokens, (t) => {
      if (t.type === "heading") {
        const base = slug(t.text),
          n = counts.get(base) || 0;
        counts.set(base, n + 1);
        ids.add(base + (n ? "-" + n : ""));
      }
    });
    anchors.set(f, ids);
  }
  for (const f of files) {
    const source = await fs.readFile(f, "utf8"),
      refs = [];
    marked.walkTokens(marked.lexer(source), (t) => {
      if (t.type === "link" || t.type === "image") refs.push(t.href);
    });
    for (const m of source.matchAll(/\b(?:src|href)="([^"]+)"/g))
      refs.push(m[1]);
    for (const href of refs) {
      if (/^(?:https?:|mailto:|data:)/i.test(href)) continue;
      links++;
      const [target, hash] = href.split("#");
      let resolved;
      try {
        resolved = path.resolve(
          path.dirname(f),
          decodeURIComponent(target || ""),
        );
        if (!target) resolved = f;
        await fs.access(resolved);
        if (
          hash &&
          anchors.has(resolved) &&
          !anchors.get(resolved).has(decodeURIComponent(hash))
        )
          problems.push(`${path.relative(root, f)}: missing anchor ${href}`);
      } catch {
        problems.push(`${path.relative(root, f)}: missing file ${href}`);
      }
    }
  }
  let bytes = 0,
    pngs = 0,
    svgs = 0;
  for (const f of all.filter((p) => /\.(png|svg)$/.test(p))) {
    const b = await fs.readFile(f);
    bytes += b.length;
    if (f.endsWith(".png")) {
      pngs++;
      if (b.readUInt32BE(0) !== 0x89504e47) problems.push(`${f}: invalid PNG`);
    } else {
      svgs++;
      const { DOMParser } = require("@xmldom/xmldom");
      try {
        const doc = new DOMParser({
          onError: (level, msg) => {
            throw Error(msg);
          },
        }).parseFromString(b.toString(), "image/svg+xml");
        if (doc.documentElement.tagName !== "svg") throw Error("not svg");
      } catch (e) {
        problems.push(`${f}: ${e.message}`);
      }
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  }
  console.log(
    JSON.stringify(
      {
        markdownFiles: files.length,
        localLinks: links,
        screenshots: pngs,
        diagrams: svgs,
        imageMiB: +(bytes / 1048576).toFixed(2),
        problems: problems.length,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
