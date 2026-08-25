#!/usr/bin/env node
// Verificador estático: funciones llamadas sin definir en el <script> de Index.html.
// Usa un mini-lexer (strings, template literals y comentarios) para evitar falsos positivos.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "src", "Index.html"), "utf-8");
const raw = html.match(/<script>([\s\S]*)<\/script>/)[1];

// ── Lexer: sustituye strings/templates/comentarios por huecos ──
function limpiar(src) {
  let out = "", i = 0, n = src.length;
  let modo = "code"; // code | lineac | bloque | comS | comD | tpl | regex
  let ultimoSignificativo = "";
  let enClase = false;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (modo === "code") {
      if (c === "/" && d === "/") { modo = "lineac"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { modo = "bloque"; out += "  "; i += 2; continue; }
      if (c === "'" ) { modo = "comS"; out += "''"; i += 1; continue; }
      if (c === '"') { modo = "comD"; out += '""'; i += 1; continue; }
      if (c === "`") { modo = "tpl"; out += "``"; i += 1; continue; }
      if (c === "/" && !/[\w$)\]]/.test(ultimoSignificativo)) {
        // literal regex (no es división)
        modo = "regex"; enClase = false; out += "//"; i += 1; continue;
      }
      if (!/\s/.test(c)) ultimoSignificativo = c;
      out += c; i += 1; continue;
    }
    if (modo === "lineac") { if (c === "\n") { modo = "code"; } out += c === "\n" ? "\n" : " "; i += 1; continue; }
    if (modo === "bloque") { if (c === "*" && d === "/") { modo = "code"; out += "  "; i += 2; continue; } out += c === "\n" ? "\n" : " "; i += 1; continue; }
    if (modo === "regex") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "[") enClase = true;
      if (c === "]") enClase = false;
      if (c === "/" && !enClase) { modo = "code"; out += "/"; i += 1; continue; }
      out += " "; i += 1; continue;
    }
    if (modo === "comS") { if (c === "\\") { out += "  "; i += 2; continue; } if (c === "'") { modo = "code"; ultimoSignificativo="'"; out += "'"; i += 1; continue; } out += " "; i += 1; continue; }
    if (modo === "comD") { if (c === "\\") { out += "  "; i += 2; continue; } if (c === '"') { modo = "code"; ultimoSignificativo='"'; out += '"'; i += 1; continue; } out += " "; i += 1; continue; }
    if (modo === "tpl") {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { modo = "code"; ultimoSignificativo="`"; out += "`"; i += 1; continue; }
      if (c === "$" && d === "{") {
        let prof = 1, j = i + 2, buf = "";
        while (j < n && prof > 0) {
          const cc = src[j];
          if (cc === "{") prof++;
          if (cc === "}") prof--;
          if (prof > 0) buf += cc;
          j++;
        }
        out += "+" + limpiar(buf) + "+";
        i = j; continue;
      }
      out += " "; i += 1; continue;
    }
  }
  return out;
}

const js = limpiar(raw);

const defs = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
const nativas = new Set([
  "Function","Array","Object","String","Number","Boolean","Date","JSON","Math","Set","Map",
  "Promise","RegExp","Error","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent",
  "decodeURIComponent","setTimeout","setInterval","clearTimeout","clearInterval","structuredClone",
  "alert","confirm","prompt","fetch","console","IntersectionObserver","Blob",
  "getComputedStyle","google"
]);

const llamadas = new Set();
for (const m of js.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]{2,})\s*\(/g)) {
  const n = m[1];
  if (nativas.has(n)) continue;
  if (/^(if|for|while|switch|catch|return|function|typeof)$/.test(n)) continue;
  llamadas.add(n);
}

const faltantes = [...llamadas].filter(n => !defs.has(n) && !new RegExp(`\\b${n}\\s*=`).test(js));
if (faltantes.length) {
  console.error("✗ Funciones llamadas sin definición:", faltantes.join(", "));
  process.exit(1);
}
console.log("✓ Todas las funciones llamadas están definidas (" + defs.size + " definidas)");
