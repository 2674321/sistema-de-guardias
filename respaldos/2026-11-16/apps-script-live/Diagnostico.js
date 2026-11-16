//══════════════════════════════════════════
// DIAGNÓSTICO EN VIVO — sondas aisladas (FASE: auditoría servidor)
// NO altera lógica funcional. Cada sonda mide y devuelve datos chicos.
// Consumo desde el navegador (consola):
//   google.script.run.withSuccessHandler(console.log).diagnosticoCalendario()
//   google.script.run.withSuccessHandler(console.log).diagnosticoOcupacion()
//   google.script.run.withSuccessHandler(console.log).serializarRespuestaCalendario()
//══════════════════════════════════════════

var BUILD = "v1.0.0";

function _diagBase() {
  return { timestamp: new Date().toISOString(), build: BUILD };
}

// ── Sonda 1: cadena previa (config + hoja) ──
function diagnosticoCalendario() {
  var t0 = Date.now();
  var r = _diagBase();
  try {
    var cfg = obtenerConfigGeneral();
    r.configOk = !!(cfg && !isNaN(new Date(cfg.inicio).getTime()));
    r.mesActivo = cfg ? cfg.mes : null;
    r.anioActivo = cfg ? cfg.año : null;

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);
    r.sheetOk = !!sh;
    r.rows = sh ? sh.getLastRow() : 0;
    r.cols = sh ? sh.getLastColumn() : 0;
    r.ok = true;
  } catch (e) {
    r.ok = false;
    r.error = e.message;
  }
  r.tiempoMs = Date.now() - t0;
  Logger.log("[DIAG] diagnosticoCalendario: " + JSON.stringify(r));
  return r;
}

// ── Sonda 2: motor de ocupación completo, resumen pequeño ──
function diagnosticoOcupacion() {
  var t0 = Date.now();
  var r = _diagBase();
  try {
    var resp = obtenerCalendario(null, null);
    if (!resp.ok) { r.ok = false; r.error = resp.errorCode + ": " + resp.message; }
    var dias = 0, guardias = 0;
    var occ = resp.ocupacion || {};
    Object.keys(occ).forEach(function(k) {
      dias++;
      guardias += (occ[k].guardias || []).length;
    });
    r.ok = true;
    r.cantidadDias = dias;
    r.cantidadGuardias = guardias;
    r.mes = resp.mes;
    r.año = resp.año;
  } catch (e) {
    r.ok = false;
    r.error = e.message;
  }
  r.tiempoMs = Date.now() - t0;
  Logger.log("[DIAG] diagnosticoOcupacion: " + JSON.stringify(r));
  return r;
}

// ── Sonda 4: estructura REAL de la hoja Guardias (detecta desalineación) ──
function diagnosticoEstructuraHoja() {
  var t0 = Date.now();
  var r = _diagBase();
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);
    r.ok = !!sh;
    if (!sh) return r;
    var valores = sh.getRange(1, 1, Math.min(sh.getLastRow(), 8), sh.getLastColumn()).getValues();
    r.filas = valores.map(function(fila) {
      return fila.map(function(v) {
        if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
        if (v === null) return "‹null›";
        return String(v);
      });
    });
  } catch (e) {
    r.ok = false;
    r.error = e.message;
  }
  r.tiempoMs = Date.now() - t0;
  Logger.log("[DIAG] diagnosticoEstructuraHoja: " + JSON.stringify(r));
  return r;
}

// ── Sonda 3: serializabilidad de la respuesta completa ──
function serializarRespuestaCalendario() {
  var t0 = Date.now();
  var r = _diagBase();
  try {
    var resp = obtenerCalendario(null, null);
    var json = JSON.stringify(resp); // si hay Date/funciones/objetos GAS, lanza aquí
    r.ok = true;
    r.bytes = json.length;
    r.muestra = json.slice(0, 160);
  } catch (e) {
    r.ok = false;
    r.error = e.message;
  }
  r.tiempoMs = Date.now() - t0;
  Logger.log("[DIAG] serializarRespuestaCalendario: " + JSON.stringify(r));
  return r;
}
