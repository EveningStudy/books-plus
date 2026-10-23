const { parentPort, workerData } = require("node:worker_threads");
const { EdgeTTS } = require("node-edge-tts");
// Keep the third party client's socket and file handles in a disposable worker.
// The parent also bounds connection establishment, which the client does not.
(async () => {
  const { config, text, file } = workerData;
  await new EdgeTTS(config).ttsPromise(text, file);
  parentPort.postMessage({ done: true });
})().catch((error) =>
  parentPort.postMessage({ error: error?.message || String(error) }),
);
