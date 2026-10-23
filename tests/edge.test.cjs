const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { WebSocketServer } = require("ws");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { synthesizeEdge } = require("../desktop/edge-client.cjs");
const { generateSecMsGecToken_V2 } = require("../desktop/edge-gec.cjs");
const config = {
  voice: "zh-CN-XiaoxiaoNeural",
  lang: "zh-CN",
  rate: "+20%",
  pitch: "+5Hz",
};

function audioFrame(audio) {
  const h = Buffer.from(
    "X-RequestId:test\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n",
  );
  const size = Buffer.alloc(2);
  size.writeUInt16BE(h.length);
  return Buffer.concat([size, h, audio]);
}
function complete(ws, audio = Buffer.alloc(256, 7)) {
  ws.send(
    "Path:audio.metadata\r\n\r\n" +
      JSON.stringify({
        Metadata: [
          {
            Type: "WordBoundary",
            Data: {
              Offset: 1000000,
              Duration: 500000,
              text: { Text: "A &amp; B" },
            },
          },
        ],
      }),
  );
  ws.send(audioFrame(audio));
  ws.send("Path:turn.end\r\n\r\n");
}
async function mock(t, upgrade, speech) {
  let requests = 0;
  const urls = [],
    wss = new WebSocketServer({ noServer: true });
  const server = http.createServer();
  server.on("upgrade", (req, socket, head) => {
    const count = ++requests;
    urls.push(new URL(req.url, "http://localhost"));
    if (upgrade?.(count, req, socket) === false) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("message", (data) => {
        if (data.toString().includes("Path:ssml\r\n"))
          speech?.(count, ws, data.toString());
      });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "books-edge-test-"));
  t.after(async () => {
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
    await fs.rm(base, { recursive: true, force: true });
  });
  return {
    file: path.join(base, "test.mp3"),
    urls,
    options: {
      endpoints: [
        `ws://127.0.0.1:${server.address().port}/primary`,
        `ws://127.0.0.1:${server.address().port}/backup`,
      ],
      timeoutMs: 2000,
      attemptTimeoutMs: 500,
    },
    requests: () => requests,
  };
}
test("GEC v2 matches upstream vectors and five-minute buckets", () => {
  assert.equal(
    generateSecMsGecToken_V2(1700000000),
    "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2",
  );
  assert.equal(
    generateSecMsGecToken_V2(1792713600),
    "B835E1AB1DD4068C-C40CCC1D78908E1C2067C3B99AF1769C71D81C1A98474FA1331B5D40D1519E1B",
  );
  assert.equal(
    generateSecMsGecToken_V2(1792713600),
    generateSecMsGecToken_V2(1792713899),
  );
  assert.notEqual(
    generateSecMsGecToken_V2(1792713600),
    generateSecMsGecToken_V2(1792713900),
  );
});
test("HTTP 200 handshake automatically retries on the backup, preserving SSML and word cues", async (t) => {
  let ssml;
  const m = await mock(
    t,
    (n, req, socket) => {
      if (n === 1) {
        socket.end(
          "HTTP/1.1 200 OK\r\nContent-Length:2\r\nConnection:close\r\n\r\nOK",
        );
        return false;
      }
    },
    (n, ws, message) => {
      ssml = message;
      complete(ws);
    },
  );
  await synthesizeEdge(config, "A & B < C\x0B", m.file, m.options);
  assert.equal(m.requests(), 2);
  assert.deepEqual(
    m.urls.map((u) => u.pathname),
    ["/primary", "/backup"],
  );
  assert.match(m.urls[0].searchParams.get("Sec-MS-GEC-Version"), /^2-/);
  assert.match(ssml, /rate="\+20%" pitch="\+5Hz"/);
  assert.match(ssml, /A &amp; B &lt; C /);
  assert.deepEqual(await fs.readFile(m.file), Buffer.alloc(256, 7));
  assert.deepEqual(JSON.parse(await fs.readFile(m.file + ".json", "utf8")), [
    { part: "A & B", start: 100, end: 150 },
  ]);
});
test("an interrupted turn is discarded before retry, including its subtitles", async (t) => {
  const m = await mock(t, null, (n, ws) => {
    if (n === 1) {
      ws.send(audioFrame(Buffer.alloc(128, 9)));
      ws.send(
        "Path:audio.metadata\r\n\r\n" +
          JSON.stringify({
            Metadata: [
              {
                Type: "WordBoundary",
                Data: { Offset: 0, Duration: 1, text: { Text: "discard" } },
              },
            ],
          }),
      );
      ws.close();
    } else complete(ws);
  });
  await synthesizeEdge(config, "A & B", m.file, m.options);
  assert.equal(m.requests(), 2);
  assert.deepEqual(await fs.readFile(m.file), Buffer.alloc(256, 7));
  assert.equal(
    JSON.parse(await fs.readFile(m.file + ".json", "utf8")).length,
    1,
  );
});
test("403 retries with server time when the device clock differs", async (t) => {
  const date = "Thu, 01 Jan 2026 00:00:00 GMT";
  const m = await mock(
    t,
    (n, req, socket) => {
      if (n === 1) {
        socket.end(
          `HTTP/1.1 403 Forbidden\r\nDate:${date}\r\nContent-Length:0\r\nConnection:close\r\n\r\n`,
        );
        return false;
      }
    },
    (n, ws) => complete(ws),
  );
  await synthesizeEdge(config, "A & B", m.file, m.options);
  assert.equal(
    m.urls[1].searchParams.get("Sec-MS-GEC"),
    generateSecMsGecToken_V2(Date.parse(date) / 1000),
  );
});
test("persistent HTTP 200 stops after three attempts and creates no cache files", async (t) => {
  const m = await mock(t, (n, req, socket) => {
    socket.end(
      "HTTP/1.1 200 OK\r\nContent-Length:0\r\nConnection:close\r\n\r\n",
    );
    return false;
  });
  await assert.rejects(
    synthesizeEdge(config, "test", m.file, m.options),
    /已自动重试.*HTTP 200/,
  );
  assert.equal(m.requests(), 3);
  assert.deepEqual(await fs.readdir(path.dirname(m.file)), []);
});
test("a stalled socket respects the total deadline and writes no partial audio", async (t) => {
  const m = await mock(t, null, (n, ws) =>
    ws.send(audioFrame(Buffer.alloc(128, 9))),
  );
  const start = Date.now();
  await assert.rejects(
    synthesizeEdge(config, "test", m.file, {
      ...m.options,
      timeoutMs: 180,
      attemptTimeoutMs: 80,
    }),
    /超时/,
  );
  assert.ok(Date.now() - start < 1200);
  assert.ok(m.requests() <= 3);
  assert.deepEqual(await fs.readdir(path.dirname(m.file)), []);
});
test("turn.end without audio and malformed binary frames fail without caching", async (t) => {
  for (const type of ["empty", "malformed"]) {
    const m = await mock(t, null, (n, ws) =>
      type === "empty"
        ? ws.send("Path:turn.end\r\n\r\n")
        : ws.send(Buffer.from([255, 255, 1])),
    );
    await assert.rejects(
      synthesizeEdge(config, "test", m.file, m.options),
      type === "empty" ? /没有返回有效音频/ : /帧长度无效/,
    );
    assert.equal(m.requests(), 3);
    assert.deepEqual(await fs.readdir(path.dirname(m.file)), []);
  }
});
