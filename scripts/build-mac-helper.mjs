import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
if (process.platform === "darwin") {
  mkdirSync("build/native", { recursive: true });
  const arch = process.env.BOOKSPLUS_ARCH || process.arch;
  if (!["arm64", "x64"].includes(arch))
    throw Error("Unsupported Mac architecture");
  execFileSync(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-O",
      "-target",
      `${arch === "x64" ? "x86_64" : arch}-apple-macosx13.0`,
      "desktop/macos/BooksBridge.swift",
      "-o",
      path.resolve("build/native/booksplus-bridge"),
    ],
    { stdio: "inherit" },
  );
}
