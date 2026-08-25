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
  guardiasCantidadDefault: 4,      // Sobreescribible en hoja Config
  guardiasMaxHistoricoMes: 4,      // No se recortan registros históricos de 4

  diasEliminacionDefault: 3,
  semanasHabilitadasDefault: [0, 2],

  codigoEliminacionTtlSeg: 600,    // Vigencia del código de baja (10 min)
  codigoEliminacionMaxIntentos: 5,

  // URL vigente del web app (actualizar al crear un deployment nuevo)
  webAppUrl: "https://script.google.com/macros/s/AKfycbxZyIlFLu7kj0kJlJsksV9D9Zy4tATlTtCQW-zYTqvYLeL1mmGK4jAx_2VWzfEmDfZ0/exec",

  // Hojas técnicas: se mantienen ocultas y protegidas por el formateador
  hojasTecnicas: ["LogEliminaciones", "_BackupMigracionNiveles"],

  // Direcciones de la hoja Config.
  // Nuevo layout por secciones (columna VALOR en C) con compatibilidad
  // de lectura hacia las celdas legadas B* mientras existan datos allí.
  celdasConfig: {
    inicio:          { nueva: "C3", legada: "B3" },
    semanas:         { nueva: "C4", legada: "B8" },
    cantidadGuardias:{ nueva: "C5", legada: "B10" },
    fechaLimite:     { nueva: "C6", legada: "B7" },
    diasEliminacion: { nueva: "C7", legada: "B6" },
    mostrarAsistencia:{ nueva: "C8", legada: "B9" }
  }
};

//══════════════════════════════════════════
// DETECCIÓN DE CORREO DEL VISITANTE
//
// Mecanismo seguro y compatible: Session.getActiveUser().
// En despliegues ANYONE_ANONYMOUS normalmente devuelve vacío;
// puede devolver el correo cuando Google lo autoriza
// (p.ej. mismo dominio Workspace o sesión autorizada).
// NUNCA se usa getEffectiveUser() como correo del visitante:
// ese es el propietario del despliegue, no la persona que navega.
// Si no hay correo: la app sigue funcionando con ingreso manual.
//══════════════════════════════════════════

function detectarCorreoUsuario() {
  try {
    var email = String(Session.getActiveUser().getEmail() || "").trim();
    if (!email || !esEmailValido(email)) {
      return { ok: false, motivo: "no_disponible" };
    }
    return { ok: true, correo: email };
  } catch (e) {
    Logger.log("detectarCorreoUsuario: " + e);
    return { ok: false, motivo: "indisponible" };
  }
}

//══════════════════════════════════════════
// LECTURA DE LA HOJA Config (layout nuevo por secciones + legado B*)
// Nuevo:  C3 inicio · C4 semanas · C5 cantidad · C6 fecha límite
//         C7 días eliminación · C8 mostrar asistencia
// Legado: B3 · B8 · B10 · B7 · B6 · B9 (se usa solo si la celda nueva está vacía)
//══════════════════════════════════════════

function _leerCeldaConfig(sheet, clave) {
  var dir = CONFIG.celdasConfig[clave];
  var nueva = sheet.getRange(dir.nueva).getValue();
  if (nueva !== "" && nueva !== null) return { valor: nueva, origen: "nueva" };
  try {
    var vieja = sheet.getRange(dir.legada).getValue();
    if (vieja !== "" && vieja !== null) return { valor: vieja, origen: "legada" };
  } catch (e) { /* celda legada inexistente */ }
  return { valor: "", origen: "vacía" };
}

function obtenerInicioSemanaConfig() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var val = _leerCeldaConfig(sheet, "inicio").valor;
  if (val instanceof Date) return val;
  return new Date(String(val).trim() + "T12:00:00");
}

function obtenerConfigGeneral() {
  if (_configCache) return _configCache;
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  var inicio = obtenerInicioSemanaConfig();

  var rDias = _leerCeldaConfig(sheet, "diasEliminacion");
  var diasEliminacion = CONFIG.diasEliminacionDefault;
  if (rDias.valor !== "") {
    var n = Number(rDias.valor);
    if (!isNaN(n) && n >= 0) diasEliminacion = n;
  }

  var rLimite = _leerCeldaConfig(sheet, "fechaLimite");
  var fechaLimite = null;
  if (rLimite.valor) {
    if (rLimite.valor instanceof Date) fechaLimite = rLimite.valor;
    else fechaLimite = new Date(String(rLimite.valor).trim() + "T12:00:00");
  }

  var rSemanas = _leerCeldaConfig(sheet, "semanas");
  var semanas = CONFIG.semanasHabilitadasDefault.slice();
  if (rSemanas.valor) {
    var parts = String(rSemanas.valor).split(",").map(function(s) { return parseInt(s.trim(), 10); });
    if (parts.length > 0 && parts.every(function(p) { return !isNaN(p); })) semanas = parts;
  }

  var rCantidad = _leerCeldaConfig(sheet, "cantidadGuardias");
  var rAsistenciaNueva = sheet.getRange(CONFIG.celdasConfig.mostrarAsistencia.nueva).getValue();
  var rAsistenciaLegada = null;
  try { rAsistenciaLegada = sheet.getRange(CONFIG.celdasConfig.mostrarAsistencia.legada).getValue(); } catch (e) {}

  _configCache = {
    inicio: inicio,
    mes: inicio.getMonth(),
    año: inicio.getFullYear(),
    diasEliminacion: diasEliminacion,
    fechaLimite: fechaLimite,
    semanas: semanas,
    cantidadGuardias: resolverCantidadGuardias(rCantidad.valor, "", CONFIG.guardiasCantidadDefault),
    mostrarAsistencia: resolverMostrarAsistencia(rAsistenciaNueva, rAsistenciaLegada),
    _origenes: { diasEliminacion: rDias.origen, fechaLimite: rLimite.origen, semanas: rSemanas.origen, cantidadGuardias: rCantidad.origen }
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
    _autoInstalarTriggerMenu(); // best-effort, silencioso e idempotente
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

//══════════════════════════════════════════
// AUTO-INSTALACIÓN DEL MENÚ EN LA HOJA
// El proyecto es un script independiente: su onOpen simple nunca se
// dispara al abrir la hoja. Se necesita un disparador instalable.
// Este helper lo crea automáticamente la primera vez que la web app
// corre con permisos suficientes; si falta el alcance script.scriptapp,
// falla en silencio y queda listo para instalarse a mano desde el editor
// (función instalarTriggerMenuAdmin).
//══════════════════════════════════════════

function _autoInstalarTriggerMenu() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty("MENU_TRIGGER_OK")) return;

    // Límite de intentos para no insistir eternamente sin permiso
    var intentos = Number(props.getProperty("MENU_TRIGGER_INTENTOS") || 0);
    if (intentos >= 5) return;

    var yaEsta = ScriptApp.getProjectTriggers().some(function(t) {
      return t.getHandlerFunction() === "menuAdministrativo";
    });

    if (!yaEsta) {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      ScriptApp.newTrigger("menuAdministrativo").forSpreadsheet(ss).onOpen().create();
    }

    props.setProperty("MENU_TRIGGER_OK", new Date().toISOString());
    props.deleteProperty("MENU_TRIGGER_INTENTOS");
    Logger.log("Menú GUARDIAS CBC: disparador onOpen asegurado.");
  } catch (e) {
    try {
      var p2 = PropertiesService.getScriptProperties();
      p2.setProperty("MENU_TRIGGER_INTENTOS", String(Number(p2.getProperty("MENU_TRIGGER_INTENTOS") || 0) + 1));
    } catch (e2) {}
    Logger.log("Auto-instalación del menú pendiente de autorización: " + e.message);
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

//══════════════════════════════════════════
// La escritura del layout de la hoja Config (etiquetas por sección,
// validaciones y formato) vive en Admin.gs → prepararConfiguracion() /
// aplicarFormatoCompleto().
//══════════════════════════════════════════
