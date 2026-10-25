// Run after test-two-host using the same private config. Uses the first completed provider fixture.
const { spawn } = require("node:child_process"),
  readline = require("node:readline"),
  path = require("node:path"),
  fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
function peer(command, args) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] }),
    pending = new Map();
  let seq = 0;
  let readyResolve, readyReject;
  const ready = new Promise((r, j) => {
    readyResolve = r;
    readyReject = j;
  });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.ready) readyResolve();
      else if (pending.has(msg.seq)) {
        const { r, j } = pending.get(msg.seq);
        pending.delete(msg.seq);
        msg.ok ? r(msg) : j(Error(msg.error));
      }
    } catch {}
  });
  child.stderr.on("data", (b) => process.stderr.write(b));
  child.on("exit", (code) => {
    readyReject(Error("peer exited " + code));
    for (const { j } of pending.values()) j(Error("peer exited " + code));
  });
  return {
    ready,
    child,
    send(action, value) {
      const n = ++seq;
      return new Promise((r, j) => {
        pending.set(n, { r, j });
        child.stdin.write(JSON.stringify({ seq: n, action, value }) + "\n");
      });
    },
  };
}
(async () => {
  const c = JSON.parse(await fs.readFile(process.argv[2], "utf8")),
    previous = JSON.parse(
      await fs.readFile(path.join(c.evidence, "result.json"), "utf8"),
    );
  const provider = c.providers[0],
    book = previous.results.find(
      (r) => r.provider === provider.name && r.passed,
    ).book;
  const base = path.join(c.evidence, "ui-" + provider.name);
  await fs.mkdir(base, { recursive: true });
  const winConfig = {
    root: provider.windows,
    id: book.id,
    user: path.join(base, "windows"),
    app: path.resolve("release/win-unpacked/Books+.exe"),
  };
  const macConfig = {
    root: provider.mac,
    id: book.id,
    user: c.macRepo + "/.qa/two-host-ui/" + c.run + "-" + provider.name,
    app: c.macRepo + "/release/mac-arm64/Books+.app/Contents/MacOS/Books+",
  };
  const win = peer(process.execPath, [
    "scripts/test-cloud-ui-peer.cjs",
    Buffer.from(JSON.stringify(winConfig)).toString("base64"),
  ]);
  const mac = peer("ssh", [
    "-F",
    "NUL",
    "-i",
    c.key,
    "-o",
    "BatchMode=yes",
    c.host,
    quote(c.macNode) +
      " " +
      quote(c.macRepo + "/scripts/test-cloud-ui-peer.cjs") +
      " " +
      Buffer.from(JSON.stringify(macConfig)).toString("base64"),
  ]);
  const results = [];
  const doStep = async (p, name, value) => {
    const start = Date.now();
    const result = await p.send(name, value);
    results.push({
      step: name,
      at: new Date().toISOString(),
      seconds: (Date.now() - start) / 1000,
      ...result,
    });
    console.log(name, "PASS");
    return result;
  };
  try {
    await Promise.all([win.ready, mac.ready]);
    await doStep(win, "open");
    const first = await doStep(win, "turn");
    await doStep(mac, "wait-reading", first.state.reading.cfi);
    await doStep(mac, "open");
    const second = await doStep(mac, "turn", 3);
    assert.notEqual(second.state.reading.cfi, first.state.reading.cfi);
    await doStep(win, "wait-reading", second.state.reading.cfi);
    await doStep(win, "accept");
    const accepted = await doStep(win, "screenshot", "accepted-remote");
    assert.equal(
      accepted.state.reading.originDeviceId,
      second.state.reading.originDeviceId,
      "accepting remote position must not echo a new local session",
    );
    await doStep(mac, "bookmark");
    await doStep(mac, "back");
    await doStep(mac, "delete");
    await doStep(win, "wait-deleted");
    await doStep(win, "screenshot", "remote-deleted");
    const restored = await doStep(win, "restore");
    assert.ok(
      Object.values(restored.state.marks).some(
        (m) => !m.deleted && m.type === "bookmark",
      ),
    );
    await doStep(mac, "wait-restored");
    await doStep(mac, "screenshot", "restored");
    await fs.writeFile(
      path.join(base, "result.json"),
      JSON.stringify(
        { provider: provider.name, passed: true, results },
        null,
        2,
      ),
    );
    console.log(
      "PASS two real packaged apps: page turns, remote resume, no echo, bookmark, active deletion and restore",
    );
  } finally {
    await Promise.allSettled([win.send("quit"), mac.send("quit")]);
    win.child.stdin.end();
    mac.child.stdin.end();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
