// Controlled UI peer for a real two-computer acceptance run. NDJSON over SSH is control only.
const { _electron: electron } = require("playwright"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  readline = require("node:readline"),
  assert = require("node:assert/strict");
const { atomicJson } = require("../desktop/library.cjs");
(async () => {
  const c = JSON.parse(Buffer.from(process.argv[2], "base64").toString());
  assert.ok(path.basename(c.root).startsWith("BooksPlus QA "));
  await atomicJson(path.join(c.user, "config.json"), {
    settings: {
      mac: { mode: "reader", writeback: false, login: false },
      updates: { autoCheck: false },
      reading: { pageTurn: "none" },
    },
  });
  const app = await electron.launch({
    executablePath: c.app,
    env: {
      ...process.env,
      READER_USER_DATA: c.user,
      READER_LIBRARY_ROOT: c.root,
    },
    timeout: 30000,
  });
  const p = await app.firstWindow();
  p.setDefaultTimeout(180000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.waitForSelector(".library-header");
  const state = () =>
    p.evaluate(async (id) => {
      const data = await window.reader.load();
      return [...data.books, ...data.trash].find((b) => b.id === id)?.state;
    }, c.id);
  console.log(JSON.stringify({ ready: true }));
  let queue = Promise.resolve();
  readline
    .createInterface({ input: process.stdin })
    .on("line", (line) => {
      queue = queue.then(async () => {
        const { seq, action, value } = JSON.parse(line);
        try {
          if (action === "open") {
            await p
              .getByRole("button", {
                name: "阅读 Synthetic 双机验收",
                exact: true,
              })
              .click();
            await p.waitForSelector(".epub-container iframe");
            await p.waitForTimeout(1200);
          } else if (action === "turn") {
            for (let i = 0; i < (value || 2); i++) {
              await p.keyboard.press("ArrowRight");
              await p.waitForTimeout(180);
            }
            await p.waitForTimeout(1100);
            assert.ok((await state()).reading.cfi);
          } else if (action === "wait-reading") {
            await p.waitForFunction(
              async ({ id, cfi }) =>
                (await window.reader.load()).books.find((b) => b.id === id)
                  ?.state.reading?.cfi === cfi,
              { id: c.id, cfi: value },
            );
          } else if (action === "accept") {
            await p
              .getByRole("button", { name: "接着读", exact: true })
              .click();
            await p.waitForTimeout(1200);
          } else if (action === "back") {
            await p.getByRole("button", { name: "图书", exact: true }).click();
            await p.waitForSelector(".library-header");
          } else if (action === "bookmark") {
            await p
              .getByRole("button", { name: "添加书签", exact: true })
              .click();
          } else if (action === "delete") {
            const card = p
              .locator(".book-card")
              .filter({
                has: p.getByRole("button", {
                  name: "阅读 Synthetic 双机验收",
                  exact: true,
                }),
              });
            await card.locator("summary").click();
            await card
              .getByRole("button", { name: "删除图书…", exact: true })
              .click();
            await p
              .getByRole("button", { name: "移到最近删除", exact: true })
              .click();
            await card.waitFor({ state: "detached" });
          } else if (action === "wait-deleted") {
            await p.waitForSelector(".library-header");
            await p
              .getByText("这本书已在其他设备删除，可在最近删除中恢复。", {
                exact: true,
              })
              .waitFor();
            assert.equal((await state()).lifecycle.deleted, true);
          } else if (action === "restore") {
            await p
              .getByRole("button", { name: "最近删除", exact: true })
              .click();
            await p.locator(".book-menu summary").click();
            await p
              .getByRole("button", { name: "恢复图书", exact: true })
              .click();
            await p.waitForFunction(
              () => document.querySelectorAll(".book-card").length === 0,
            );
          } else if (action === "wait-restored") {
            await p
              .getByRole("button", {
                name: "阅读 Synthetic 双机验收",
                exact: true,
              })
              .waitFor();
          } else if (action === "screenshot") {
            await p.screenshot({ path: path.join(c.user, value + ".png") });
          } else if (action === "quit") {
            assert.deepEqual(errors, []);
            await app.close();
            console.log(JSON.stringify({ seq, ok: true, errors }));
            process.exit(0);
          }
          console.log(
            JSON.stringify({ seq, ok: true, state: await state(), errors }),
          );
        } catch (e) {
          console.log(JSON.stringify({ seq, ok: false, error: e.message }));
        }
      });
    })
    .on("close", () => {
      queue.finally(() => app.close());
    });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
