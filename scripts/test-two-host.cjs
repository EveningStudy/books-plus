// Explicit opt-in: config supplies SSH and matching real provider roots on both hosts.
// SSH carries test instructions/results only. Books and state travel through the cloud provider.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { promisify } = require("node:util"),
  { execFile } = require("node:child_process");
const exec = promisify(execFile),
  { stage } = require("./test-cloud-stage.cjs");
const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
(async () => {
  const config = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  await fs.mkdir(config.evidence, { recursive: true });
  const output = { started: new Date().toISOString(), results: [] };
  for (const provider of config.providers) {
    const result = {
      provider: provider.name,
      steps: [],
      windowsRoot: provider.windows,
      macRoot: provider.mac,
    };
    const run = async (side, action, expected) => {
      const task = {
        root: provider[side],
        user:
          side === "windows"
            ? path.join(config.evidence, provider.name, "windows")
            : `${config.macRepo}/.qa/two-host/${config.run}/${provider.name}`,
        action,
        expected,
      };
      if (side === "windows") return stage(task);
      const command = `${quote(config.macNode)} ${quote(config.macRepo + "/scripts/test-cloud-stage.cjs")} ${Buffer.from(JSON.stringify(task)).toString("base64")}`;
      const { stdout } = await exec(
        "ssh",
        [
          "-F",
          "NUL",
          "-i",
          config.key,
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=10",
          config.host,
          command,
        ],
        { timeout: 45000 },
      );
      return JSON.parse(stdout.trim());
    };
    const wait = async (side, action, expected) => {
      const start = Date.now();
      let last;
      while (Date.now() - start < (config.timeoutMs || 180000)) {
        try {
          const value = await run(side, action, expected);
          result.steps.push({
            side,
            action,
            seconds: (Date.now() - start) / 1000,
            ...value,
          });
          console.log(provider.name, side, action, "PASS");
          return;
        } catch (e) {
          last = e;
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      throw Error(`${side} ${action} timed out: ${last?.message}`);
    };
    try {
      const seed = provider.seed || (await run("windows", "seed"));
      result.book = seed;
      console.log(provider.name, "Windows import", seed.id);
      await wait("mac", "mac-read", { ...seed, progress: 0.12 });
      await wait("windows", "win-read", {
        ...seed,
        progress: 0.37,
        mark: "present",
      });
      await wait("mac", "delete", { ...seed, progress: 0.72, mark: "deleted" });
      await wait("windows", "restore", {
        ...seed,
        progress: 0.72,
        mark: "deleted",
        deleted: true,
      });
      await wait("mac", "verify", {
        ...seed,
        progress: 0.72,
        mark: "deleted",
        deleted: false,
      });
      result.passed = true;
    } catch (e) {
      result.passed = false;
      result.error = e.message;
      console.log(provider.name, "FAIL", e.message);
    }
    output.results.push(result);
    await fs.writeFile(
      path.join(config.evidence, "result.json"),
      JSON.stringify(output, null, 2),
    );
  }
  output.finished = new Date().toISOString();
  await fs.writeFile(
    path.join(config.evidence, "result.json"),
    JSON.stringify(output, null, 2),
  );
  if (output.results.some((r) => !r.passed)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
