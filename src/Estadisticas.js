const HOJA_ESTADISTICAS_DIAS = "Estadisticas_Dias";
const HOJA_ESTADISTICAS_MES  = "Estadisticas_Mensuales";
const HOJA_RANKING           = "Ranking";

//══════════════════════════════════════════
// ACTUALIZAR TODO
//══════════════════════════════════════════

function actualizarEstadisticas() {
  generarEstadisticasDias();
  generarEstadisticasMensuales();
  generarRanking();
}

//══════════════════════════════════════════
// ESTADÍSTICAS POR DÍA
//══════════════════════════════════════════

function generarEstadisticasDias() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var origen = ss.getSheetByName(SHEET_NAME);
  var hoja = ss.getSheetByName(HOJA_ESTADISTICAS_DIAS);

  if (!hoja) hoja = ss.insertSheet(HOJA_ESTADISTICAS_DIAS);
  hoja.clear();

  var datos = origen.getDataRange().getValues();
  var stats = {};

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (!fila[2]) continue;

    var cargo = String(fila[3] || "").trim().toLowerCase();
    // Solo contar si hay un cargo válido
    if (cargo.indexOf("voluntario") === -1 && cargo.indexOf("maquinista") === -1) continue;

    for (var c = 4; c <= 7; c++) {
      var fecha = fila[c];
      if (!fecha) continue;

      var fechaStr = Utilities.formatDate(
        new Date(fecha),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      );

      if (!stats[fechaStr]) {
        stats[fechaStr] = { voluntarios: 0, maquinistas: 0 };
      }

      if (cargo.indexOf("maquinista") !== -1) {
        stats[fechaStr].maquinistas++;
      }
      if (cargo.indexOf("voluntario") !== -1) {
        stats[fechaStr].voluntarios++;
      }
    }
  }

  var salida = [["Fecha", "Voluntarios", "Maquinistas", "Total"]];
  Object.keys(stats).sort().forEach(function(fecha) {
    var v = stats[fecha].voluntarios;
    var m = stats[fecha].maquinistas;
    salida.push([fecha, v, m, v + m]);
  });

  if (salida.length > 1) {
    hoja.getRange(1, 1, salida.length, salida[0].length).setValues(salida);
  }
}

//══════════════════════════════════════════
// ESTADÍSTICAS MENSUALES
//══════════════════════════════════════════

function generarEstadisticasMensuales() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var origen = ss.getSheetByName(SHEET_NAME);
  var datos = origen.getDataRange().getValues();

  // Agrupar por mes-año
  var stats = {};

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (!fila[2]) continue;

    var cargo = String(fila[3] || "").trim().toLowerCase();
    if (cargo.indexOf("voluntario") === -1 && cargo.indexOf("maquinista") === -1) continue;

    for (var c = 4; c <= 7; c++) {
      var fecha = fila[c];
      if (!fecha) continue;

      var f = new Date(fecha);
      var key = f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0");

      if (!stats[key]) {
        stats[key] = {
          año: f.getFullYear(),
          mes: f.getMonth(),
          voluntarios: 0,
          maquinistas: 0,
          total: 0
        };
      }

      if (cargo.indexOf("maquinista") !== -1) {
        stats[key].maquinistas++;
      }
      if (cargo.indexOf("voluntario") !== -1) {
        stats[key].voluntarios++;
      }
      stats[key].total++;
    }
  }

  var hoja = ss.getSheetByName(HOJA_ESTADISTICAS_MES);
  if (!hoja) hoja = ss.insertSheet(HOJA_ESTADISTICAS_MES);
  hoja.clear();

  var salida = [["Mes", "Año", "Voluntarios", "Maquinistas", "Total"]];
  var meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  Object.keys(stats).sort().forEach(function(key) {
    var s = stats[key];
    salida.push([meses[s.mes], s.año, s.voluntarios, s.maquinistas, s.total]);
  });

  if (salida.length > 1) {
    hoja.getRange(1, 1, salida.length, salida[0].length).setValues(salida);
  }
}

//══════════════════════════════════════════
// RANKING
//══════════════════════════════════════════

function generarRanking() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var origen = ss.getSheetByName(SHEET_NAME);
  var hoja = ss.getSheetByName(HOJA_RANKING);

  if (!hoja) hoja = ss.insertSheet(HOJA_RANKING);
  hoja.clear();

  var datos = origen.getDataRange().getValues();
  var ranking = {};

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (!fila[2]) continue;

    var nombre = fila[1];
    var email = fila[2];
    var key = nombre + "|" + email;

    if (!ranking[key]) {
      ranking[key] = { nombre: nombre, email: email, total: 0 };
    }

    for (var c = 4; c <= 7; c++) {
      if (fila[c]) ranking[key].total++;
    }
  }

  var salida = [["Nombre", "Email", "Total Guardias"]];
  Object.values(ranking)
    .sort(function(a, b) { return b.total - a.total; })
    .forEach(function(r) {
      salida.push([r.nombre, r.email, r.total]);
    });

  if (salida.length > 1) {
    hoja.getRange(1, 1, salida.length, salida[0].length).setValues(salida);
  }
}