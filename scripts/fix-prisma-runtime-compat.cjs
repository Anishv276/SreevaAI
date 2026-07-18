"use strict";

const fs = require("fs");
const path = require("path");

const runtimeDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "@prisma",
  "client",
  "runtime",
);

const libraryJsPath = path.join(runtimeDir, "library.js");
const libraryDtsPath = path.join(runtimeDir, "library.d.ts");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildLibraryJs() {
  return `"use strict";

const runtime = require("./client.js");

function warnEnvConflicts() {
  // Prisma 7 no longer needs this helper, but the older generated client
  // still calls it during initialization.
}

class NotFoundError extends Error {
  constructor(message = "Record not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

const objectEnumValues = {
  instances: {
    DbNull: runtime.DbNull,
    JsonNull: runtime.JsonNull,
    AnyNull: runtime.AnyNull,
  },
  classes: {
    DbNull: runtime.ObjectEnumValue,
    JsonNull: runtime.ObjectEnumValue,
    AnyNull: runtime.ObjectEnumValue,
  },
};

module.exports = {
  ...runtime,
  NotFoundError,
  objectEnumValues,
  warnEnvConflicts,
};
`;
}

function buildLibraryDts() {
  return `export * from "./client";

export declare class NotFoundError extends Error {}

export declare const objectEnumValues: {
  instances: {
    DbNull: typeof import("./client").DbNull;
    JsonNull: typeof import("./client").JsonNull;
    AnyNull: typeof import("./client").AnyNull;
  };
  classes: {
    DbNull: typeof import("./client").ObjectEnumValue;
    JsonNull: typeof import("./client").ObjectEnumValue;
    AnyNull: typeof import("./client").ObjectEnumValue;
  };
};

export declare function warnEnvConflicts(...args: unknown[]): void;
`;
}

function writeIfMissing(filePath, contents) {
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.writeFileSync(filePath, contents, "utf8");
}

function main() {
  if (!fs.existsSync(path.join(runtimeDir, "client.js"))) {
    return;
  }

  ensureDir(runtimeDir);
  writeIfMissing(libraryJsPath, buildLibraryJs());
  writeIfMissing(libraryDtsPath, buildLibraryDts());

  fixZeptomatchCjsInterop();
}

// @prisma/dev (a transitive dep of the `prisma` CLI) does `require("zeptomatch")`
// from CommonJS, but zeptomatch is ESM-only ("type": "module"), so Node throws
// ERR_REQUIRE_ESM and every `prisma` CLI command (generate/migrate/studio)
// crashes on startup. zeptomatch is only used here for simple glob name
// filtering of local dev-server instances -- not anything DB-critical -- so a
// minimal CJS-compatible shim implementing the same default-export glob
// matcher is a safe substitute for require() purposes.
function fixZeptomatchCjsInterop() {
  const zeptomatchDir = path.join(__dirname, "..", "node_modules", "zeptomatch");
  const zeptomatchDist = path.join(zeptomatchDir, "dist");
  const cjsShimPath = path.join(zeptomatchDist, "index.cjs");
  const pkgJsonPath = path.join(zeptomatchDir, "package.json");
  if (!fs.existsSync(zeptomatchDist)) {
    return; // zeptomatch not installed (unrelated dependency tree) -- nothing to fix
  }

  // Minimal glob->RegExp translator covering the subset zeptomatch's callers
  // rely on here (plain names, `*`/`**` wildcards) -- not a full reimplementation.
  const shimSrc = `"use strict";

function globToRegExp(glob) {
  const escaped = String(glob).replace(/[.+^\${}()|[\\]\\\\]/g, "\\\\$&");
  const withWildcards = escaped.replace(/\\*\\*/g, "\\u0000").replace(/\\*/g, "[^/]*").replace(/\\u0000/g, ".*");
  return new RegExp("^" + withWildcards + "$");
}

function zeptomatch(globs, input) {
  const list = Array.isArray(globs) ? globs : [globs];
  const patterns = list.map(globToRegExp);
  return patterns.some((re) => re.test(input));
}

module.exports = zeptomatch;
module.exports.default = zeptomatch;
`;
  writeIfMissing(cjsShimPath, shimSrc);

  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    if (!pkg.exports || pkg.exports === "./dist/index.js" || (pkg.exports && pkg.exports.require !== "./dist/index.cjs")) {
      pkg.exports = { import: "./dist/index.js", require: "./dist/index.cjs" };
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    }
  }
}

main();
