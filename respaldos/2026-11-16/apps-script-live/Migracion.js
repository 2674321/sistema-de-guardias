//══════════════════════════════════════════
// MIGRACIÓN DE NIVELES (v2) — IDEMPOTENTE Y SEGURA
//
// Decisión aprobada:
//   "Sí"  → OPERATIVO
//   "No" o vacío → INICIAL
//   O/P/I y palabras completas → se normalizan a palabra completa
//   Valores desconocidos → NO se tocan, se reportan
//
// - No modifica fechas ni elimina registros.
// - Respalda los valores originales en hoja oculta _BackupMigracionNiveles.
// - Ejecutar desde el menú: Diagnóstico primero; luego Ejecutar.
//══════════════════════════════════════════

var HOJA_BACKUP_MIGRACION = "_BackupMigracionNiveles";

// Diagnóstico: qué cambiaría. No modifica nada.
function diagnosticoMigracionNiveles() {
  var res = _diagnosticoMigracion();
  var msg =
    "Filas con datos: " + res.total + "\n\n" +
    "Valores actuales de la columna Nivel:\n" +
    Object.keys(res.porValor).sort().map(function(k) {
      return "  • \"" + k + "\": " + res.porValor[k] + " fila(s)";
    }).join("\n") + "\n\n" +
    "Serán actualizadas: " + res.aCambiar.length + "\n" +
    "Sin cambio necesario (ya normalizado): " + res.sinCambio + "\n" +
    "DESCONOCIDOS (no se tocan): " + res.desconocidos.length +
    (res.desconocidos.length ? "\n  " + res.desconocidos.map(function(d) {
      return "fila " + d.fila + ": \"" + d.valor + "\"";
    }).join("\n  ") : "") +
    "\n\nEjecuta «Ejecutar migración niveles» para aplicar.";
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert("Diagnóstico de migración", msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* fuera del contexto UI */ }
  return res;
}

function _diagnosticoMigracion() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  var datos = sh.getDataRange().getValues();
  var filasConDatos = [];   // números de fila reales de la hoja
  var valores = [];         // valor crudo de la col 9 por cada una

  for (var i = 1; i < datos.length; i++) {
    if (!datos[i][2]) continue;
    filasConDatos.push(i + 1);
    valores.push(datos[i][8]);
  }

  var plan = planMigracionNiveles(valores);

  return {
    total: plan.total,
    porValor: plan.porValor,
    sinCambio: plan.sinCambio,
    desconocidos: plan.desconocidos.map(function(d) {
      return { fila: filasConDatos[d.indice], valor: d.valor };
    }),
    aCambiar: plan.aCambiar.map(function(c) {
      return { fila: filasConDatos[c.indice], valorActual: c.valorActual, nuevo: c.nuevo };
    })
  };
}

// Aplica la migración. dryRun=true solo valida sin escribir.
// Idempotente: una segunda ejecución reporta 0 cambios.
function ejecutarMigracionNiveles(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: "Sistema ocupado, intenta en unos segundos." };
  }
  try {
    var diag = _diagnosticoMigracion();

    if (diag.desconocidos.length > 0 && !dryRun) {
      // Seguridad: con valores desconocidos no se escribe nada automáticamente.
      return {
        ok: false,
        requiereRevision: true,
        error: "Hay " + diag.desconocidos.length + " valor(es) desconocido(s): corrígelos a mano antes de migrar.",
        diagnostico: diag
      };
    }

    if (!dryRun && diag.aCambiar.length > 0) {
      _respaldarColumnaNivel(diag);
    }

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);

    // Encabezado canónico de la columna
    if (!dryRun && String(sh.getRange(1, 9).getValue()).trim() !== "Nivel") {
      sh.getRange(1, 9).setValue("Nivel");
    }

    var aplicados = 0;
    for (var k = 0; k < diag.aCambiar.length; k++) {
      var c = diag.aCambiar[k];
      if (dryRun) continue;
      sh.getRange(c.fila, 9).setValue(c.nuevo);
      aplicados++;
    }

    return {
      ok: true,
      dryRun: !!dryRun,
      totalFilas: diag.total,
      aplicados: aplicados,
      sinCambio: diag.sinCambio,
      desconocidos: diag.desconocidos,
      porValorOriginal: diag.porValor
    };
  } catch (e) {
    Logger.log("ejecutarMigracionNiveles: " + e);
    return { ok: false, error: "Fallo durante la migración: " + e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Entrada segura desde el menú: confirma antes de escribir
function ejecutarMigracionDesdeMenu() {
  var ui = SpreadsheetApp.getUi();
  var diag = _diagnosticoMigracion();

  if (diag.desconocidos.length > 0) {
    ui.alert("Migración bloqueada",
      "Hay valores desconocidos que debes corregir a mano:\n" +
      diag.desconocidos.map(function(d) { return "fila " + d.fila + ": \"" + d.valor + "\""; }).join("\n"),
      ui.ButtonSet.OK);
    return;
  }

  if (diag.aCambiar.length === 0) {
    ui.alert("Nada por hacer", "Todas las filas ya están normalizadas (" + diag.sinCambio + " filas).", ui.ButtonSet.OK);
    return;
  }

  var resp = ui.alert(
    "Confirmar migración",
    "Se actualizará la columna Nivel en " + diag.aCambiar.length + " fila(s).\n" +
    "Se creará un respaldo previo en «" + HOJA_BACKUP_MIGRACION + "».\n" +
    "No se modifican fechas ni se borran registros.\n\n¿Continuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = ejecutarMigracionNiveles(false);
  ui.alert(resultado.ok
    ? "Migración completada: " + resultado.aplicados + " fila(s) actualizada(s)."
    : "Error: " + resultado.error);
}

// Respaldo previo (solo columna afectada)
function _respaldarColumnaNivel(diag) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var bk = ss.getSheetByName(HOJA_BACKUP_MIGRACION);
  if (!bk) {
    bk = ss.insertSheet(HOJA_BACKUP_MIGRACION);
    bk.setHidden(true);
    bk.getRange(1, 1, 1, 4).setValues([["FechaRespaldo", "FilaHojaGuardias", "ValorOriginal", "ValorNuevo"]]);
  }
  var ahora = new Date();
  var filas = diag.aCambiar.map(function(c) {
    return [ahora, c.fila, c.valorActual, c.nuevo];
  });
  bk.getRange(bk.getLastRow() + 1, 1, filas.length, 4).setValues(filas);
}

// Detecta si la hoja Guardias tiene columnas extra o un header desalineado
// (Índice: J "Nivel" duplicado / >9 columnas con contenido). Barato: solo lee la fila 1.
function _layoutRequiereReparacion(sh) {
  try {
    if (!sh) return false;
    var cols = sh.getLastColumn();
    if (cols > 9) return true;
    var h = sh.getRange(1, 1, 1, cols).getValues()[0];
    for (var i = 0; i < h.length; i++) {
      if (i >= 9 && String(h[i]).trim()) return true;
    }
    return false;
  } catch (e) { return false; }
}

//══════════════════════════════════════════
// REPARACIÓN DE LAYOUT GUARDIAS (columna extra / datos corridos)
// Idempotente: normaliza header a 9 columnas (A:I) y reubica filas
// donde la fecha quedó en la columna Nivel (I) y el nivel en J.
//══════════════════════════════════════════

function repararLayoutGuardias() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) return { ok: false, error: "No existe la hoja " + SHEET_NAME };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: "Ocupado" };
  try {
    var valores = sh.getDataRange().getValues();
    var cols = valores[0].length;
    var reporte = { filasReparadas: 0, headerReparado: false, columnas: cols };

    // ── 1) Header: forzar exactamente 9 columnas ──
    var headerBase = ["Timestamp", "Nombre", "Email", "Cargo", "Guardia 01", "Guardia 02", "Guardia 03", "Guardia 04", "Nivel"];
    var headerActual = valores[0].slice(0, 9).map(function(v){ return String(v || "").trim(); });
    var headerOK = headerActual.join("|") === headerBase.join("|");
    if (!headerOK) {
      sh.getRange(1, 1, 1, 9).setValues([headerBase]);
      reporte.headerReparado = true;
    }
    if (cols > 9) {
      sh.getRange(1, 10, 1, cols - 9).clearContent();
      sh.getRange(1, 10, sh.getLastRow(), cols - 9).clearContent();
      reporte.columnas = 9;
    }

    // ── 2) Reparar filas corridas en memoria ──
    // Detección: el "Nivel" (col I) contiene lo que parece una fecha (la 5ª guardia
    // desplazada) y la col J contiene el nivel real. Reubicar: fechas → E:H, nivel → I.
    var actualizaciones = [];
    for (var i = 1; i < valores.length; i++) {
      var nivelI = valores[i][8];
      var nivelJ = valores[i][9];
      var pareceFechaI = nivelI instanceof Date ||
        /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(String(nivelI || "").trim());

      if (pareceFechaI && nivelJ) {
        // Las fechas están desplazadas: mover los 4 primeros valores-fecha a E:H y el nivel a I
        var nombre = valores[i][1], email = valores[i][2], cargo = valores[i][3];
        var fechasCorridas = valores[i].slice(4, 9); // E..I (puede haber fechas de más)
        var fFechas = fechasCorridas.filter(function(v){
          return v instanceof Date || /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(String(v || "").trim());
        });
        var g = [fFechas[0] || "", fFechas[1] || "", fFechas[2] || "", fFechas[3] || ""];
        var nivelReal = String(nivelJ).trim();
        // normalizar nivel real
        if (/^operativo/i.test(nivelReal)) nivelReal = "OPERATIVO";
        else if (/^profesional/i.test(nivelReal)) nivelReal = "PROFESIONAL";
        else if (/^inicial/i.test(nivelReal)) nivelReal = "INICIAL";
        else nivelReal = "INICIAL";
        var nuevaFila = [valores[i][0], nombre, email, cargo, g[0], g[1], g[2], g[3], nivelReal];
        actualizaciones.push({ fila: i + 1, valores: nuevaFila });
        reporte.filasReparadas++;
      }
    }

    for (var a = 0; a < actualizaciones.length; a++) {
      sh.getRange(actualizaciones[a].fila, 1, 1, 9).setValues([actualizaciones[a].valores]);
    }

    return { ok: true, reporte: reporte };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    lock.releaseLock();
  }
}
