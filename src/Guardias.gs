//══════════════════════════════════════════
// GUARDIAS PROGRAMADAS — fuente única de fechas de guardia
//
// Hoja: GuardiasProgramadas
//   A: ID          (etiqueta libre, p.ej. "Guardia 1" / "Guardia A")
//   B: INICIO      fecha cívica (Date o "YYYY-MM-DD" o "DD/MM/YYYY")
//   C: DURACIÓN    días (siempre 7; se normaliza y se avisa si no lo es)
//   D: ACTIVA      SI/1/true · NO/0/FALSE · vacío = activa
//
// El fin NUNCA se almacena: fin = inicio + duración − 1 (derivado).
// Las fechas se tratan como DÍAS CÍVICOS (partes Y/M/D), nunca como
// instantes: la aritmética por milisegundos falla al cruzar un cambio de
// hora (DST) y produjo el bug 14/09→15/09 en septiembre de 2026.
//
// Contrato: obtenerGuardias() → { guardias, fuente, avisos, total }
//   guardias: [{ id, inicio:"YYYY-MM-DD", duracion, fin:"YYYY-MM-DD", activa }]
//   fuente:   "programadas" (hoja) | "legado" (migración desde Config)
//══════════════════════════════════════════

var HOJA_GUARDIAS_PROGRAMADAS = "GuardiasProgramadas";
var _guardiasCache = null;

function _hojaGuardiasProgramadas(ss) {
  ss = ss || SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(HOJA_GUARDIAS_PROGRAMADAS);
}

// Lee las filas crudas de la hoja (columna INICIO obligatoria).
function _leerFilasGuardiasProgramadas() {
  var sh = _hojaGuardiasProgramadas();
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var filas = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === "" || data[i][1] === null) continue; // sin INICIO: se ignora
    filas.push({
      id: String(data[i][0] === null || data[i][0] === undefined ? "" : data[i][0]),
      inicio: data[i][1],
      duracion: data[i][2],
      activa: data[i][3]
    });
  }
  return filas;
}

// Prepara la hoja (layout + encabezado + protección + oculta) sin tocar datos.
function _asegurarHojaGuardiasProgramadas(ss) {
  ss = ss || SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(HOJA_GUARDIAS_PROGRAMADAS);
  if (!sh) {
    sh = ss.insertSheet(HOJA_GUARDIAS_PROGRAMADAS);
    sh.getRange(1, 1, 1, 4).setValues([["ID", "INICIO", "DURACIÓN", "ACTIVA"]]);
    sh.getRange(1, 1, 1, 4).setBackground("#0e0e0e").setFontColor("#ffffff").setFontWeight("bold");
    sh.getRange(2, 2).setNumberFormat("yyyy-mm-dd");
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 4).setValues([["ID", "INICIO", "DURACIÓN", "ACTIVA"]]);
    sh.getRange(1, 1, 1, 4).setBackground("#0e0e0e").setFontColor("#ffffff").setFontWeight("bold");
  }
  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 80);  sh.setColumnWidth(4, 70);
  sh.setFrozenRows(1);
  sh.getRange("C2:C").setNumberFormat("0");
  try {
    var p = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (p.length === 0) { sh.protect().setWarningOnly(true); }
    if (!sh.isSheetHidden()) sh.hideSheet();
  } catch (e) { Logger.log("guardar/proteger hoja programadas: " + e); }
  return sh;
}

// CENTRAL: obtiene las guardias activas normalizadas y ordenadas.
// 1) Si hay datos en GuardiasProgramadas → fuente única (src: programadas).
// 2) Si la hoja no existe o está vacía → deriva del modelo anterior
//    (Config C3 + C4) y la PERSISTE una sola vez: la hoja queda como
//    fuente única y C4 deja de ser necesario.
function obtenerGuardias(opts) {
  var o = opts || {};
  if (_guardiasCache && !o.invalidar) return _guardiasCache;

  var filas = _leerFilasGuardiasProgramadas();
  var resultado;
  if (filas.length) {
    resultado = normalizarGuardias(filas);
    resultado.fuente = "programadas";
  } else {
    var config = obtenerConfigGeneral();
    resultado = guardiasDesdeLegacy(config.inicio, config.semanas);
    resultado.fuente = "legado";
    try {
      _persistirGuardiasLegado(resultado.guardias);
      resultado.fuente = "programadas";
    } catch (e) {
      Logger.log("obtenerGuardias/persistir legado: " + e);
    }
  }
  resultado.guardias = resultado.guardias.filter(function(g) { return g.activa; });
  _guardiasCache = resultado;
  return resultado;
}

// Unica escritura de migración: vuelca las guardias legadas a la hoja solo
// si está vacía (idempotente; nunca duplica ni borra datos).
function _persistirGuardiasLegado(guardias) {
  var sh = _asegurarHojaGuardiasProgramadas();
  if (sh.getLastRow() > 1) return;
  if (!guardias || !guardias.length) return;
  var filas = guardias.map(function(g) {
    return [g.id, g.inicio, g.duracion, "SI"];
  });
  sh.getRange(2, 1, filas.length, 4).setValues(filas);
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).setFontWeight("bold");
}

function invalidarCacheGuardias() {
  _guardiasCache = null;
}

// Compatibilidad: "es día de guardia" según la fuente única.
function esDiaDeGuardia(fechaStr) {
  try {
    var oc = obtenerGuardias();
    return esDiaGuardiaEn(oc.guardias, fechaStr);
  } catch (e) {
    Logger.log("esDiaDeGuardia: " + e);
    return false;
  }
}

//--------------------------------------------------------------------------------
// ADMIN — lectura/escritura de GuardiasProgramadas desde el menú / UI
//--------------------------------------------------------------------------------

function listarGuardiasAdmin() {
  try {
    var filas = _leerFilasGuardiasProgramadas();
    var salida = filas.map(function(f) {
      var g = guardiaDesdePartes(f.id, f.inicio, f.activa, f.duracion);
      return g ? { id: g.id, inicio: g.inicio, duracion: g.duracion, activa: g.activa } : null;
    }).filter(function(x) { return !!x; });
    var validacion = normalizarGuardias(salida);
    return {
      ok: true,
      guardias: salida,
      fuente: salida.length ? "programadas" : "legado",
      avisos: validacion.avisos,
      total: salida.length
    };
  } catch (e) {
    Logger.log("listarGuardiasAdmin: " + e);
    return { ok: false, error: e.message };
  }
}

// recibe [{id, inicio:"YYYY-MM-DD", duracion, activa:bool}] → valida y escribe.
// Rechaza el guardado VACÍO: la fuente única nunca debe poder quedarse sin
// datos (evita que obtenerGuardias() la repueble silenciosamente desde el
// legado Config C3/C4). Para volver a la config, el admin usa
// derivarGuardiasDesdeConfig().
function guardarGuardiasAdmin(guardiasRaw) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: "El sistema está ocupado. Espera unos segundos." };
  }
  try {
    var entrada = (guardiasRaw || []).map(function(f) {
      return { id: f.id, inicio: f.inicio, duracion: f.duracion, activa: f.activa };
    });
    var normalizada = normalizarGuardias(entrada);
    if (!normalizada.guardias.length) {
      return {
        ok: false,
        error: "No se puede guardar una lista vacía o sin fechas válidas. " +
               "Para regenerar desde la configuración usa “Derivar desde Config”."
      };
    }
    var sh = _asegurarHojaGuardiasProgramadas();

    // Limpiar filas de datos actuales (mantener encabezado) y escribir las nuevas
    var ult = sh.getLastRow();
    if (ult > 1) sh.getRange(2, 1, ult - 1, 4).clearContent();

    if (normalizada.guardias.length) {
      var filas = normalizada.guardias.map(function(g) {
        return [g.id, g.inicio, g.duracion, g.activa ? "SI" : "NO"];
      });
      sh.getRange(2, 1, filas.length, 4).setValues(filas);
    }

    invalidarCacheGuardias();
    if (typeof invalidarCacheConfig === "function") invalidarCacheConfig();

    return { ok: true, avisos: normalizada.avisos, total: normalizada.guardias.length };
  } catch (e) {
    Logger.log("guardarGuardiasAdmin: " + e);
    return { ok: false, error: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// Acción de migración manual: vuelca las guardias legadas (Config C3+C4) de
// nuevo a la hoja (borrando lo actual). Útil para "restablecer desde Config".
function derivarGuardiasDesdeConfig() {
  try {
    var config = obtenerConfigGeneral();
    var legado = guardiasDesdeLegacy(config.inicio, config.semanas);
    var res = guardarGuardiasAdmin(legado.guardias);
    res.origen = { inicio: fechaStrCivil(config.inicio) || "", semanas: config.semanas };
    return res;
  } catch (e) {
    Logger.log("derivarGuardiasDesdeConfig: " + e);
    return { ok: false, error: e.message };
  }
}