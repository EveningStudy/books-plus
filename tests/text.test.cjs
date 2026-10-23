const { test } = require("node:test");
const assert = require("node:assert/strict");
test("multilingual speech chunks preserve exact source ranges and complete words", async () => {
  const { splitText } = await import("../src/reader/text.ts");
  const text =
    "  第一行有引号：「开始阅读。」下一句。\nThis is one sentence. Here is another! " +
    "A longer English paragraph with complete words and punctuation. ".repeat(
      8,
    ) +
    "最后一行😀。";
  const chunks = splitText(text);
  assert.ok(chunks.some((c) => c.text === "This is one sentence."));
  assert.ok(
    chunks.every(
      (c) => text.slice(c.start, c.end) === c.text && c.text.length <= 180,
    ),
  );
  assert.ok(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c.text)));
  assert.equal(
    chunks
      .map((c) => c.text)
      .join("")
      .replace(/\s/g, ""),
    text.replace(/\s/g, ""),
  );
});
