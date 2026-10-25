const { test } = require("node:test");
const assert = require("node:assert/strict");
const { translate: t, translateMessage: tm } = require("../desktop/i18n.mjs");
const english = require("../desktop/locales/en.json");

test("translations preserve every positional argument", () => {
  const slots = (text) =>
    [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
  for (const [key, value] of Object.entries(english)) {
    assert.equal(typeof value, "string", key);
    assert.ok(value.trim(), key);
    assert.deepEqual(slots(value), slots(key), key);
  }
});

test("UI language leaves book metadata and interpolation arguments intact", () => {
  assert.equal(t("zh", "全部图书"), "全部图书");
  assert.equal(t("en", "全部图书"), "All Books");
  assert.equal(t("en", "阅读 {0}", ["全部图书"]), "Read 全部图书");
  assert.equal(
    t("en", "阅读 {0}", ["My {1} 中文书名"]),
    "Read My {1} 中文书名",
  );
  assert.equal(t("en", "Unknown text"), "Unknown text");
});

test("stored service messages translate in either direction including nested errors", () => {
  assert.equal(tm("en", "已加入 3 本图书"), "Added 3 books");
  assert.equal(tm("zh", "Added 3 books"), "已加入 3 本图书");
  const message = "无法读取书库：云盘正文 SHA-256 校验失败";
  const translated =
    "Could not load the library: Cloud book SHA-256 verification failed";
  assert.equal(tm("en", message), translated);
  assert.equal(tm("zh", translated), message);
  assert.equal(
    tm("en", "2 / 9 · 本章（正在索引）"),
    "2 / 9 · This chapter (indexing)",
  );
  assert.equal(tm("en", "PDF 第 2 页"), "PDF page 2");
  assert.equal(
    tm(
      "en",
      "Error invoking remote method 'book:read': Error: 云盘正文 SHA-256 校验失败",
    ),
    "Cloud book SHA-256 verification failed",
  );
  assert.equal(
    tm("en", "A provider-specific message"),
    "A provider-specific message",
  );
});
