// Workaround for Turbopack + native CSS toolchains on macOS:
// Turbopack's bundled postcss runtime requires native bindings via relative
// `.node` paths instead of resolving the platform-specific npm package. On
// Apple Silicon machines whose terminals/node can flip between arm64 and x64
// (Rosetta), Turbopack may ask for the x64 binary even when only the arm64
// package was installed.
//
// Both `lightningcss` and `@tailwindcss/oxide` follow the same pattern:
//   - npm package <name>-<platform>-<arch> contains a single .node file
//   - the main package's index.js falls back to ./<basename>.<platform>-<arch>.node
//
// This script scans node_modules for all sibling platform packages of these
// two libraries and copies their .node binaries into the main package
// directory so both arch fallbacks resolve.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "node_modules");

// [main package dir relative to node_modules, prefix of platform packages]
const TARGETS = [
  { mainDir: "lightningcss", prefix: "lightningcss-" },
  {
    mainDir: path.join("@tailwindcss", "oxide"),
    siblingDir: "@tailwindcss",
    prefix: "oxide-",
  },
];

function copyNativeBinaries(target) {
  const mainPath = path.join(ROOT, target.mainDir);
  if (!fs.existsSync(mainPath)) return 0;

  const scanDir = target.siblingDir
    ? path.join(ROOT, target.siblingDir)
    : ROOT;
  if (!fs.existsSync(scanDir)) return 0;

  let copied = 0;
  for (const entry of fs.readdirSync(scanDir)) {
    if (!entry.startsWith(target.prefix)) continue;
    // skip the main package itself if its name happens to match
    if (entry === path.basename(target.mainDir)) continue;

    const dir = path.join(scanDir, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".node")) continue;
      const src = path.join(dir, file);
      const dst = path.join(mainPath, file);
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        console.log(`[fix-native] copied ${path.relative(ROOT, dst)}`);
        copied++;
      }
    }
  }
  return copied;
}

let total = 0;
for (const t of TARGETS) {
  total += copyNativeBinaries(t);
}
if (total === 0) {
  console.log("[fix-native] nothing to do");
}
