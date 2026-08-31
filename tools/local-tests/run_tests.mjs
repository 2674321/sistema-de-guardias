#!/usr/bin/env node
// Runner local de las pruebas puras (misma suite que corre en Apps Script).
// Uso: node tools/local-tests/run_tests.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (f) => readFileSync(join(root, "src", f), "utf-8");

// Cargar módulos portables en este contexto
new Function(src("Reglas.gs") + "\n" + src("Exportar.js") + "\n" + src("Tests.gs") + "\n; return { pruebasPuras };")()
  .pruebasPuras()
  .forEach((r) => {
    console.log((r.ok ? "  ✓ " : "  ✗ ") + r.nombre + (r.ok ? "" : " — " + r.error));
    if (!r.ok) process.exitCode = 1;
  });
