// npm test: bundle each test/*.test.ts with esbuild (no extra dependencies) and run them with node's test runner.
import esbuild from "esbuild";
import { readdirSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

const dir = new URL(".", import.meta.url).pathname, out = join(dir, ".out");
rmSync(out, { recursive: true, force: true });
const tests = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));
await esbuild.build({ entryPoints: tests.map((f) => join(dir, f)), bundle: true, platform: "node", format: "esm", outdir: out, outExtension: { ".js": ".mjs" }, logLevel: "error" });
const r = spawnSync(process.execPath, ["--test", ...tests.map((f) => join(out, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
