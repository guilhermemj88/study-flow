import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const children = [
  spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1"], { cwd: root, stdio: "inherit", env: process.env }),
  spawn(process.execPath, [tsxCli, "watch", "mcp/server.ts"], { cwd: root, stdio: "inherit", env: process.env }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 250).unref();
}
for (const child of children) child.on("exit", (code) => { if (!closing && code) close(code); });
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
