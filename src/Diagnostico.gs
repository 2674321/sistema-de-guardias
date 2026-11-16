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

// ── Sonda auditoría P0 (2026-11-16): identidad + allowlist admin ──
// Solo lectura. Enmascara correos: u***@dominio.tld
function _mascaraEmail_(email) {
  var s = String(email || "");
  var at = s.indexOf("@");
  if (at <= 0) return s ? "***" : "";
  return s.charAt(0) + "***" + s.substring(at);
}

function diagAdminAuditoria() {
  var r = _diagBase();
  r.activo = "";
  r.efectivo = "";
  try { r.activo = _mascaraEmail_(Session.getActiveUser().getEmail()); } catch (e) { r.activoErr = String(e.message || e); }
  try { r.efectivo = _mascaraEmail_(Session.getEffectiveUser().getEmail()); } catch (e) { r.efectivoErr = String(e.message || e); }

  var props = PropertiesService.getScriptProperties();
  var bruta = String(props.getProperty("ADMIN_EMAILS") || "");
  r.adminEmailsDefinida = bruta.trim() !== "";
  r.adminEmails = bruta.split(",").map(function (x) { return _mascaraEmail_(x.trim()); }).filter(Boolean);
  r.sheetIdDefinido = !!String(props.getProperty("SHEET_ID") || "");
  r.ambiente = props.getProperty("ENVIRONMENT") || "UNCONFIGURED";
  r.webAppUrlDefinida = !!String(props.getProperty("WEB_APP_URL") || "");
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    r.hojaOk = !!ss;
    r.hojaNombre = ss.getName();
    r.hojaPropietario = _mascaraEmail_((ss.getOwner() && ss.getOwner().getEmail()) || "");
  } catch (e) { r.hojaErr = String(e.message || e); }
  return r;
}
