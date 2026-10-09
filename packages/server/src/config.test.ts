import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { persistentPaths } from "./config.js";

test("without a volume the configured paths are used as given", () => {
  assert.deepEqual(persistentPaths({}), {
    databasePath: join("data", "support.db"),
    uploadDir: join("data", "uploads"),
  });
  assert.deepEqual(
    persistentPaths({ DATABASE_PATH: "./data/support.db", UPLOAD_DIR: "./data/uploads" }),
    { databasePath: "./data/support.db", uploadDir: "./data/uploads" },
  );
});

test("a Railway volume receives relative data paths so a redeploy keeps the admin", () => {
  assert.deepEqual(
    persistentPaths({
      RAILWAY_VOLUME_MOUNT_PATH: "/data",
      DATABASE_PATH: "./data/support.db",
      UPLOAD_DIR: "./data/uploads",
    }),
    { databasePath: "/data/data/support.db", uploadDir: "/data/data/uploads" },
  );
  assert.deepEqual(persistentPaths({ RAILWAY_VOLUME_MOUNT_PATH: "/data" }), {
    databasePath: "/data/support.db",
    uploadDir: "/data/uploads",
  });
});

test("absolute paths are left alone and an existing local file is not moved", () => {
  const dir = mkdtempSync(join(tmpdir(), "osb-config-"));
  const database = join(dir, "support.db");
  writeFileSync(database, "");
  assert.deepEqual(
    persistentPaths({
      RAILWAY_VOLUME_MOUNT_PATH: "/data",
      DATABASE_PATH: "/var/lib/support.db",
      UPLOAD_DIR: "/var/lib/uploads",
    }),
    { databasePath: "/var/lib/support.db", uploadDir: "/var/lib/uploads" },
  );
  assert.equal(
    persistentPaths({ RAILWAY_VOLUME_MOUNT_PATH: "/data", DATABASE_PATH: database }).databasePath,
    database,
  );
});
