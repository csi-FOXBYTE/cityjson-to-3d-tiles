import { rm } from "fs/promises";
import { Database } from "sqlite";
import sqlite3 from "sqlite3";

export async function createDatabase(filePath: string, reset = false) {
  if (reset) {
    try {
      await rm(filePath);
    } catch {}
  }

  const database = new Database({
    driver: sqlite3.Database,
    filename: filePath,
  });

  await database.open();

  await database.exec(`
PRAGMA synchronous = OFF;
PRAGMA journal_mode = OFF;
PRAGMA threads = 2;
PRAGMA temp_store = FILE;
PRAGMA cache_spill = ON;
PRAGMA ignore_check_constraints = ON;
PRAGMA foreign_keys = OFF;
`);

  if (reset) {
    await database.exec(`
    CREATE TABLE data(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      parentIds TEXT NULL,
      childrenIds TEXT NULL,
      address TEXT,
      attributes TEXT,
      type TEXT,
      bbMinX REAL,
      bbMinY REAL,
      bbMinZ REAL,
      bbMaxX REAL,
      bbMaxY REAL,
      bbMaxZ REAL,
      doc BLOB NULL,
      isInstanced INT,
      refId TEXT NULL,
      transformationMatrix TEXT NULL
    ) STRICT
    `);
    await database.exec(`
    CREATE TABLE instancedData(
      id TEXT PRIMARY KEY,
      arrayIndex REAL,
      filePath TEXT,
      srcSRS TEXT,
      doc BLOB
    ) STRICT
    `);
    await database.exec(`
    CREATE TABLE textures(
        path TEXT PRIMARY KEY,
        img BLOB
    ) STRICT
    `);
  }

  return database;
}
