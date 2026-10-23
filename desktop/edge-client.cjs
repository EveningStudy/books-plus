const WebSocket = require("ws");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const {
  generateSecMsGecToken_V2,
  TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION_V2,
  CHROMIUM_FULL_VERSION,
} = require("./edge-gec.cjs");

// Both endpoints are Microsoft Edge Read Aloud. Never send text to another provider.
const ENDPOINTS = [
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
  "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1",
];
const id = () => randomBytes(16).toString("hex");
const escapeXml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const unescapeXml = (s) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (s, key) => {
    if (!key.startsWith("#"))
      return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[
        key.toLowerCase()
      ];
    const n =
      key[1].toLowerCase() === "x"
        ? parseInt(key.slice(2), 16)
        : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : s;
  });
function headers(s) {
  return Object.fromEntries(
    s
      .split("\r\n")
      .filter((line) => line.includes(":"))
      .map((line) => {
        const i = line.indexOf(":");
        return [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()];
      }),
  );
}
function requestUrl(endpoint, now) {
  const url = new URL(endpoint);
  url.searchParams.set(
    url.hostname === "api.msedgeservices.com"
      ? "Ocp-Apim-Subscription-Key"
      : "TrustedClientToken",
    TRUSTED_CLIENT_TOKEN,
  );
  url.searchParams.set("ConnectionId", id());
  url.searchParams.set("Sec-MS-GEC", generateSecMsGecToken_V2(now / 1000));
  url.searchParams.set("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION_V2);
  return url;
}

function attempt(endpoint, config, text, timeoutMs, clockOffset) {
  return new Promise((resolve, reject) => {
    let settled = false,
      bytes = 0;
    const audio = [],
      subtitles = [];
    const ws = new WebSocket(requestUrl(endpoint, Date.now() + clockOffset), {
      handshakeTimeout: Math.min(5000, timeoutMs),
      maxPayload: 16 * 1024 * 1024,
      origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION} Safari/537.36 Edg/${CHROMIUM_FULL_VERSION}`,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `muid=${id().toUpperCase()};`,
      },
    });
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Keep the error listener until termination completes, including failed handshakes.
      ws.terminate();
      error
        ? reject(error)
        : resolve({ audio: Buffer.concat(audio), subtitles });
    };
    const timer = setTimeout(() => finish(Error("连接或合成超时")), timeoutMs);
    ws.on("unexpected-response", (req, res) => {
      const error = Error(`握手响应 HTTP ${res.statusCode}`);
      error.status = res.statusCode;
      const serverTime = Date.parse(res.headers.date);
      if (Number.isFinite(serverTime))
        error.clockOffset = serverTime - Date.now();
      finish(error);
      res.destroy();
      req.destroy();
    });
    ws.on("error", (error) => finish(error));
    ws.on("close", () => finish(Error("连接中断，音频未完成")));
    ws.on("open", () => {
      if (settled) return;
      const timestamp = new Date(Date.now() + clockOffset).toUTCString();
      ws.send(
        `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "true",
                  },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          }),
      );
      const clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
      ws.send(
        `X-RequestId:${id()}\r\nX-Timestamp:${timestamp}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
          `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(config.lang)}"><voice name="${escapeXml(config.voice)}"><prosody rate="${escapeXml(config.rate)}" pitch="${escapeXml(config.pitch)}" volume="+0%">${escapeXml(clean)}</prosody></voice></speak>`,
      );
    });
    ws.on("message", (data, binary) => {
      if (settled) return;
      try {
        if (binary) {
          if (data.length < 2) throw Error("音频帧缺少长度");
          const end = 2 + data.readUInt16BE(0);
          if (end > data.length) throw Error("音频帧长度无效");
          const h = headers(data.subarray(2, end).toString());
          if (h.path !== "audio") throw Error("音频帧类型无效");
          const chunk = data.subarray(end);
          if (!chunk.length && !h["content-type"]) return;
          if (h["content-type"] !== "audio/mpeg" || !chunk.length)
            throw Error("音频内容无效");
          bytes += chunk.length;
          if (bytes > 16 * 1024 * 1024) throw Error("音频超过长度限制");
          audio.push(chunk);
        } else {
          const message = data.toString(),
            split = message.indexOf("\r\n\r\n");
          if (split < 0) throw Error("语音响应格式无效");
          const h = headers(message.slice(0, split));
          if (h.path === "turn.end") {
            finish(bytes > 44 ? null : Error("语音服务没有返回有效音频"));
          } else if (h.path === "audio.metadata") {
            for (const item of JSON.parse(message.slice(split + 4)).Metadata ||
              []) {
              const d = item.Data;
              if (
                item.Type === "WordBoundary" &&
                typeof d?.text?.Text === "string" &&
                Number.isFinite(d.Offset) &&
                Number.isFinite(d.Duration)
              )
                subtitles.push({
                  part: unescapeXml(d.text.Text),
                  start: d.Offset / 10000,
                  end: (d.Offset + d.Duration) / 10000,
                });
            }
          } else if (
            h.path === "response" &&
            h["x-responsecode"] &&
            h["x-responsecode"] !== "200"
          ) {
            throw Error("语音服务拒绝合成");
          }
        }
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function synthesizeEdge(config, text, file, options = {}) {
  const endpoints = options.endpoints || ENDPOINTS;
  const deadline = Date.now() + (options.timeoutMs ?? config.timeout ?? 25000);
  let error,
    clockOffset = 0;
  let result;
  for (let i = 0; i < 3 && Date.now() < deadline; i++) {
    try {
      result = await attempt(
        endpoints[i % endpoints.length],
        config,
        text,
        Math.min(options.attemptTimeoutMs ?? 14000, deadline - Date.now()),
        clockOffset,
      );
      break;
    } catch (e) {
      error = e;
      // A 403 can mean the device clock differs from Microsoft's clock.
      if (e.status === 403 && Number.isFinite(e.clockOffset))
        clockOffset = e.clockOffset;
    }
  }
  if (!result)
    throw Error(
      `Edge 连接失败，已自动重试。请稍后重试或检查网络（${error?.message || "连接超时"}）`,
    );
  // Only complete turns reach disk. Failed attempts cannot poison the audio cache.
  try {
    await fs.writeFile(file, result.audio);
    await fs.writeFile(file + ".json", JSON.stringify(result.subtitles));
  } catch (e) {
    await Promise.all(
      [file, file + ".json"].map((p) =>
        fs.rm(p, { force: true }).catch(() => {}),
      ),
    );
    throw e;
  }
}
module.exports = { synthesizeEdge };
