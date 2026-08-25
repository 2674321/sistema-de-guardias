//══════════════════════════════════════════
// CAPA DE DATOS (Db)
// Utilidades de lectura/normalización sobre la hoja Guardias.
//══════════════════════════════════════════

// Normaliza el contenido de una celda de fecha a "YYYY-MM-DD"
function _fechaCelda(val) {
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(val || "").trim();
  return s.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, "$1-$2-$3")
          .replace(/^(\d{4})-(\d)-(\d)$/, "$1-0$2-0$3")
          .replace(/^(\d{4})-(\d{2})-(\d)$/, "$1-$2-0$3")
          .replace(/^(\d{4})-(\d)-(\d{2})$/, "$1-0$2-$3");
}

// Índice de guardia (0-3) de una fecha dentro de la fila del bombero
function _obtenerGuardiaIndex(email, fecha) {
  email = String(email || "").trim().toLowerCase();
  fecha = _fechaCelda(String(fecha || "").trim());
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var data = ss.getSheetByName(SHEET_NAME).getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2] || "").trim().toLowerCase() !== email) continue;
    for (var c = 4; c <= 7; c++) {
      if (!data[i][c]) continue;
      var f = data[i][c] instanceof Date
        ? Utilities.formatDate(data[i][c], Session.getScriptTimeZone(), "yyyy-MM-dd")
        : String(data[i][c] || "").trim();
      if (f === fecha) return c - 4;
    }
  }
  return -1;
}

// Cuenta ocupación de un día a partir del arreglo crudo de la hoja Guardias.
// Usa el normalizador único: los históricos "Sí" cuentan como operativos.
function contarCupoDiaFilas(dataAll, fechaStr) {
  var filas = [];
  for (var ri = 1; ri < dataAll.length; ri++) {
    if (!dataAll[ri][2]) continue;
    for (var ci = 4; ci <= 7; ci++) {
      if (!dataAll[ri][ci]) continue;
      var df = dataAll[ri][ci] instanceof Date
        ? Utilities.formatDate(dataAll[ri][ci], Session.getScriptTimeZone(), "yyyy-MM-dd")
        : String(dataAll[ri][ci] || "").trim();
      if (df === fechaStr) {
        filas.push({
          cargo: String(dataAll[ri][3] || ""),
          nivel: normalizarNivel(dataAll[ri][8])
        });
      }
    }
  }
  return contarCupoDia(filas);
}

// Lee todas las filas con datos de Guardias, normalizadas.
// Devuelve [{fila(1-based), timestamp, nombre, email, cargo, nivel, fechas:["YYYY-MM-DD" x4]}]
function leerFilasGuardias() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][2]) continue;
    var nivelRaw = data[i][8];
    var fechas = [];
    for (var c = 4; c <= 7; c++) {
      if (!data[i][c]) { fechas.push(""); continue; }
      fechas.push(data[i][c] instanceof Date
        ? Utilities.formatDate(data[i][c], Session.getScriptTimeZone(), "yyyy-MM-dd")
        : _fechaCelda(data[i][c]));
    }
    out.push({
      fila: i + 1,
      timestamp: data[i][0],
      nombre: String(data[i][1] || ""),
      email: String(data[i][2] || "").trim().toLowerCase(),
      cargo: String(data[i][3] || "").trim().toLowerCase(),
      nivelRaw: nivelRaw,
      nivel: normalizarNivel(nivelRaw),
      fechas: fechas
    });
  }
  return out;
}
