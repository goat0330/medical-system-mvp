import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runtimeDir = join(projectRoot, "vendor", "hm_editor");
const repoUrl = "https://github.com/huimeicloud/hm_editor.git";
const revision = "6657869cd69f513ae62ab2722c9347ded9cc9e37";
const image = "hmeditor/node_wkhtmltox:14.18.3-0.12.4";
const requiredFiles = [
  "ckeditor.js",
  "hmEditor.js",
  "hmEditor/iframe/HmEditorIfame.js",
  "vendor/jquery.min.js",
  "editorDist/base.min.js",
  "editorDist/all.min.js",
  "editorDist/all.min.css",
  "editorDist/js/document.min.js",
];

function run(command, args, { cwd, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout || ""}${result.stderr || ""}`.trim() : "";
    throw new Error(`${command} exited with status ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return (result.stdout || "").trim();
}

function git(args, options = {}) {
  return run("git", args, options);
}

function docker(args) {
  return run("docker", args);
}

function hasRuntimeBuild() {
  return requiredFiles.every((file) => existsSync(join(runtimeDir, file)));
}

try {
  const serverVersion = run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true });
  if (!serverVersion) throw new Error("Docker Desktop is running but the local engine did not report a version.");

  if (!existsSync(join(runtimeDir, ".git"))) {
    mkdirSync(dirname(runtimeDir), { recursive: true });
    if (existsSync(runtimeDir)) throw new Error(`${runtimeDir} exists but is not an HmEditor Git checkout; leaving it untouched.`);
    console.log("Fetching the pinned open-source HmEditor checkout...");
    git(["clone", "--filter=blob:none", "--no-checkout", repoUrl, runtimeDir]);
    git(["fetch", "--depth", "1", "origin", revision], { cwd: runtimeDir });
    git(["checkout", "--detach", revision], { cwd: runtimeDir });
  }

  const actualRevision = git(["rev-parse", "HEAD"], { cwd: runtimeDir, capture: true });
  if (actualRevision !== revision) {
    throw new Error(`HmEditor checkout is ${actualRevision}; this integration is pinned to ${revision}. It was not changed.`);
  }
  const changes = git(["status", "--porcelain"], { cwd: runtimeDir, capture: true });
  if (changes) throw new Error("HmEditor source checkout has tracked edits; leaving it untouched and skipping the build.");

  if (!hasRuntimeBuild()) {
    const dockerSource = runtimeDir.replace(/\\/g, "/");
    const mount = `type=bind,source=${dockerSource},target=/app`;
    const imageExists = spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" }).status === 0;
    if (!imageExists) docker(["pull", image]);
    if (!existsSync(join(runtimeDir, "node_modules", "grunt-cli", "bin", "grunt"))) {
      console.log("Installing upstream build dependencies in the isolated Node 14 build container...");
      docker(["run", "--rm", "--mount", mount, "--workdir", "/app", image, "npm", "install", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"]);
    }
    console.log("Building the upstream editor assets...");
    docker(["run", "--rm", "--mount", mount, "--workdir", "/app", image, "node", "node_modules/grunt-cli/bin/grunt", "release", "--no-color"]);
  }

  const missing = requiredFiles.filter((file) => !existsSync(join(runtimeDir, file)));
  if (missing.length) throw new Error(`HmEditor build is incomplete; missing: ${missing.join(", ")}`);
  console.log(`Local HmEditor runtime ready at pinned revision ${revision}.`);
} catch (error) {
  console.error(`Unable to prepare the local structured editor: ${error.message}`);
  console.error("Keep Docker Desktop running and rerun start.bat. Existing files and containers are left intact.");
  process.exitCode = 1;
}
