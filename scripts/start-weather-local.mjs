import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in .env before starting. See README-LOCAL.md.");
  process.exit(1);
}

const windows = process.platform === "win32";
const pnpm = windows ? "pnpm.cmd" : "pnpm";
const run = (args, options = {}) =>
  spawnSync(pnpm, args, { cwd: root, stdio: "inherit", shell: windows, ...options });

if (process.argv.includes("--setup-db")) {
  const result = run(["--filter", "@workspace/db", "push"]);
  process.exit(result.status ?? 1);
}

const build = run(["--filter", "@workspace/api-server", "build"]);
if (build.status !== 0) process.exit(build.status ?? 1);

const apiPort = process.env.LOCAL_API_PORT || "3001";
const webPort = process.env.LOCAL_WEB_PORT || "5173";
const api = spawn(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: apiPort, NODE_ENV: "development" },
  },
);
const web = spawn(pnpm, ["--filter", "@workspace/weather-tracker", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: windows,
  env: {
    ...process.env,
    PORT: webPort,
    BASE_PATH: "/",
    LOCAL_API_URL: `http://127.0.0.1:${apiPort}`,
  },
});

console.log(`\nWeather tracker: http://localhost:${webPort}\n`);
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  api.kill();
  web.kill();
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of [api, web]) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
