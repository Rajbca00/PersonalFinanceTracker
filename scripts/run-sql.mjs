/**
 * Runs a .sql file against DATABASE_URL.
 *
 *   node --env-file=.env.local scripts/run-sql.mjs db/schema.sql
 *
 * Uses the WebSocket client rather than the HTTP one because the HTTP endpoint
 * takes a single statement, and these files are whole scripts containing
 * dollar-quoted function bodies. Sending the file as one simple query lets
 * Postgres do the parsing.
 */
import { Client, neonConfig } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

neonConfig.webSocketConstructor = WebSocket;

const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const sql = await readFile(file, "utf8");
const client = new Client(url);

try {
  await client.connect();
  await client.query(sql);
  console.log(`✓ ran ${file}`);
} catch (err) {
  console.error(`✗ ${file} failed:`);
  console.error(`  ${err.message}`);
  if (err.position) console.error(`  at character ${err.position}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
