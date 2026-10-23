import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
const server = await createServer();
await server.listen();
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, READER_DEV_URL: "http://127.0.0.1:5173" },
});
child.on("exit", async () => {
  await server.close();
  process.exit();
});
process.on("SIGINT", () => child.kill());
