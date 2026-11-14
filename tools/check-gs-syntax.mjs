#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "src")).filter((f) => f.endsWith(".gs"));
let failed = false;
for (const file of files) {
  try {
    new Function(readFileSync(join(root, "src", file), "utf8"));
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}: ${error.message}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ Sintaxis Apps Script: ${files.length} archivos .gs`);
