import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: apiRoot, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

await runOnce(pnpm, ["exec", "tsc", "-p", "tsconfig.build.json"]);

const compiler = spawn(pnpm, ["exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], {
  cwd: apiRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});
const server = spawn(process.execPath, ["--watch", "dist/main.js"], { cwd: apiRoot, stdio: "inherit" });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  compiler.kill();
  server.kill();
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
compiler.once("error", () => stop(1));
compiler.once("exit", (code) => { if (!stopping) stop(code || 1); });
server.once("error", () => stop(1));
server.once("exit", (code) => { if (!stopping) stop(code || 1); });
