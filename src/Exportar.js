//════════════════════════════════════════════════════════════════
// EXPORTAR CALENDARIO → GOOGLE SHEET (no PDF)
//
// Replica la estructura y el estilo visual de
// Formato_calendario_guardia_xlsx.py (formato de referencia):
//   • Título: "Guardia Nocturna (dd de MES al dd de MES del YYYY)"
//     — desde el inicio de la primera guardia hasta el fin de la última.
//   • Encabezado de 2 filas, 5 subcolumnas por día:
//       Fecha Guardia | Cumple (Si | No) | Cubre (x2)
//   • Bloques semanales de 7 días cívicos:
//       semana de GUARDIA → fila de día roja  (#C00000 / fondo #F8CBAD)
//       semana de DESCANSO → fila de día azul (#2E74B5 / fondo #DDEBF7)
//       por bloque: OBAC · Maquinista · VOLUNTARIOS · Oficial de
//   • Asistencia precargada por persona/fecha:
//       C → "X" en Si · NC → "X" en No · R → "X" en primer Cubre · P → "P" en Si
//   • Fechas SIEMPRE cívicas (Date.UTC): inmunes a cambios de hora/DST.
//
// Separación DATOS vs PRESENTACIÓN:
//   _modeloHojaGuardias() y los helpers _* son PURAS (testeables en Node).
//   generarHojaGuardias() solo orquesta servicios de Apps Script:
//   leer datos → SpreadsheetApp.create() → aplicar modelo → carpeta Drive.
//
// OBAC y Oficial de quedan vacíos: no existen en el modelo de datos
// (cargos `voluntario`/`maquinista`). La estructura queda preparada para
// incorporarlos vía _oficialesPosibles() cuando exista la fuente.
//════════════════════════════════════════════════════════════════

var _CARPETA_CALENDARIOS = "Calendario de Guardias";
var _HOJA_NOMBRE = "Calendario Guardia";

var _COL_LABEL = 1;
var _N_DIAS = 7;
var _N_SUB = 5; // Fecha Guardia | Cumple-Si | Cumple-No | Cubre | Cubre
var _TOTAL_COLS = _COL_LABEL + _N_DIAS * _N_SUB; // 36

var _MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
var _DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MI\u00C9RCOLES", "JUEVES", "VIERNES", "S\u00C1BADO"];

var _C_ROJO_HDR = "#C00000";
var _C_ROJO_BG = "#F8CBAD";
var _C_AZUL_HDR = "#2E74B5";
var _C_AZUL_BG = "#DDEBF7";
var _C_AMARILLO = "#FFFF00";
var _C_BLANCO = "#FFFFFF";
var _C_NEGRO = "#000000";
var _FONT = "Calibri";

//────────────────────────────────────────────
// HELPERS CÍVICOS (puros)
//────────────────────────────────────────────

function _formatFechaLarga(key) {
  var fp = fechaPartesDe(key);
  if (!fp) return key;
  var cap = _MESES_ES[fp.m - 1];
  return fp.d + " de " + cap.charAt(0).toUpperCase() + cap.slice(1);
}
function _formatFechaLargaCorto(key) {
  var fp = fechaPartesDe(key);
  if (!fp) return key;
  return fp.d + " de " + _MESES_ES[fp.m - 1];
}
function _formatFechaCorta(key) {
  var fp = fechaPartesDe(key);
  if (!fp) return key;
  return pad2(fp.d) + "-" + pad2(fp.m) + "-" + pad2(fp.y % 100);
}
function _diaSemana(key) {
  var fp = fechaPartesDe(key);
  if (!fp) return "";
  return _DIAS_ES[new Date(Date.UTC(fp.y, fp.m - 1, fp.d)).getUTCDay()];
}
function _ordenarGuardiasPorInicio(guardias) {
  return guardias.slice().sort(function(a, b) {
    return a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0;
  });
}
function _tituloHojaDesde(guardias) {
  if (!guardias.length) return "";
  var inicio = guardias[0].inicio;
  var fin = guardias[guardias.length - 1].fin;
  return "Guardia Nocturna (" + _formatFechaLarga(inicio) + " al " +
         _formatFechaLargaCorto(fin) + " del " + fechaPartesDe(fin).y + ")";
}
function _nombreArchivoGuardias(guardias) {
  if (!guardias.length) return "Calendario de Guardias";
  return "Calendario de Guardias - " + _formatFechaCorta(guardias[0].inicio) +
         " a " + _formatFechaCorta(guardias[guardias.length - 1].fin);
}

//────────────────────────────────────────────
// MODELO PURA DE LA HOJA (testeable en Node)
//────────────────────────────────────────────

function _modeloHojaGuardias(guardias, personas, asisEstado, oficiales) {
  if (!guardias || !guardias.length) {
    return { ok: false, error: "No existen guardias programadas para generar." };
  }
  var orden = _ordenarGuardiasPorInicio(guardias);
  var inicio = orden[0].inicio;
  var fin = orden[orden.length - 1].fin;

  var dias = [];
  for (var k = inicio; k <= fin; k = sumarDiasCivil(k, 1)) {
    dias.push({ key: k, nombre: _diaSemana(k), corta: _formatFechaCorta(k), esGuardia: esDiaGuardiaEn(orden, k) });
  }
  if (!dias.length) return { ok: false, error: "No existen guardias programadas para generar." };

  var bloques = [];
  for (var b = 0; b < dias.length; b += _N_DIAS) bloques.push(dias.slice(b, b + _N_DIAS));

  var porDia = (oficiales && oficiales.porDia) || {};
  var notaOficial = (oficiales && oficiales.nota) || "No existe fuente de datos suficiente para determinar el oficial.";

  var GRID = [];
  var merges = [];
  var estilos = [];
  var indice = {};
  var altoFilas = { 1: 22, 3: 15, 4: 15 };

  function setVal(r, c, v) {
    if (!GRID[r - 1]) GRID[r - 1] = [];
    GRID[r - 1][c - 1] = v;
  }
  function addMerge(r1, c1, r2, c2) { merges.push({ r1: r1, c1: c1, r2: r2, c2: c2 }); }
  function addStyle(s) { estilos.push(s); }
  function baseDia(i) { return _COL_LABEL + 1 + i * _N_SUB; }

  // ── Título
  setVal(1, 1, _tituloHojaDesde(orden));
  addMerge(1, 1, 1, _TOTAL_COLS);
  addStyle({ r1: 1, c1: 1, r2: 1, c2: _TOTAL_COLS, bold: true, size: 13, align: "center", valign: "middle", wrap: true });
  altoFilas[1] = 22;

  // ── Encabezado general (una sola vez), filas 3 y 4
  addMerge(3, 1, 4, 1);
  for (var d = 0; d < _N_DIAS; d++) {
    var base = baseDia(d);
    addMerge(3, base, 4, base);
    setVal(3, base, "Fecha\nGuardia");
    addStyle({ r1: 3, c1: base, r2: 4, c2: base, bold: true, size: 8, align: "center", valign: "middle", wrap: true });
    addMerge(3, base + 1, 3, base + 2);
    setVal(3, base + 1, "Cumple");
    addStyle({ r1: 3, c1: base + 1, r2: 3, c2: base + 2, bold: true, size: 8, align: "center", valign: "middle" });
    setVal(4, base + 1, "Si");
    setVal(4, base + 2, "No");
    addStyle({ r1: 4, c1: base + 1, r2: 4, c2: base + 2, bold: true, size: 8, align: "center", valign: "middle" });
    addMerge(3, base + 3, 3, base + 4);
    setVal(3, base + 3, "Cubre");
    addStyle({ r1: 3, c1: base + 3, r2: 3, c2: base + 4, bold: true, size: 8, align: "center", valign: "middle" });
  }

  // anchos de columna (etiqueta 11; por día 15 + 4 × 4,2)
  var anchoColumnas = {};
  anchoColumnas[_COL_LABEL] = 11;
  for (var d2 = 0; d2 < _N_DIAS; d2++) {
    var b2 = baseDia(d2);
    anchoColumnas[b2] = 15;
    anchoColumnas[b2 + 1] = 4.2;
    anchoColumnas[b2 + 2] = 4.2;
    anchoColumnas[b2 + 3] = 4.2;
    anchoColumnas[b2 + 4] = 4.2;
  }

  function maqDe(dd) { return (personas[dd.key] || []).filter(function(p) { return p.esMaq; }); }
  function volsDe(dd) { return (personas[dd.key] || []).filter(function(p) { return !p.esMaq; }); }

  function filaDatosPersona(r, i, dd, lista, bg) {
    var base = baseDia(i);
    addStyle({ r1: r, c1: base, r2: r, c2: base, bg: bg, size: 8, align: "center", valign: "middle", wrap: true });
    addStyle({ r1: r, c1: base + 1, r2: r, c2: base + _N_SUB - 1, bg: bg, size: 8, align: "center", valign: "middle", bold: true });
    var Si = "", No = "", Cubre1 = "", Cubre2 = "";
    lista.forEach(function(p) {
      var est = asisEstado[p.email + "|" + dd.key];
      if (est === "C") Si = "X";
      else if (est === "NC") No = "X";
      else if (est === "R") Cubre1 = "X";
      else if (est === "P") Si = "P";
    });
    setVal(r, base, lista.map(function(p) { return p.nombre; }).join(", ") || "");
    setVal(r, base + 1, Si);
    setVal(r, base + 2, No);
    setVal(r, base + 3, Cubre1);
    setVal(r, base + 4, Cubre2);
  }

  // ── Bloques semanales
  var row = 5;
  bloques.forEach(function(bloque) {
    var roja = !!bloque[0].esGuardia;
    var hdr = roja ? _C_ROJO_HDR : _C_AZUL_HDR;
    var bg = roja ? _C_ROJO_BG : _C_AZUL_BG;
    var maxVol = 1;
    bloque.forEach(function(dd) { var v = volsDe(dd); if (v.length > maxVol) maxVol = v.length; });

    var rDia = row, rObac = row + 1, rMaq = row + 2, rVol0 = row + 3;
    var rOf = row + 3 + maxVol;

    // fila de día
    bloque.forEach(function(dd, i) {
      var base = baseDia(i);
      addMerge(rDia, base, rDia, base + _N_SUB - 1);
      setVal(rDia, base, dd.nombre + "\n" + dd.corta);
      addStyle({ r1: rDia, c1: base, r2: rDia, c2: base + _N_SUB - 1, bg: hdr, bold: true, size: 8, color: _C_BLANCO, align: "center", valign: "middle", wrap: true });
    });
    altoFilas[rDia] = 26;

    var volRows = [];
    for (var v = 0; v < maxVol; v++) volRows.push(rVol0 + v);

    bloque.forEach(function(dd, i) { indice[dd.key] = { dia: rDia, obac: rObac, maq: rMaq, vol: volRows, oficial: rOf, roja: roja, inicio: bloque[0].key }; });

    // OBAC (sin dato en el modelo → vacío)
    setVal(rObac, _COL_LABEL, "OBAC");
    addStyle({ r1: rObac, c1: _COL_LABEL, r2: rObac, c2: _COL_LABEL, bold: true, size: 8, align: "left", valign: "middle" });
    for (var i2 = 0; i2 < _N_DIAS; i2++) {
      var b3 = baseDia(i2);
      setVal(rObac, b3, "");
      addStyle({ r1: rObac, c1: b3, r2: rObac, c2: b3 + _N_SUB - 1, bg: bg, size: 8, align: "center", valign: "middle", wrap: true });
    }

    // Maquinista
    setVal(rMaq, _COL_LABEL, "Maquinista");
    addStyle({ r1: rMaq, c1: _COL_LABEL, r2: rMaq, c2: _COL_LABEL, bold: true, size: 8, align: "left", valign: "middle" });
    bloque.forEach(function(dd, i) { filaDatosPersona(rMaq, i, dd, maqDe(dd), bg); });

    // Voluntarios (etiqueta vertical; 1 fila por voluntario máximo del bloque)
    addMerge(rVol0, _COL_LABEL, rVol0 + maxVol - 1, _COL_LABEL);
    setVal(rVol0, _COL_LABEL, "VOLUNTARIOS");
    addStyle({ r1: rVol0, c1: _COL_LABEL, r2: rVol0 + maxVol - 1, c2: _COL_LABEL, bold: true, size: 8, align: "center", valign: "middle", rotate: 90, wrap: true });
    for (var v2 = 0; v2 < maxVol; v2++) {
      var rv = rVol0 + v2;
      bloque.forEach(function(dd, i) {
        var lista2 = volsDe(dd);
        filaDatosPersona(rv, i, dd, lista2[v2] ? [lista2[v2]] : [], bg);
      });
    }

    // Oficial de (dato del bloque; hoy sin fuente → en blanco)
    setVal(rOf, _COL_LABEL, "Oficial de");
    addStyle({ r1: rOf, c1: _COL_LABEL, r2: rOf, c2: _COL_LABEL, bold: true, size: 8, align: "left", valign: "middle", bg: _C_AMARILLO });
    var nombreOf = "";
    bloque.forEach(function(dd) { if (!nombreOf && porDia[dd.key]) nombreOf = porDia[dd.key]; });
    addMerge(rOf, _COL_LABEL + 1, rOf, _TOTAL_COLS);
    setVal(rOf, _COL_LABEL + 1, nombreOf);
    addStyle({ r1: rOf, c1: _COL_LABEL + 1, r2: rOf, c2: _TOTAL_COLS, bold: true, size: 9, align: "left", valign: "middle", bg: _C_AMARILLO });

    row = rOf + 1;
  });

  var totalFilas = GRID.length;
  for (var ir = 1; ir <= totalFilas; ir++) {
    if (!GRID[ir - 1]) GRID[ir - 1] = [];
    for (var ic = 1; ic <= _TOTAL_COLS; ic++) {
      if (GRID[ir - 1][ic - 1] === undefined) GRID[ir - 1][ic - 1] = "";
    }
  }

  return {
    ok: true,
    nombre: _nombreArchivoGuardias(orden),
    titulo: _tituloHojaDesde(orden),
    valores: GRID,
    merges: merges,
    estilos: estilos,
    indice: indice,
    anchoColumnas: anchoColumnas,
    altoFilas: altoFilas,
    freezeRows: 4,
    freezeCols: 1,
    areaBorde: { r1: 1, c1: 1, r2: totalFilas, c2: _TOTAL_COLS },
    notaOficial: notaOficial
  };
}

// Oficial de guardia a partir de registros con cargo "oficial".
// Hoy no existe ese cargo → porDia vacío y nota informativa.
function _oficialesPosibles(guardias, registros) {
  var porDia = {};
  (registros || []).forEach(function(r) {
    var cargo = String(r.cargo || "").toLowerCase();
    if (cargo.indexOf("oficial") === -1) return;
    (r.fechas || []).forEach(function(fecha) {
      var fp = fechaPartesDe(fecha);
      if (!fp) return;
      porDia[fp.y + "-" + pad2(fp.m) + "-" + pad2(fp.d)] = r.nombre;
    });
  });
  return {
    porDia: porDia,
    nota: Object.keys(porDia).length ? "" : "No existe fuente de datos suficiente para determinar el oficial."
  };
}

//────────────────────────────────────────────
// ORQUESTADOR SERVER (Apps Script)
//────────────────────────────────────────────

function generarHojaGuardias() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var guardias = _ordenarGuardiasPorInicio(obtenerGuardias().guardias);
    if (!guardias.length) {
      return { ok: false, error: "No existen guardias programadas para generar." };
    }
    var inicio = guardias[0].inicio;
    var fin = guardias[guardias.length - 1].fin;

    var registros = leerFilasGuardias();
    var personas = {};
    registros.forEach(function(f) {
      var esMaq = String(f.cargo || "").toLowerCase().indexOf("maquinista") !== -1;
      var esVol = String(f.cargo || "").toLowerCase().indexOf("voluntario") !== -1;
      if (!esMaq && !esVol) return;
      (f.fechas || []).forEach(function(fecha) {
        var fp = fechaPartesDe(fecha);
        if (!fp) return;
        var keyF = fp.y + "-" + pad2(fp.m) + "-" + pad2(fp.d);
        if (keyF < inicio || keyF > fin) return;
        if (!personas[keyF]) personas[keyF] = [];
        var ya = personas[keyF].some(function(p) { return p.email === f.email; });
        if (ya) return;
        personas[keyF].push({ nombre: f.nombre, email: f.email, nivel: f.nivel || "INICIAL", esMaq: esMaq, esVol: esVol });
      });
    });

    // Asistencia: email|fecha → estado (C/P/NC/R)
    var asisEstado = {};
    try {
      var asisSh = ss.getSheetByName("Asistencia");
      if (asisSh) {
        var asisData = asisSh.getDataRange().getValues();
        var asisByEmail = {};
        for (var i = 1; i < asisData.length; i++) {
          var em = String(asisData[i][0] || "").trim().toLowerCase();
          if (em) asisByEmail[em] = asisData[i];
        }
        registros.forEach(function(f) {
          var rowA = asisByEmail[f.email];
          if (!rowA) return;
          (f.fechas || []).forEach(function(fecha, gi) {
            var fp = fechaPartesDe(fecha);
            if (!fp) return;
            var keyF = fp.y + "-" + pad2(fp.m) + "-" + pad2(fp.d);
            if (keyF < inicio || keyF > fin) return;
            var est = String(rowA[3 + gi * 3] || "").trim();
            if (est) asisEstado[f.email + "|" + keyF] = est;
          });
        });
      }
    } catch (e) { Logger.log("generarHojaGuardias/asistencia: " + e); }

    var oficiales = _oficialesPosibles(guardias, registros);
    var modelo = _modeloHojaGuardias(guardias, personas, asisEstado, oficiales);
    if (!modelo.ok) return { ok: false, error: modelo.error };

    var archivo = SpreadsheetApp.create(modelo.nombre);
    var sheet = archivo.getSheets()[0];
    sheet.setName(_HOJA_NOMBRE);
    _aplicarModelo(sheet, modelo);

    var ubicacion = "Raíz de Google Drive";
    try {
      _moverACarpetaCalendarios(archivo);
      ubicacion = "Carpeta Drive \"" + _CARPETA_CALENDARIOS + "\"";
    } catch (e2) {
      Logger.log("generarHojaGuardias/carpeta (best-effort): " + e2);
      ubicacion = "Raíz de Google Drive (carpeta \"" + _CARPETA_CALENDARIOS + "\" no disponible: " + e2 + ")";
    }

    return { ok: true, url: archivo.getUrl(), nombre: modelo.nombre, titulo: modelo.titulo, ubicacion: ubicacion, notaOficial: modelo.notaOficial };
  } catch (e) {
    Logger.log("generarHojaGuardias: " + e);
    return { ok: false, error: "No se pudo generar el calendario de guardias.", detalle: String(e) };
  }
}

function _aplicarModelo(sheet, m) {
  var nf = m.valores.length;
  if (nf && m.valores[0] && m.valores[0].length) {
    sheet.getRange(1, 1, nf, m.valores[0].length).setValues(m.valores);
  }
  m.merges.forEach(function(me) {
    try { sheet.getRange(me.r1, me.c1, me.r2 - me.r1 + 1, me.c2 - me.c1 + 1).merge(); } catch (e) { Logger.log("merge: " + e); }
  });
  try {
    sheet.getRange(m.areaBorde.r1, m.areaBorde.c1, m.areaBorde.r2 - m.areaBorde.r1 + 1, m.areaBorde.c2 - m.areaBorde.c1 + 1)
        .setBorder(true, true, true, true, false, false, _C_NEGRO, SpreadsheetApp.BorderStyle.SOLID);
  } catch (e) { Logger.log("bordes: " + e); }
  m.estilos.forEach(function(s) {
    try {
      var rng = sheet.getRange(s.r1, s.c1, s.r2 - s.r1 + 1, s.c2 - s.c1 + 1);
      if (s.bg) rng.setBackground(s.bg);
      var f = SpreadsheetApp.newTextStyle();
      if (s.bold) f.setBold(true);
      f.setFontFamily(_FONT);
      f.setFontSize(s.size || 8);
      if (s.color) f.setForegroundColor(s.color);
      rng.setTextStyle(f.build());
      rng.setVerticalAlignment(s.valign || "middle");
      rng.setHorizontalAlignment(s.align || "center");
      if (s.wrap) rng.setWrap(true);
      if (s.rotate) rng.setTextRotation(s.rotate);
    } catch (e) { Logger.log("estilo: " + e); }
  });
  Object.keys(m.anchoColumnas).forEach(function(c) { sheet.setColumnWidth(parseInt(c, 10), m.anchoColumnas[c]); });
  Object.keys(m.altoFilas).forEach(function(r) { sheet.setRowHeight(parseInt(r, 10), m.altoFilas[r]); });
  try { sheet.setFrozenRows(m.freezeRows); } catch (e) { Logger.log("freeze filas: " + e); }
  try { sheet.setFrozenColumns(m.freezeCols); } catch (e) { Logger.log("freeze columnas: " + e); }
  _configurarImpresion(sheet);
}

function _moverACarpetaCalendarios(archivo) {
  var carpeta = null;
  var it = DriveApp.getFoldersByName(_CARPETA_CALENDARIOS);
  if (it.hasNext()) carpeta = it.next();
  else carpeta = DriveApp.createFolder(_CARPETA_CALENDARIOS);
  var archivoDrive = DriveApp.getFileById(archivo.getId());
  archivoDrive.moveTo(carpeta);
}

function _configurarImpresion(sheet) {
  // Configuración razonable si luego se imprime la hoja (sin generar PDF).
  try {
    var ps = sheet.getPageSetup();
    try { ps.setOrientation(SpreadsheetApp.PageOrientation.LANDSCAPE); } catch (e2) {}
    try { ps.setFitToWidth(1); ps.setFitToHeight(0); } catch (e3) {}
    try { ps.setMarginTop(0.3); ps.setMarginBottom(0.3); ps.setMarginLeft(0.3); ps.setMarginRight(0.3); } catch (e4) {}
  } catch (e) { Logger.log("configurarImpresion: " + e); }
}