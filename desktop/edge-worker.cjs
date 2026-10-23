const { parentPort, workerData } = require("node:worker_threads");
const { synthesizeEdge } = require("./edge-client.cjs");
// Bound transport retries inside a disposable worker; the parent is a final deadline.
(async () => {
  const { config, text, file } = workerData;
  await synthesizeEdge(config, text, file);
  parentPort.postMessage({ done: true });
})().catch((error) =>
  parentPort.postMessage({ error: error?.message || String(error) }),
);
