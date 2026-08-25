//══════════════════════════════════════════
// ADMIN — Menú 🚒 GUARDIAS CBC, diagnóstico, mantenimiento
// y sistema de formato de Google Sheets como app administrativa.
//══════════════════════════════════════════

// Clasificación de hojas por tipo
var TIPO_HOJAS = {
  "Guardias": "DATOS",
  "Config": "CONFIGURACION",
  "Asistencia": "ASISTENCIA",
  "Estadisticas": "ESTADISTICAS",
  "Estadisticas_Dias": "ESTADISTICAS",
  "Estadisticas_Mensuales": "ESTADISTICAS",
  "Ranking": "ESTADISTICAS",
  "LogEliminaciones": "LOG",
  "_BackupMigracionNiveles": "BACKUP"
};

var HOJAS_ESTADISTICAS = ["Estadisticas", "Estadisticas_Dias", "Estadisticas_Mensuales", "Ranking"];

// Paleta institucional (coherente con la interfaz web)
var PALETA = {
  tinta: "#0e0e0e", tintaSuave: "#444444",
  papel: "#f7f5f2", blanco: "#ffffff",
  rojo: "#9b1a1a", azul: "#1a3a9b", verde: "#1a6b3a",
  borde: "#d9d5cf", zebra: "#f4f1ec", cabTecnica: "#555555",
  nivel: {
    "INICIAL":     { fg: "#1a56b0", bg: "#e3edfb" }, // 🔵
    "OPERATIVO":   { fg: "#1a6b3a", bg: "#e2f3e8" }, // 🟢
    "PROFESIONAL": { fg: "#6b2fa0", bg: "#efe6fa" }  // 🟣
  },
  estadoAsis: { "C": "#dcf2e4", "P": "#fdf3d7", "R": "#e0ecff", "NC": "#fde0e0" }
};

//────────────────────────────────────────────
// MENÚ
// Estructura portable (testeable sin entorno)
//────────────────────────────────────────────

function construirMenuAdmin() {
  return [
    { titulo: "🏠 Sistema", items: [
      ["🚀 Instalar / actualizar sistema", "instalarSistema"],
      ["Abrir aplicación web", "abrirSistema"],
      ["Ver URL de la app", "verUrlApp"]
    ]},
    { titulo: "⚙️ Configuración", items: [
      ["Cantidad de guardias…", "configurarCantidadGuardias"],
      ["Preparar / reparar hoja Config", "prepararConfiguracion"],
      ["Ver configuración actual", "verConfiguracionActual"]
    ]},
    { titulo: "🎨 Formato", items: [
      ["✨ Aplicar formato completo", "aplicarFormatoCompletoMenu"],
      ["📐 Ajustar columnas y filas", "ajustarColumnasYFilasMenu"],
      ["🔄 Restaurar formato del sistema", "restaurarFormatoSistema"],
      ["👁 Mostrar/ocultar hojas técnicas", "alternarHojasTecnicas"]
    ]},
    { titulo: "👨‍🚒 Guardias", items: [
      ["📊 Actualizar estadísticas", "actualizarEstadisticasMenu"],
      ["🔎 Diagnóstico de guardias", "diagnosticoGuardias"],
      ["📅 Diagnóstico de calendario", "diagnosticoCalendario"]
    ]},
    { titulo: "🩺 Asistencia", items: [
      ["Mostrar panel de asistencia", "mostrarPanelAsistencia"],
      ["Ocultar panel de asistencia", "ocultarPanelAsistencia"],
      ["Diagnóstico de asistencia", "diagnosticoAsistencia"]
    ]},
    { titulo: "🔧 Mantenimiento", items: [
      ["Diagnóstico general", "diagnosticoGeneral"],
      ["Reparar estructura", "repararEstructura"],
      ["Verificar configuración", "verificarConfiguracion"],
      ["Verificar datos", "verificarDatos"],
      ["Instalar este menú en la hoja", "instalarTriggerMenuAdmin"]
    ]},
    { titulo: "🧪 Pruebas", items: [
      ["▶ Ejecutar tests", "ejecutarTestsMenu"],
      ["📄 Último resultado de tests", "verResultadoTests"]
    ]}
  ];
}

function menuAdministrativo() {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu("🚒 GUARDIAS CBC");
  construirMenuAdmin().forEach(function(cat) {
    var sub = ui.createMenu(cat.titulo);
    cat.items.forEach(function(it) { sub.addItem(it[0], it[1]); });
    menu.addSubMenu(sub);
  });
  menu.addToUi();
}

function onOpen() {
  menuAdministrativo();
}

// Este proyecto es un script independiente: el menú no aparece solo en la hoja.
// Ejecutar UNA VEZ esta función desde el editor de Apps Script (botón ▶).
// Es "headless": NO usa getUi(), así que funciona perfectamente desde el editor.
// Al aceptar los permisos queda activado para siempre (además el sistema
// intenta asegurar el disparador automáticamente en cada carga de la app).
function instalarTriggerMenuAdmin() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var yaEsta = false;

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "menuAdministrativo") {
      yaEsta = true;
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("menuAdministrativo").forSpreadsheet(ss).onOpen().create();

  try {
    PropertiesService.getScriptProperties().setProperty("MENU_TRIGGER_OK", new Date().toISOString());
    PropertiesService.getScriptProperties().deleteProperty("MENU_TRIGGER_INTENTOS");
  } catch (e) {}

  try {
    SpreadsheetApp.getUi().alert(
      "Menú instalado",
      (yaEsta ? "Disparador renovado.\n\n" : "") +
      "Cierra y vuelve a abrir la hoja de cálculo:\nverás el menú 🚒 GUARDIAS CBC.",
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Contexto sin UI (ejecución desde el editor): reporte por registro.
    Logger.log("✅ MENÚ INSTALADO CORRECTAMENTE. Cierra y vuelve a abrir la hoja de cálculo para ver 🚒 GUARDIAS CBC.");
  }
}

//────────────────────────────────────────────
// 🏠 SISTEMA
//────────────────────────────────────────────

//══════════════════════════════════════════
// 🚀 INSTALAR / ACTUALIZAR SISTEMA
// Función maestra: hace TODO lo visual y estructural en un solo paso.
// Idempotente: se puede ejecutar las veces que haga falta.
//
//   1. Menú 🚒 GUARDIAS CBC asegurado en la hoja
//   2. Estructura: crea hojas/cabeceras faltantes (sin borrar datos)
//   3. Config: layout por secciones + migración de valores + validaciones
//   4. Estadísticas: regeneradas desde Guardias
//   5. Formato completo de TODAS las hojas según su tipo
//      (encabezados, filtros, zebra, niveles 🔵🟢🟣, estados C/P/R/NC,
//       anchos, congelados, hojas técnicas ocultas y protegidas)
//══════════════════════════════════════════

function instalarSistema() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: "El sistema está ocupado. Espera unos segundos." };
  }

  var lineas = [];
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);

    // 1. Menú
    try {
      _autoInstalarTriggerMenu();
      lineas.push("✓ Menú 🚒 GUARDIAS CBC asegurado");
    } catch (e) {
      lineas.push("• Menú: pendiente de autorización (ejecuta instalarTriggerMenuAdmin una vez)");
    }

    // 2. Estructura base
    var creados = [];
    function asegurar(nombre, cabeceras) {
      var sh = ss.getSheetByName(nombre);
      if (!sh) { sh = ss.insertSheet(nombre); creados.push(nombre); }
      if (cabeceras && sh.getLastRow() === 0) sh.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    }
    asegurar("Guardias", ["Timestamp", "Nombre", "Email", "Cargo", "Guardia 01", "Guardia 02", "Guardia 03", "Guardia 04", "Nivel"]);
    asegurar("Config");
    asegurar("Asistencia", ["Email", "Nombre", "Cargo", "G1_Estado", "G1_ReempNombre", "G1_ReempEmail", "G2_Estado", "G2_ReempNombre", "G2_ReempEmail", "G3_Estado", "G3_ReempNombre", "G3_ReempEmail", "G4_Estado", "G4_ReempNombre", "G4_ReempEmail", "UltimaActualizacion"]);
    HOJAS_ESTADISTICAS.forEach(function(n) { asegurar(n, n === "Estadisticas" ? ["Métrica", "Valor"] : null); });
    lineas.push(creados.length ? "✓ Hojas creadas: " + creados.join(", ") : "✓ Estructura de hojas verificada");

    // 3. Config por secciones (migra valores legados B* → C*)
    prepararConfiguracionSilencioso(ss);
    lineas.push("✓ Config: secciones, valores y validaciones al día");

    // 4. Estadísticas regeneradas (antes del formato, para estilizar lo nuevo)
    generarEstadisticasBasicas();
    actualizarEstadisticas();
    lineas.push("✓ Estadísticas regeneradas desde Guardias");

    // 5. Formato completo de todas las hojas por tipo
    var fmt = aplicarFormatoCompletoCore({ silencioso: true });
    fmt.forEach(function(l) { lineas.push(l); });

    invalidarCacheConfig();

    lineas.push("");
    lineas.push("Sistema listo. Esta acción es idempotente:");
    lineas.push("puedes repetirla cuando quieras sin duplicar nada.");
  } catch (e) {
    Logger.log("instalarSistema: " + e);
    lineas.push("");
    lineas.push("⚠️ Se detuvo con error: " + e.message);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  var texto = lineas.join("\n");
  Logger.log(texto);
  try {
    SpreadsheetApp.getUi().alert("🚒 Instalar / Actualizar sistema", texto, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* contexto sin UI (editor) */ }
  return { ok: true, resumen: lineas };
}

// Alias con el otro nombre que se usa en la práctica
function actualizarSistema() { return instalarSistema(); }

function abrirSistema() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:18px;">' +
    '<p style="margin:0 0 10px;color:#444;font-size:13px;">URL vigente del sistema:</p>' +
    '<input readonly onclick="this.select()" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:12px;" value="' + CONFIG.webAppUrl + '">' +
    '<p style="margin:14px 0 0;color:#888;font-size:11px;line-height:1.5;">Si compartiste antes una URL de una versión antigua, actualízala: las versiones congeladas no reciben cambios.</p>' +
    '<div style="text-align:center;margin-top:16px;">' +
    '<a href="' + CONFIG.webAppUrl + '" target="_blank" style="display:inline-block;background:#9b1a1a;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:bold;font-size:13px;">Abrir ahora ↗</a>' +
    '</div></div>')
    .setWidth(430).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, "🚒 Guardias CBC");
}

function verUrlApp() {
  SpreadsheetApp.getUi().alert("URL de la aplicación", CONFIG.webAppUrl, SpreadsheetApp.getUi().ButtonSet.OK);
}

//────────────────────────────────────────────
// ⚙️ CONFIGURACIÓN
//────────────────────────────────────────────

function configurarCantidadGuardias() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt("Cantidad de guardias",
    "¿Cuántas guardias puede seleccionar un bombero por inscripción?\n\n2 · 3 · 4",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var elegida = resolverCantidadGuardias(resp.getResponseText(), "", null);
  if (elegida === null) {
    ui.alert("Valor inválido", "Ingresa 2, 3 o 4.", ui.ButtonSet.OK);
    return;
  }
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Config");
  sheet.getRange(CONFIG.celdasConfig.cantidadGuardias.nueva).setValue(elegida);
  invalidarCacheConfig();
  ui.alert("Cantidad de guardias", "Nuevas inscripciones: hasta " + elegida + " guardia(s).\n\nEl histórico existente se conserva intacto.", ui.ButtonSet.OK);
}

// Escribe el layout nuevo por secciones y migra valores legados (idempotente)
function prepararConfiguracion() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Config") || ss.insertSheet("Config");

  // Migrar valores legados → nuevos (solo si destino vacío)
  Object.keys(CONFIG.celdasConfig).forEach(function(k) {
    var dir = CONFIG.celdasConfig[k];
    var nuevo = sh.getRange(dir.nueva).getValue();
    if (nuevo !== "" && nuevo !== null) return;
    try {
      var viejo = sh.getRange(dir.legada).getValue();
      if (viejo !== "" && viejo !== null) sh.getRange(dir.nueva).setValue(viejo);
    } catch (e) {}
  });

  // Título y encabezados
  sh.getRange("A1:D1").merge().setValue("⚙️ CONFIGURACIÓN — GUARDIAS CBC")
    .setBackground(PALETA.tinta).setFontColor("#ffffff").setFontWeight("bold").setFontSize(12);
  sh.setRowHeight(1, 34);
  sh.getRange("A2:D2").setValues([["SECCIÓN", "PARÁMETRO", "VALOR", "NOTA"]])
    .setBackground("#333333").setFontColor("#ffffff").setFontWeight("bold");

  // IMPORTANTE: escribir solo etiquetas (A,B) y notas (D).
  // La columna C (VALOR) nunca se sobreescribe aquí.
  sh.getRange("A3:B8").setValues([
    ["CALENDARIO", "Primer lunes de guardia del mes"],
    ["CALENDARIO", "Semanas habilitadas (ej: 0,2)"],
    ["GUARDIAS",   "Cantidad de guardias por inscripción"],
    ["GUARDIAS",   "Fecha límite de inscripción"],
    ["REGLAS",     "Días de antelación para eliminar"],
    ["ASISTENCIA", "Mostrar panel de asistencia (1/0)"]
  ]);
  sh.getRange("D3:D8").setValues([
    ["Inicio de la semana 0 del calendario mensual."],
    ["Índices de semanas desde el primer lunes. Vacío = 0,2."],
    ["2, 3 o 4. Vacío = 4. No afecta registros históricos."],
    ["Fecha tope para anotarse. Vacío = sin límite."],
    ["Días mínimos antes de la primera guardia para poder darse de baja. 0 = sin restricción."],
    ["1 = visible en la app · 0 = completamente oculto."]
  ]);

  // Colores por sección
  var coloresSeccion = {
    "CALENDARIO": "#e3edfb", "GUARDIAS": "#f7e3e3",
    "REGLAS": "#efefef", "ASISTENCIA": "#e2f3e8"
  };
  for (var f = 3; f <= 8; f++) {
    sh.getRange(f, 1, 1, 1).setBackground(coloresSeccion[sh.getRange(f, 1).getValue()])
      .setFontWeight("bold").setFontSize(9);
    sh.getRange(f, 2).setFontWeight("bold");
    sh.getRange(f, 4).setFontColor("#777777").setFontSize(9).setWrap(true);
  }

  // Validaciones de datos (aviso, no bloqueo duro, para no frenar ediciones avanzadas)
  var reglas = SpreadsheetApp.newDataValidation();
  sh.getRange("C3").setDataValidation(reglas.requireDate().setAllowInvalid(true).build());
  sh.getRange("C5").setDataValidation(reglas.requireValueInList(["2", "3", "4"], true).setAllowInvalid(true).build());
  sh.getRange("C6").setDataValidation(reglas.requireDate().setAllowInvalid(true).build());
  sh.getRange("C7").setDataValidation(reglas.requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(true).build());
  sh.getRange("C8").setDataValidation(reglas.requireValueInList(["0", "1"], true).setAllowInvalid(true).build());
  sh.getRange("C3:C8").setBackground("#fffdf5").setFontWeight("bold");

  _estiloTablaBase(sh, { ultimaCol: 4, congelarFilas: 2, anchos: [120, 250, 110, 380], zebraDesde: 3 });
  invalidarCacheConfig();

  var cfg = obtenerConfigGeneral();
  SpreadsheetApp.getUi().alert("Hoja Config lista",
    "Layout por secciones aplicado.\n\n" + _resumenConfigTexto(cfg), SpreadsheetApp.getUi().ButtonSet.OK);
}

function verConfiguracionActual() {
  invalidarCacheConfig();
  SpreadsheetApp.getUi().alert("Configuración actual", _resumenConfigTexto(obtenerConfigGeneral()), SpreadsheetApp.getUi().ButtonSet.OK);
}

function _resumenConfigTexto(cfg) {
  var meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var limite = cfg.fechaLimite
    ? Utilities.formatDate(new Date(cfg.fechaLimite), Session.getScriptTimeZone(), "dd/MM/yyyy")
    : "(sin límite)";
  return [
    "📅 Mes activo:            " + meses[cfg.mes] + " " + cfg.año,
    "🗓 Inicio (semana 0):     " + Utilities.formatDate(new Date(cfg.inicio), Session.getScriptTimeZone(), "dd/MM/yyyy"),
    "🔢 Semanas habilitadas:   " + cfg.semanas.join(", "),
    "🚨 Cantidad de guardias:  " + cfg.cantidadGuardias,
    "⏳ Límite de inscripción: " + limite,
    "🗑 Días para eliminar:    " + cfg.diasEliminacion,
    "",
    (cfg.mostrarAsistencia ? "ASISTENCIA ● Habilitada" : "ASISTENCIA ○ Deshabilitada")
  ].join("\n");
}

//────────────────────────────────────────────
// 🎨 FORMATO
//────────────────────────────────────────────

// Estilo base reutilizable (idempotente: siempre sobrescribe lo mismo)
function _estiloTablaBase(sh, o) {
  o = o || {};
  var ultimaCol = o.ultimaCol || Math.max(sh.getLastColumn(), 1);
  if (sh.getLastRow() > 0) {
    var cab = sh.getRange(1, 1, 1, ultimaCol);
    cab.setBackground(o.cabFondo || PALETA.tinta).setFontColor("#ffffff")
       .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center");
    sh.setFrozenRows(o.congelarFilas || 1);

    // Zebra: quitar bandings previos y aplicar uno canónico
    sh.getBandings().forEach(function(b) { b.remove(); });
    if (sh.getLastRow() > (o.zebraDesde || 1)) {
      var rango = sh.getRange((o.zebraDesde || 1) + 1, 1, sh.getLastRow() - (o.zebraDesde || 1), ultimaCol);
      rango.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
    }
  }
  (o.anchos || []).forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  if (o.ocultarGridlines !== false) sh.setHiddenGridlines(true);
}

// Bordes sutiles para toda la tabla (aspecto de app, no de hoja cruda)
function _bordes(sh, filas, cols) {
  try {
    if (filas > 0 && cols > 0) {
      sh.getRange(1, 1, filas, cols).setBorder(
        true, true, true, true, true, true,
        PALETA.borde, SpreadsheetApp.BorderStyle.SOLID
      );
    }
  } catch (e) { Logger.log("bordes " + sh.getName() + ": " + e); }
}

// Regla condicional simple: texto exacto → fondo/texto
function _reglaTexto(rango, textos, paleta) {
  var reglas = [];
  Object.keys(paleta).forEach(function(t) {
    reglas.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(t)
        .setBackground(paleta[t].bg || paleta[t])
        .setFontColor(paleta[t].fg || "#000000")
        .setBold(true)
        .setRanges([rango])
        .build()
    );
  });
  return reglas;
}

// Núcleo del formato completo. Devuelve líneas de resumen.
// opts.dryRun: calcula acciones sin escribir estilos destructivos.
// opts.silencioso: sin UI.
function aplicarFormatoCompletoCore(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var resumen = [];
  var dry = !!opts.dryRun;

  // ── Guardias (DATOS) ──
  var g = ss.getSheetByName("Guardias");
  if (g) {
    if (!dry) {
      var headersG = ["Timestamp", "Nombre", "Email", "Cargo", "Guardia 01", "Guardia 02", "Guardia 03", "Guardia 04", "Nivel"];
      var actuales = g.getRange(1, 1, 1, headersG.length).getValues()[0];
      var difieren = headersG.some(function(hx, i) { return String(actuales[i] || "") !== hx; });
      if (difieren) g.getRange(1, 1, 1, headersG.length).setValues([headersG]);

      _estiloTablaBase(g, { ultimaCol: 9, anchos: [150, 190, 210, 100, 105, 105, 105, 105, 130] });

      // Filtro (reemplazar si existe)
      if (g.getFilter()) g.getFilter().remove();
      if (g.getLastRow() > 1) g.getRange(1, 1, g.getLastRow(), 9).createFilter();

      // Formato de fechas y alineaciones
      g.getRange("E2:H").setNumberFormat("dd/mm/yyyy").setHorizontalAlignment("center");
      g.getRange("A2:A").setNumberFormat("dd/mm/yyyy hh:mm").setFontSize(9).setFontColor("#666666");
      g.getRange("I2:I").setHorizontalAlignment("center").setFontWeight("bold");

      // Diferenciación visual del nivel (canónico + legados, sin tocar datos)
      var reglasNivel = []
        .concat(_reglaTexto(g.getRange("I2:I"), ["INICIAL", "I", "No"], {"INICIAL": PALETA.nivel.INICIAL, "I": PALETA.nivel.INICIAL, "No": PALETA.nivel.INICIAL}))
        .concat(_reglaTexto(g.getRange("I2:I"), ["OPERATIVO", "O", "Sí", "si"], {"OPERATIVO": PALETA.nivel.OPERATIVO, "O": PALETA.nivel.OPERATIVO, "Sí": PALETA.nivel.OPERATIVO, "si": PALETA.nivel.OPERATIVO}))
        .concat(_reglaTexto(g.getRange("I2:I"), ["PROFESIONAL", "P"], {"PROFESIONAL": PALETA.nivel.PROFESIONAL, "P": PALETA.nivel.PROFESIONAL}));
      g.setConditionalFormatRules(reglasNivel);

      // Validaciones suaves
      var dv = SpreadsheetApp.newDataValidation();
      g.getRange("D2:D").setDataValidation(dv.requireValueInList(["voluntario", "maquinista"], true).setAllowInvalid(true).build());
      g.getRange("I2:I").setDataValidation(dv.requireValueInList(["INICIAL", "OPERATIVO", "PROFESIONAL"], true).setAllowInvalid(true).build());

      // Bordes y alineaciones finales
      _bordes(g, g.getLastRow(), 9);
      g.getRange("D2:D").setHorizontalAlignment("center");

      // Timestamp atenuado ya aplicado; nombre destacado
      g.getRange("B2:B").setFontWeight("medium");
    }
    resumen.push("✓ Guardias — DATOS: encabezados, filtros, fechas, niveles 🔵🟢🟣, validaciones");
  }

  // ── Config (CONFIGURACION) ──
  var cfgSh = ss.getSheetByName("Config");
  if (cfgSh) {
    if (!dry) prepararConfiguracionSilencioso(ss);
    resumen.push("✓ Config — CONFIGURACIÓN: secciones, valores migrados, validaciones");
  }

  // ── Asistencia (ASISTENCIA) ──
  var a = ss.getSheetByName("Asistencia");
  if (a) {
    if (!dry) {
      var ultimaColA = Math.max(a.getLastColumn(), 16);
      _estiloTablaBase(a, { ultimaCol: ultimaColA, congelarFilas: 1, anchos: [210, 170, 95, 46, 90, 90, 46, 90, 90, 46, 90, 90, 46, 90, 90, 140] });
      a.setFrozenColumns(3);

      // Estados C/P/R/NC en columnas de estado D,G,J,M
      var reglasAsis = [];
      ["D", "G", "J", "M"].forEach(function(col) {
        var rango = a.getRange(col + "2:" + col);
        Object.keys(PALETA.estadoAsis).forEach(function(est) {
          reglasAsis.push(
            SpreadsheetApp.newConditionalFormatRule()
              .whenTextEqualTo(est)
              .setBackground(PALETA.estadoAsis[est]).setBold(true)
              .setRanges([rango]).build());
        });
      });
      a.setConditionalFormatRules(reglasAsis);
      a.getRange("P2:P").setNumberFormat("dd/mm/yyyy hh:mm").setFontSize(9);
      _bordes(a, a.getLastRow(), Math.min(a.getLastColumn(), 16));
    }
    resumen.push("✓ Asistencia — ASISTENCIA: C/P/R/NC con color, columnas congeladas");
  }

  // ── Estadísticas ──
  HOJAS_ESTADISTICAS.forEach(function(nombre) {
    var e = ss.getSheetByName(nombre);
    if (!e) return;
    if (!dry && e.getLastRow() > 0) {
      var cols = e.getLastColumn();
      var filasE = e.getLastRow() - 1;
      _estiloTablaBase(e, { ultimaCol: cols, anchos: Array.apply(null, Array(cols)).map(function(_, i) { return i === 0 ? 230 : 120; }) });
      if (filasE > 0) {
        e.getRange(2, 1, filasE, 1).setFontWeight("bold").setFontColor(PALETA.tinta);
        // Valores como "tarjetas": número grande y destacado
        e.getRange(2, 2, filasE, cols - 1)
          .setFontWeight("bold").setFontSize(12).setFontColor(PALETA.rojo)
          .setHorizontalAlignment("right");
        e.getRange(2, 3, filasE, Math.max(cols - 2, 0)).setHorizontalAlignment("right");
      }
      _bordes(e, e.getLastRow(), cols);
    }
    resumen.push("✓ " + nombre + " — ESTADÍSTICAS");
  });

  // ── Hojas LOG / BACKUP ──
  Object.keys(TIPO_HOJAS).forEach(function(nombre) {
    var tipo = TIPO_HOJAS[nombre];
    if (tipo !== "LOG" && tipo !== "BACKUP") return;
    var t = ss.getSheetByName(nombre);
    if (!t) return;
    if (!dry) {
      if (t.getLastRow() > 0) {
        t.getRange(1, 1, 1, Math.max(t.getLastColumn(), 1))
          .setBackground(PALETA.cabTecnica).setFontColor("#ffffff").setFontWeight("bold");
        t.setFrozenRows(1);
        t.setHiddenGridlines(true);
        (t.getBandings ? t.getBandings() : []).forEach(function(b) { b.remove(); });
      }
      try {
        var protecciones = t.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        if (protecciones.length === 0) {
          var p = t.protect();
          p.setDescription("Hojas técnicas — " + tipo + " (solo administración)");
          p.setWarningOnly(true);
        }
      } catch (e) { Logger.log("Protección " + nombre + ": " + e); }
      if (!t.isSheetHidden()) t.hideSheet();
    }
    resumen.push("✓ " + nombre + " — " + tipo + ": oculta y protegida (aviso)");
  });

  return resumen;
}

function aplicarFormatoCompleto(opts) {
  var resumen = aplicarFormatoCompletoCore(opts);
  return resumen;
}

function aplicarFormatoCompletoMenu() {
  var resumen = aplicarFormatoCompleto({ silencioso: false });
  SpreadsheetApp.getUi().alert("✨ Formato completo aplicado", resumen.join("\n") + "\n\n(Ejecutar de nuevo produce el mismo resultado)", SpreadsheetApp.getUi().ButtonSet.OK);
}

function restaurarFormatoSistema() { aplicarFormatoCompletoMenu(); }
function ajustarColumnasYFilasMenu() { ajustarColumnasYFilas(); }

function ajustarColumnasYFilas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var g = ss.getSheetByName("Guardias");
  if (g) {
    g.setColumnWidths(1, 9, 130);
    g.setColumnWidth(1, 150); g.setColumnWidth(2, 190); g.setColumnWidth(3, 210);
    g.setColumnWidth(4, 100);
    g.setRowHeights(2, Math.max(g.getLastRow() - 1, 1), 24);
  }
  var cfg = ss.getSheetByName("Config");
  if (cfg) { cfg.setColumnWidths(1, 4, 150); cfg.setColumnWidth(4, 380); }
  SpreadsheetApp.getUi().alert("Anchos y alturas ajustados.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function alternarHojasTecnicas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var algunaVisible = CONFIG.hojasTecnicas.some(function(n) {
    var s = ss.getSheetByName(n);
    return s && !s.isSheetHidden();
  });
  CONFIG.hojasTecnicas.forEach(function(n) {
    var s = ss.getSheetByName(n);
    if (!s) return;
    if (algunaVisible) { if (!s.isSheetHidden()) s.hideSheet(); }
    else if (s.isSheetHidden()) s.showSheet();
  });
  SpreadsheetApp.getUi().alert(algunaVisible ? "Hojas técnicas ocultadas." : "Hojas técnicas visibles.");
}

//────────────────────────────────────────────
// 👨‍🚒 GUARDIAS
//────────────────────────────────────────────

function actualizarEstadisticasMenu() {
  generarEstadisticasBasicas();
  actualizarEstadisticas();
  aplicarFormatoCompletoCore({ silencioso: true });
  SpreadsheetApp.getUi().alert("📊 Estadísticas actualizadas",
    "Se regeneraron Estadisticas, Estadisticas_Dias,\nEstadisticas_Mensuales y Ranking.",
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function diagnosticoGuardias() {
  var filas = leerFilasGuardias();
  var cfg = obtenerConfigGeneral();
  var unicos = {};
  var desconocidos = [];
  var fueraDeSemana = 0;
  var mesActivoCount = 0;

  filas.forEach(function(f) {
    unicos[f.email] = (unicos[f.email] || 0) + 1;
    if (f.nivel === null) desconocidos.push(f.nombre + " <" + f.email + "> = \"" + String(f.nivelRaw) + "\"");
    f.fechas.forEach(function(fecha) {
      if (!fecha) return;
      if (esSemanaHabilitada(fecha)) mesActivoCount++;
      else fueraDeSemana++;
    });
  });

  var msg =
    "🔎 DIAGNÓSTICO DE GUARDIAS\n\n" +
    "Registros (filas): " + filas.length + "\n" +
    "Bomberos únicos (por email): " + Object.keys(unicos).length + "\n" +
    "Fechas en el mes activo: " + mesActivoCount + "\n" +
    "Fechas fuera de semanas habilitadas: " + fueraDeSemana + "\n" +
    "Niveles desconocidos: " + desconocidos.length +
    (desconocidos.length ? "\n  • " + desconocidos.slice(0, 8).join("\n  • ") : "");
  SpreadsheetApp.getUi().alert(msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function diagnosticoCalendario() {
  var cfg = obtenerConfigGeneral();
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var dataAll = ss.getSheetByName(SHEET_NAME).getDataRange().getValues();
  var diasMes = new Date(cfg.año, cfg.mes + 1, 0).getDate();
  var lineas = [];
  var cumplen = 0;

  for (var d = 1; d <= diasMes; d++) {
    var fecha = cfg.año + "-" + String(cfg.mes + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    if (!esSemanaHabilitada(fecha)) continue;
    var cuenta = contarCupoDiaFilas(dataAll, fecha);
    var okMaq = cuenta.maquinistas >= REGLAS.cupoMaquinistaPorDia;
    var okOp = cuenta.operativos >= REGLAS.cupoOperativoPorDia;
    if (okMaq && okOp) cumplen++;
    lineas.push(
      String(d).padStart(2, " ") + ": " +
      "M " + cuenta.maquinistas + "/" + REGLAS.cupoMaquinistaPorDia +
      " · OP " + cuenta.operativos + "/" + REGLAS.cupoOperativoPorDia +
      (okMaq && okOp ? "  ✅" : "  ⚠️ falta" + (!okMaq ? " maquinista" : "") + ((!okMaq && !okOp) ? " y" : "") + (!okOp ? " operativos" : ""))
    );
  }

  SpreadsheetApp.getUi().alert(
    "📅 CALENDARIO — mes activo\n\n" + lineas.join("\n") +
    "\n\nDías que cumplen requisitos de despacho: " + cumplen,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

//────────────────────────────────────────────
// 🩺 ASISTENCIA
//────────────────────────────────────────────

function mostrarPanelAsistencia() { _setPanelAsistencia(true); }
function ocultarPanelAsistencia() { _setPanelAsistencia(false); }

function _setPanelAsistencia(visible) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Config");
  var dir = CONFIG.celdasConfig.mostrarAsistencia;
  sh.getRange(dir.nueva).setValue(visible ? 1 : 0);
  try { sh.getRange(dir.legada).clearContent(); } catch (e) {}
  invalidarCacheConfig();
  SpreadsheetApp.getUi().alert(
    visible ? "ASISTENCIA ● Habilitada\n\nEl panel volverá a verse al recargar la app."
            : "ASISTENCIA ○ Deshabilitada\n\nEl panel desaparecerá por completo al recargar la app.",
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function diagnosticoAsistencia() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var a = ss.getSheetByName("Asistencia");
  var g = leerFilasGuardias();
  var emailsConGuardia = {};
  g.forEach(function(f) { emailsConGuardia[f.email] = true; });

  var total = 0, estados = { C: 0, P: 0, R: 0, NC: 0 }, otros = 0;
  var sinGuardia = [];
  if (a && a.getLastRow() > 1) {
    var datos = a.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (!datos[i][0]) continue;
      total++;
      if (!emailsConGuardia[String(datos[i][0]).trim().toLowerCase()] &&
          emailsConGuardia[Object.keys(emailsConGuardia)[0]] !== undefined) {
        // email en Asistencia sin guardias activas: solo informativo si no coincide con nadie
      }
      for (var gi = 0; gi < 4; gi++) {
        var est = String(datos[i][3 + gi * 3] || "").trim();
        if (!est) continue;
        if (estados[est] !== undefined) estados[est]++;
        else otros++;
      }
    }
    // Emails en Asistencia que no están en Guardias
    var enGuardias = {};
    Object.keys(emailsConGuardia).forEach(function(e2) { enGuardias[e2] = true; });
    for (var j = 1; j < datos.length; j++) {
      var em = String(datos[j][0] || "").trim().toLowerCase();
      if (em && !enGuardias[em]) sinGuardia.push(em);
    }
  }

  SpreadsheetApp.getUi().alert(
    "🩺 DIAGNÓSTICO DE ASISTENCIA\n\n" +
    "Filas en Asistencia: " + total + "\n" +
    "Marcas C (Cumplió): " + estados.C + "\n" +
    "Marcas P (Permiso): " + estados.P + "\n" +
    "Marcas R (Reemplazo): " + estados.R + "\n" +
    "Marcas NC (No cumple): " + estados.NC + "\n" +
    "Estados no reconocidos: " + otros + "\n" +
    "Emails en Asistencia sin registro en Guardias: " + sinGuardia.length +
    (sinGuardia.length ? "\n  • " + sinGuardia.slice(0, 6).join("\n  • ") : ""),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

//────────────────────────────────────────────
// 🔧 MANTENIMIENTO
//────────────────────────────────────────────

function diagnosticoGeneral() {
  var partes = [];
  partes.push(_diagConfigLineas());
  partes.push(_diagDatosLineas());
  var filas = leerFilasGuardias();
  partes.push("Filas en Guardias: " + filas.length + " · Bomberos únicos: " +
    Object.keys(filas.reduce(function(acc, f) { acc[f.email] = 1; return acc; }, {})).length);
  SpreadsheetApp.getUi().alert("🔧 DIAGNÓSTICO GENERAL\n\n" + partes.join("\n\n"), SpreadsheetApp.getUi().ButtonSet.OK);
}

function verificarConfiguracion() {
  SpreadsheetApp.getUi().alert("CONFIGURACIÓN\n\n" + _diagConfigLineas(), SpreadsheetApp.getUi().ButtonSet.OK);
}

function _diagConfigLineas() {
  var cfg = obtenerConfigGeneral();
  var lineas = ["⚙️ Configuración:"];
  lineas.push("  ✓ Cantidad de guardias: " + cfg.cantidadGuardias + (cfg._origenes && cfg._origenes.cantidadGuardias !== "vacía" ? "" : " (default)"));
  lineas.push("  ✓ Semanas: " + cfg.semanas.join(", "));
  lineas.push("  ✓ Días eliminación: " + cfg.diasEliminacion);
  lineas.push("  ✓ Límite inscripción: " + (cfg.fechaLimite ? Utilities.formatDate(new Date(cfg.fechaLimite), Session.getScriptTimeZone(), "dd/MM/yyyy") : "(sin límite)"));
  lineas.push(cfg.mostrarAsistencia ? "  ASISTENCIA ● Habilitada" : "  ASISTENCIA ○ Deshabilitada");
  if (isNaN(new Date(cfg.inicio).getTime())) lineas.push("  ⚠️ Inicio de mes inválido");
  return lineas.join("\n");
}

function verificarDatos() {
  SpreadsheetApp.getUi().alert("DATOS\n\n" + _diagDatosLineas(), SpreadsheetApp.getUi().ButtonSet.OK);
}

function _diagDatosLineas() {
  var problemas = [];
  var vistos = {};
  leerFilasGuardias().forEach(function(f) {
    if (!esEmailValido(f.email)) problemas.push("Email inválido: fila " + f.fila + " (" + f.email + ")");
    if (f.cargo.indexOf("voluntario") === -1 && f.cargo.indexOf("maquinista") === -1)
      problemas.push("Cargo inválido: fila " + f.fila + " (" + f.cargo + ")");
    if (f.nivel === null) problemas.push("Nivel desconocido: fila " + f.fila + " (\"" + String(f.nivelRaw) + "\")");
    var clave = f.email + "|" + f.fechas.filter(Boolean).join(",");
    if (f.fechas.filter(Boolean).length && vistos[clave]) problemas.push("Registro duplicado: fila " + f.fila + " (" + f.email + ")");
    vistos[clave] = true;
  });
  return problemas.length
    ? "⚠️ Problemas encontrados (" + problemas.length + "):\n  • " + problemas.slice(0, 15).join("\n  • ")
    : "✓ Datos consistentes: sin problemas detectados.";
}

function repararEstructura() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var creados = [];

  function asegurar(nombre, cabeceras) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) { sh = ss.insertSheet(nombre); creados.push(nombre); }
    if (cabeceras && sh.getLastRow() === 0) sh.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    return sh;
  }
  asegurar("Guardias", ["Timestamp", "Nombre", "Email", "Cargo", "Guardia 01", "Guardia 02", "Guardia 03", "Guardia 04", "Nivel"]);
  asegurar("Config");
  asegurar("Asistencia", ["Email", "Nombre", "Cargo", "G1_Estado", "G1_ReempNombre", "G1_ReempEmail", "G2_Estado", "G2_ReempNombre", "G2_ReempEmail", "G3_Estado", "G3_ReempNombre", "G3_ReempEmail", "G4_Estado", "G4_ReempNombre", "G4_ReempEmail", "UltimaActualizacion"]);
  asegurar("Estadisticas", ["Métrica", "Valor"]);

  prepararConfiguracionSilencioso(ss);
  var resumen = aplicarFormatoCompletoCore({ silencioso: true });

  SpreadsheetApp.getUi().alert("🔧 Estructura reparada",
    (creados.length ? "Hojas creadas: " + creados.join(", ") + "\n\n" : "") +
    resumen.join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// Versión sin UI de prepararConfiguracion (para usar dentro de otros flujos)
function prepararConfiguracionSilencioso(ss) {
  ss = ss || SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Config") || ss.insertSheet("Config");

  Object.keys(CONFIG.celdasConfig).forEach(function(k) {
    var dir = CONFIG.celdasConfig[k];
    var nuevo = sh.getRange(dir.nueva).getValue();
    if (nuevo !== "" && nuevo !== null) return;
    try {
      var viejo = sh.getRange(dir.legada).getValue();
      if (viejo !== "" && viejo !== null) sh.getRange(dir.nueva).setValue(viejo);
    } catch (e) {}
  });

  sh.getRange("A1:D1").merge().setValue("⚙️ CONFIGURACIÓN — GUARDIAS CBC")
    .setBackground(PALETA.tinta).setFontColor("#ffffff").setFontWeight("bold").setFontSize(12);
  sh.setRowHeight(1, 34);
  sh.getRange("A2:D2").setValues([["SECCIÓN", "PARÁMETRO", "VALOR", "NOTA"]])
    .setBackground("#333333").setFontColor("#ffffff").setFontWeight("bold");

  // Igual que arriba: C (VALOR) jamás se sobreescribe.
  sh.getRange("A3:B8").setValues([
    ["CALENDARIO", "Primer lunes de guardia del mes"],
    ["CALENDARIO", "Semanas habilitadas (ej: 0,2)"],
    ["GUARDIAS",   "Cantidad de guardias por inscripción"],
    ["GUARDIAS",   "Fecha límite de inscripción"],
    ["REGLAS",     "Días de antelación para eliminar"],
    ["ASISTENCIA", "Mostrar panel de asistencia (1/0)"]
  ]);
  sh.getRange("D3:D8").setValues([
    ["Inicio de la semana 0 del calendario mensual."],
    ["Índices de semanas desde el primer lunes. Vacío = 0,2."],
    ["2, 3 o 4. Vacío = 4. No afecta registros históricos."],
    ["Fecha tope para anotarse. Vacío = sin límite."],
    ["Días mínimos antes de la primera guardia para poder darse de baja. 0 = sin restricción."],
    ["1 = visible en la app · 0 = completamente oculto."]
  ]);


  var coloresSeccion = { "CALENDARIO": "#e3edfb", "GUARDIAS": "#f7e3e3", "REGLAS": "#efefef", "ASISTENCIA": "#e2f3e8" };
  for (var f = 3; f <= 8; f++) {
    sh.getRange(f, 1, 1, 1).setBackground(coloresSeccion[sh.getRange(f, 1).getValue()])
      .setFontWeight("bold").setFontSize(9);
    sh.getRange(f, 2).setFontWeight("bold");
    sh.getRange(f, 4).setFontColor("#777777").setFontSize(9).setWrap(true);
  }

  var reglas = SpreadsheetApp.newDataValidation();
  sh.getRange("C3").setDataValidation(reglas.requireDate().setAllowInvalid(true).build());
  sh.getRange("C5").setDataValidation(reglas.requireValueInList(["2", "3", "4"], true).setAllowInvalid(true).build());
  sh.getRange("C6").setDataValidation(reglas.requireDate().setAllowInvalid(true).build());
  sh.getRange("C7").setDataValidation(reglas.requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(true).build());
  sh.getRange("C8").setDataValidation(reglas.requireValueInList(["0", "1"], true).setAllowInvalid(true).build());
  sh.getRange("C3:C8").setBackground("#fffdf5").setFontWeight("bold");
  sh.getRange("C3:C8").setHorizontalAlignment("center");

  _estiloTablaBase(sh, { ultimaCol: 4, congelarFilas: 2, anchos: [120, 250, 110, 380], zebraDesde: 3 });
  _bordes(sh, 8, 4);
  invalidarCacheConfig();
}

//────────────────────────────────────────────
// 🧪 PRUEBAS
//────────────────────────────────────────────

function ejecutarTestsMenu() {
  var res = ejecutarTestsFase1();
  try {
    PropertiesService.getScriptProperties().setProperty("ULTIMO_TEST", JSON.stringify({
      fecha: new Date().toISOString(),
      total: res.total,
      ok: res.ok,
      fallos: res.fallos
    }));
  } catch (e) { Logger.log("Guardar resultado tests: " + e); }
}

function verResultadoTests() {
  var txt;
  try {
    var crudo = PropertiesService.getScriptProperties().getProperty("ULTIMO_TEST");
    if (!crudo) {
      txt = "Aún no se han ejecutado tests desde el menú.";
    } else {
      var r = JSON.parse(crudo);
      txt = "Última ejecución: " + r.fecha.replace("T", " ").substring(0, 19) + " UTC\n" +
            "Resultado: " + r.ok + "/" + r.total + " OK" +
            (r.fallos && r.fallos.length ? "\n\nFallos:\n" + r.fallos.map(function(f) { return "✗ " + f.nombre + " — " + f.error; }).join("\n") : "\n\nSin fallos.");
    }
  } catch (e) {
    txt = "No se pudo leer el resultado: " + e;
  }
  SpreadsheetApp.getUi().alert("🧪 Tests FASE 1/2", txt, SpreadsheetApp.getUi().ButtonSet.OK);
}
