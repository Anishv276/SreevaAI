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
}

main();
