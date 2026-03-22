import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");

if (!existsSync(nextDir)) {
  process.exit(0);
}

const directories = ["server", "static", "types", "diagnostics"];
const files = [
  "BUILD_ID",
  "app-build-manifest.json",
  "app-path-routes-manifest.json",
  "build-manifest.json",
  "export-marker.json",
  "images-manifest.json",
  "middleware-manifest.json",
  "package.json",
  "pages-manifest.json",
  "prerender-manifest.json",
  "react-loadable-manifest.json",
  "required-server-files.json",
  "routes-manifest.json",
];

for (const directory of directories) {
  rmSync(join(nextDir, directory), { recursive: true, force: true });
}

for (const file of files) {
  rmSync(join(nextDir, file), { force: true });
}
