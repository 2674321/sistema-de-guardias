//══════════════════════════════════════════
// CONFIGURACIÓN CENTRAL DEL SISTEMA
// Única fuente de constantes y de lectura de la hoja Config.
//══════════════════════════════════════════

const SHEET_ID = "1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs";
const SHEET_NAME = "Guardias";
var _configCache = null;

const CONFIG = {
  niveles: ["INICIAL", "OPERATIVO", "PROFESIONAL"],

  guardiasMinPorInscripcion: 1,
  guardiasCantidadDefault: 4,      // Se puede sobreescribir en Config!B10 (2 | 3 | 4)
  guardiasMaxHistoricoMes: 4,      // No se recortan registros históricos de 4

  diasEliminacionDefault: 3,       // Config!B6
  semanasHabilitadasDefault: [0, 2], // Config!B8

  codigoEliminacionTtlSeg: 600,    // Vigencia del código de baja (10 min)
  codigoEliminacionMaxIntentos: 5
};

//══════════════════════════════════════════
// LECTURA DE LA HOJA Config
//   B3  → Primer lunes de guardia del mes (fecha inicio semana 0)
//   B6  → Días de antelación para eliminar (default 3)
//   B7  → Fecha límite de inscripción (vacía = sin límite)
//   B8  → Semanas habilitadas, ej: "0,2"
//   B9  → Mostrar panel de Asistencia ("0" = ocultar; otro valor o vacío = mostrar)
//   B10 → Cantidad de guardias por inscripción (2 | 3 | 4; vacío = default 4)
//══════════════════════════════════════════

function obtenerInicioSemanaConfig() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var val = sheet.getRange("B3").getValue();
  if (val instanceof Date) return val;
  return new Date(String(val).trim() + "T12:00:00");
}

function obtenerConfigGeneral() {
  if (_configCache) return _configCache;
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var inicio = obtenerInicioSemanaConfig();

  var diasEliminacion = CONFIG.diasEliminacionDefault;
  try {
    var v = sheet.getRange("B6").getValue();
    if (v !== "" && v != null) {
      var n = Number(v);
      if (!isNaN(n) && n >= 0) diasEliminacion = n;
    }
  } catch (e) { Logger.log("Config B6: " + e); }

  var fechaLimite = null;
  try {
    var v7 = sheet.getRange("B7").getValue();
    if (v7) {
      if (v7 instanceof Date) fechaLimite = v7;
      else fechaLimite = new Date(String(v7).trim() + "T12:00:00");
    }
  } catch (e) { Logger.log("Config B7: " + e); }

  var semanas = CONFIG.semanasHabilitadasDefault.slice();
  try {
    var v8 = sheet.getRange("B8").getValue();
    if (v8) {
      var parts = String(v8).split(",").map(function(s) { return parseInt(s.trim(), 10); });
      if (parts.length > 0 && parts.every(function(p) { return !isNaN(p); })) semanas = parts;
    }
  } catch (e) { Logger.log("Config B8: " + e); }

  var cantidadGuardias = CONFIG.guardiasCantidadDefault;
  try {
    var v10 = sheet.getRange("B10").getValue();
    var nc = parseInt(v10, 10);
    if (nc === 2 || nc === 3 || nc === 4) cantidadGuardias = nc;
  } catch (e) { Logger.log("Config B10: " + e); }

  var mostrarAsistencia = true;
  try {
    var v9 = sheet.getRange("B9").getValue();
    if (String(v9).trim() === "0") mostrarAsistencia = false;
  } catch (e) { Logger.log("Config B9: " + e); }

  _configCache = {
    inicio: inicio,
    mes: inicio.getMonth(),
    año: inicio.getFullYear(),
    diasEliminacion: diasEliminacion,
    fechaLimite: fechaLimite,
    semanas: semanas,
    cantidadGuardias: cantidadGuardias,
    mostrarAsistencia: mostrarAsistencia
  };
  return _configCache;
}

function invalidarCacheConfig() {
  _configCache = null;
}

// Endpoint público para el frontend
function getConfig() {
  try {
    var c = obtenerConfigGeneral();
    return {
      ok: true,
      cantidadGuardias: c.cantidadGuardias,
      mostrarAsistencia: c.mostrarAsistencia,
      mes: c.mes,
      año: c.año,
      semanas: c.semanas
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function esSemanaHabilitada(fechaStr) {
  var fecha = new Date(fechaStr + "T12:00:00");
  var config = obtenerConfigGeneral();

  if (fecha.getMonth() !== config.mes || fecha.getFullYear() !== config.año) {
    return false;
  }

  var diffDias = Math.floor((fecha - config.inicio) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return false;

  var semana = Math.floor(diffDias / 7);
  return config.semanas.indexOf(semana) !== -1;
}

//══════════════════════════════════════════
// ETIQUETAS DE LA HOJA Config (ejecutar desde menú)
//══════════════════════════════════════════

function inicializarNotasConfig() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  sheet.getRange("A6").setValue("Días para eliminar");
  sheet.getRange("C6").setValue("Antelación mínima en días para permitir la baja de guardias. Ej: 3 = se puede eliminar hasta 3 días antes de la primera guardia. 0 = sin restricción.");
  sheet.getRange("A7").setValue("Fecha límite inscripción");
  sheet.getRange("C7").setValue("Fecha tope para registrarse. Si está vacía no hay límite.");
  sheet.getRange("A8").setValue("Semanas habilitadas");
  sheet.getRange("C8").setValue("Índices de las semanas de guardia (0 = primera, 1 = segunda, etc). Ej: 0, 2 = primera y tercera semana.");
  sheet.getRange("A9").setValue("Mostrar Panel de Asistencia");
  sheet.getRange("C9").setValue("1 o vacío = Visible. 0 = Oculto.");
  sheet.getRange("A10").setValue("Cantidad de guardias");
  sheet.getRange("C10").setValue("Cuántas guardias puede seleccionar un bombero por inscripción: 2, 3 o 4. Vacío = 4.");
  sheet.getRange("A6:A10").setFontWeight("bold");
}
