// Constantes SHEET_ID / SHEET_NAME y configuración central: ver Config.gs
// Reglas de negocio puras: ver Reglas.gs · Utilidades de datos: ver Db.gs

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Guardias CBC")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Menú de administración: ver Admin.gs (onOpen → menuAdministrativo)

//══════════════════════════════════════════
// REGISTRAR GUARDIA
//══════════════════════════════════════════

function registrarGuardia(datos) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, errores: ["El sistema está ocupado procesando otro registro. Espera unos segundos e inténtalo de nuevo."] };
  }
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { ok: false, errores: ["No se encontró la hoja de guardias."] };
    }

    var nombre = datos.nombre;
    var email = datos.email;
    var cargo = datos.cargo;
    var nivel = normalizarNivel(datos.condicion);
    if (nivel === null) {
      return { ok: false, errores: ["Condición inválida. Debe ser Inicial, Operativo o Profesional."] };
    }

    var fechasRaw = [datos.fecha1, datos.fecha2, datos.fecha3, datos.fecha4];
    var fechas = fechasRaw.filter(function(f) { return f && String(f).trim(); });
    var errores = [];

    // VALIDAR CARGO
    if (cargo !== "voluntario" && cargo !== "maquinista") {
      errores.push("Cargo inválido.");
    }

    // VALIDAR CANTIDADES Y REPETICIONES (regla central en Reglas.gs)
    var evalCantidad = evaluarCantidadFechas(fechas, [], obtenerConfigGeneral().cantidadGuardias);
    errores = errores.concat(evalCantidad.errores.filter(function(m) {
      return m.indexOf("Ya estás registrado") === -1; // ese chequeo aplica solo con histórico
    }));

    // VALIDAR MISMO MES
    if (fechas.length > 0 && !todasMismoMes(fechas)) {
      errores.push("Todas las fechas deben ser del mismo mes.");
    }

    var fechaRef = new Date(fechas[0] + "T12:00:00");
    var mes = fechaRef.getMonth();
    var año = fechaRef.getFullYear();

    // Leer datos una sola vez (optimización)
    var dataAll = sheet.getDataRange().getValues();

    // BUSCAR SI YA TIENE GUARDIAS EN ESTE MES
    var emailBuscado = String(email).trim().toLowerCase();
    var filaExistenteIdx = null;  // 0-based index en dataAll
    var fechasExistentes = [];

    for (var bi = 1; bi < dataAll.length; bi++) {
      if (!dataAll[bi][2]) continue;
      if (String(dataAll[bi][2]).trim().toLowerCase() === emailBuscado && dataAll[bi][4]) {
        var bfp = fechaPartesDe(dataAll[bi][4]);
        if (bfp && (bfp.m - 1) === mes && bfp.y === año) {
          filaExistenteIdx = bi;
          for (var ci = 4; ci <= 7; ci++) {
            if (!dataAll[bi][ci]) continue;
            var fe = dataAll[bi][ci] instanceof Date
              ? Utilities.formatDate(dataAll[bi][ci], Session.getScriptTimeZone(), "yyyy-MM-dd")
              : String(dataAll[bi][ci] || "").trim();
            if (fe) fechasExistentes.push(fe);
          }
          break;
        }
      }
    }

    // Fusionar fechas si ya existe registro (re-registro)
    if (filaExistenteIdx !== null) {
      var evalMerge = evaluarCantidadFechas(fechas, fechasExistentes, obtenerConfigGeneral().cantidadGuardias);
      // Al fusionar, la cantidad por inscripción ya no limita: importa el tope histórico (4)
      evalMerge.errores.forEach(function(m) {
        if (m.indexOf("por inscripción") === -1 && errores.indexOf(m) === -1) errores.push(m);
      });

      if (errores.length > 0) {
        return { ok: false, errores: errores };
      }

      fechas = evalMerge.fusion;
    } else {
      if (errores.length > 0) {
        return { ok: false, errores: errores };
      }
    }

    // VALIDAR FECHA LÍMITE DE INSCRIPCIÓN (una sola llamada a config)
    var configGral = obtenerConfigGeneral();
    if (configGral.fechaLimite) {
      var hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      var limite = new Date(configGral.fechaLimite);
      limite.setHours(0, 0, 0, 0);
      if (hoy > limite) {
        errores.push("El período de inscripción cerró el " +
          Utilities.formatDate(limite, Session.getScriptTimeZone(), "dd/MM/yyyy") + ".");
      }
    }

    // VALIDAR SEMANAS HABILITADAS
    for (var i = 0; i < fechas.length; i++) {
      if (!esSemanaHabilitada(fechas[i])) {
        errores.push("El día " + fechas[i] + " no corresponde a una semana de guardia.");
      }
    }

    // VALIDAR FECHAS NUEVAS (re-registro: solo las que no tenía antes)
    var fechasNuevas = fechas.slice();
    if (filaExistenteIdx !== null) {
      fechasNuevas = fechas.filter(function(f) { return fechasExistentes.indexOf(f) === -1; });
    }

    // VALIDAR CAPACIDAD POR DÍA según rol del usuario
    // Inicial → siempre puede registrarse
    // Maquinista → bloqueado si ya hay 1 maquinista
    // Operativo/Profesional → bloqueado si ya hay 2 operativos
    var soyMaq = cargo.indexOf("maquinista") !== -1;
    var soyVol = cargo.indexOf("voluntario") !== -1;
    var consumoCupoOp = consumeCupoOperativo(nivel);

    var todosLlenos = true;
    var diasMes = new Date(año, mes + 1, 0).getDate();
    for (var dd = 1; dd <= diasMes; dd++) {
      var fd = año + "-" + String(mes + 1).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
      if (!esSemanaHabilitada(fd)) continue;
      var cuentaDia = contarCupoDiaFilas(dataAll, fd);
      // Este día está disponible para este usuario?
      var disponible = false;
      if (!soyMaq && !consumoCupoOp) {
        disponible = true;  // inicial siempre puede
      } else {
        if (soyMaq && cuentaDia.maquinistas < REGLAS.cupoMaquinistaPorDia) disponible = true;
        if (consumoCupoOp && cuentaDia.operativos < REGLAS.cupoOperativoPorDia) disponible = true;
      }
      if (disponible) { todosLlenos = false; break; }
    }

    if (!todosLlenos) {
      for (var fi = 0; fi < fechasNuevas.length; fi++) {
        var f = fechasNuevas[fi];
        var cuentaF = contarCupoDiaFilas(dataAll, f);
        var bloqueado = diaBloqueadoPara(cuentaF, cargo, consumoCupoOp);
        if (bloqueado) {
          var motivo = [];
          if (soyMaq && cuentaF.maquinistas >= REGLAS.cupoMaquinistaPorDia) motivo.push("maquinista");
          if (consumoCupoOp && cuentaF.operativos >= REGLAS.cupoOperativoPorDia) motivo.push(REGLAS.cupoOperativoPorDia + " operativos");
          errores.push("El día " + f + " ya tiene " + motivo.join(" y ") + ".");
        }
      }
    }

    if (errores.length > 0) {
      return { ok: false, errores: errores };
    }

    // ESCRIBIR EN LA HOJA
    var f0 = fechas[0] || "", f1 = fechas[1] || "", f2 = fechas[2] || "", f3 = fechas[3] || "";
    if (filaExistenteIdx !== null) {
        // Actualizar fila existente (re-registro)
        var filaValores = [new Date(), nombre, email, cargo, f0, f1, f2, f3, nivel];
        sheet.getRange(filaExistenteIdx + 1, 1, 1, filaValores.length).setValues([filaValores]);
      } else {
        // Nueva fila
        var filaLibre = null;
        for (var bli = 1; bli < dataAll.length; bli++) {
          if (dataAll[bli].every(function(c) { return c === ""; })) {
            filaLibre = bli + 1;
            break;
          }
        }
        var nuevaFila = [new Date(), nombre, email, cargo, f0, f1, f2, f3, nivel];

      if (filaLibre) {
        sheet.getRange(filaLibre, 1, 1, nuevaFila.length).setValues([nuevaFila]);
      } else {
        sheet.appendRow(nuevaFila);
      }
    }

    // ENVIAR EMAIL (best-effort) — solo si es email real
    try {
      if (email.indexOf("@guardias.local") === -1) {
        enviarConfirmacion(nombre, email, cargo, fechas);
      }
    } catch (e) { Logger.log("Email confirmación: " + e); }

    generarEstadisticasBasicas();

    // Crear/actualizar fila en Asistencia
    try {
      var asisSh = inicializarHojaAsistencia();
      var asisData = asisSh.getDataRange().getValues();
      var encontrado = false;
      for (var ai = 1; ai < asisData.length; ai++) {
        if (String(asisData[ai][0] || "").trim().toLowerCase() === email.trim().toLowerCase()) {
          asisData[ai][1] = nombre;
          asisData[ai][2] = cargo;
          asisData[ai][15] = new Date();
          for (var col = 3; col <= 14; col++) asisData[ai][col] = "";
          asisSh.getRange(ai + 1, 1, 1, 16).setValues([asisData[ai]]);
          encontrado = true;
          break;
        }
      }
      if (!encontrado) {
        asisSh.appendRow([email, nombre, cargo, "", "", "", "", "", "", "", "", "", "", "", "", new Date()]);
      }
    } catch (e) { Logger.log("Actualización Asistencia tras registro: " + e); }

    _bumpCalVersion();
    return { ok: true };
  } catch (e) {
    Logger.log("registrarGuardia: " + e);
    return { ok: false, errores: ["Ocurrió un problema al guardar tu inscripción. Intenta nuevamente; si persiste, avisa al Ayudante."] };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

//══════════════════════════════════════════
// BUSCAR GUARDIAS POR EMAIL (solo mes activo)
//══════════════════════════════════════════

function buscarGuardiasPorEmail(email) {
  try {
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    var datos = sh.getDataRange().getValues();
    var guardias = [];
    var nombre = "";

    // Detectar mes más reciente (fecha máxima de toda la hoja, no la última fila)
    var mesActivo = null;
    var añoActivo = null;
    var fechaMax = null;

    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      for (var c = 4; c <= 7; c++) {
        if (fila[c]) {
          var fpb = fechaPartesDe(fila[c]);
          if (!fpb) continue;
          var claveNum = fpb.y * 10000 + fpb.m * 100 + fpb.d;
          if (!fechaMax || claveNum > fechaMax) {
            fechaMax = claveNum;
            mesActivo = fpb.m - 1;
            añoActivo = fpb.y;
          }
        }
      }
    }

    if (mesActivo === null) {
      return { ok: true, nombre: "", guardias: [], mesLabel: "", año: "" };
    }

    var emailBuscado = String(email || "").trim().toLowerCase();

    var fechasUsuario = [];

    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      if (!fila[2]) continue;
      if (String(fila[2] || "").trim().toLowerCase() !== emailBuscado) continue;

      nombre = fila[1];
      var cargo = fila[3];

      for (var c = 4; c <= 7; c++) {
        var fecha = fila[c];
        if (!fecha) continue;
        var f = new Date(fecha);
        if (f.getMonth() === mesActivo && f.getFullYear() === añoActivo) {
          guardias.push({
            fecha: Utilities.formatDate(f, Session.getScriptTimeZone(), "yyyy-MM-dd"),
            cargo: cargo
          });
          fechasUsuario.push(f);
        }
      }
    }

    var validacion = verificarFechaEliminacion(fechasUsuario);

    return {
      ok: true,
      nombre: nombre,
      guardias: guardias,
      puedeEliminar: validacion.permitido,
      mensajeEliminar: validacion.mensaje,
      mesLabel: ["enero","febrero","marzo","abril","mayo","junio",
                  "julio","agosto","septiembre","octubre","noviembre","diciembre"][mesActivo],
      año: añoActivo
    };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

//══════════════════════════════════════════
// ELIMINAR GUARDIAS POR EMAIL (mes activo)
//══════════════════════════════════════════

function eliminarGuardiasPorEmail(email, codigo) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: "El sistema está ocupado procesando otra operación. Espera unos segundos e inténtalo de nuevo." };
  }
  try {
    // Verificación de identidad: código enviado al correo del bombero
    // Evita que cualquier persona pueda dar de baja guardias ajenas con solo conocer el correo.
    var verif = verificarCodigoEliminacion_(email, codigo);
    if (!verif.ok) {
      return { ok: false, error: verif.error, necesitaCodigo: true };
    }

    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    var datos = sh.getDataRange().getValues();
    var emailBuscado = String(email || "").trim().toLowerCase();

    // Detectar mes activo (fecha máxima de toda la hoja)
    var mesActivo = null;
    var añoActivo = null;
    var fechaMaxDel = null;
    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      for (var c = 4; c <= 7; c++) {
        if (fila[c]) {
          var fpd = fechaPartesDe(fila[c]);
          if (!fpd) continue;
          var claveNumD = fpd.y * 10000 + fpd.m * 100 + fpd.d;
          if (!fechaMaxDel || claveNumD > fechaMaxDel) {
            fechaMaxDel = claveNumD;
            mesActivo = fpd.m - 1;
            añoActivo = fpd.y;
          }
        }
      }
    }

    if (mesActivo === null) {
      return { ok: false, error: "No existen guardias registradas." };
    }

    // Validar ventana de eliminación (3 días antes de la primera guardia del usuario)
    var fechasUsuario = [];
    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      if (!fila[2]) continue;
      if (String(fila[2]).trim().toLowerCase() !== emailBuscado) continue;
      for (var c = 4; c <= 7; c++) {
        if (!fila[c]) continue;
        var fpu = fechaPartesDe(fila[c]);
        if (fpu && (fpu.m - 1) === mesActivo && fpu.y === añoActivo) {
          fechasUsuario.push(new Date(fpu.y, fpu.m - 1, fpu.d, 12));
        }
      }
    }

    var validacion = verificarFechaEliminacion(fechasUsuario);
    if (!validacion.permitido) {
      return { ok: false, error: validacion.mensaje }
    }

    var eliminadas = 0;
    var filasEliminar = [];
    var cambios = [];
    var nombreUsuario = "";
    var fechasEliminadas = [];
    var cargoUsuario = "";

    for (var i = 1; i < datos.length; i++) {
      var fila = datos[i];
      if (String(fila[2] || "").trim().toLowerCase() !== emailBuscado) continue;

      if (!nombreUsuario) nombreUsuario = fila[1] || "";
      if (!cargoUsuario) cargoUsuario = fila[3] || "";

      var nuevaFila = [].concat(fila);
      var filaModificada = false;

      for (var c = 4; c <= 7; c++) {
        var fecha = fila[c];
        if (!fecha) continue;
        var f = new Date(fecha);
        if (f.getMonth() === mesActivo && f.getFullYear() === añoActivo) {
          nuevaFila[c] = "";
          eliminadas++;
          filaModificada = true;
          fechasEliminadas.push(Utilities.formatDate(f, Session.getScriptTimeZone(), "dd/MM"));
        }
      }

      if (filaModificada) {
        var tieneFechas = nuevaFila[4] || nuevaFila[5] || nuevaFila[6] || nuevaFila[7];
        if (tieneFechas) {
          cambios.push({ fila: i + 1, valores: nuevaFila });
        } else {
          filasEliminar.push(i + 1);
        }
      }
    }

    if (eliminadas === 0) {
      return { ok: false, error: "No se encontraron guardias del mes en curso para este correo." };
    }

    cambios.forEach(function(c) {
      sh.getRange(c.fila, 1, 1, c.valores.length).setValues([c.valores]);
    });

    filasEliminar.forEach(function(fila) {
      sh.getRange(fila, 1, 1, 8).clearContent();
    });

    SpreadsheetApp.flush();
    generarEstadisticasBasicas();
    try {
      enviarConfirmacionEliminacion(nombreUsuario, email, cargoUsuario, fechasEliminadas);
    } catch (e) { Logger.log("Email baja: " + e); }
    try {
      var logSs = SpreadsheetApp.openById(SHEET_ID);
      var logSh = logSs.getSheetByName("LogEliminaciones");
      if (!logSh) {
        logSh = logSs.insertSheet("LogEliminaciones");
        logSh.setHidden(true);
        logSh.getRange(1,1,1,5).setValues([["Fecha","Email","Nombre","Cargo","Fechas"]]);
      } else if (logSh.getLastRow() === 0) {
        logSh.getRange(1,1,1,5).setValues([["Fecha","Email","Nombre","Cargo","Fechas"]]);
      }
      logSh.appendRow([new Date(), email, nombreUsuario || "(sin nombre)", cargoUsuario || "", fechasEliminadas.join(", ") || "(sin datos)"]);
    } catch (e) { Logger.log("LogEliminaciones: " + e); }

    _bumpCalVersion();
    return { ok: true, eliminadas: eliminadas, filasEliminadas: filasEliminar.length };
  } catch (err) {
    Logger.log("eliminarGuardiasPorEmail: " + err);
    return { ok: false, error: "Ocurrió un problema al eliminar tus guardias. Intenta nuevamente; si persiste, avisa al Ayudante." };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

//══════════════════════════════════════════
// CONFIGURACIÓN → movida a Config.gs
// (obtenerInicioSemanaConfig, obtenerConfigGeneral,
//  esSemanaHabilitada, inicializarNotasConfig)
//══════════════════════════════════════════

function obtenerGuardiasDelDia(fechaStr) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    var resultado = [];

    for (var i = 1; i < data.length; i++) {
      if (!data[i][2]) continue;
      for (var c = 4; c <= 7; c++) {
        if (!data[i][c]) continue;
        var val = data[i][c];
        var f = val instanceof Date
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd")
          : String(val).trim();
        if (f === fechaStr) {
          var nivelDia = normalizarNivel(data[i][8]);
          resultado.push({
            nombre: data[i][1] || "",
            email: String(data[i][2] || "").trim().toLowerCase(),
            cargo: String(data[i][3] || "").trim().toLowerCase(),
            nivel: nivelDia,
            condicion: nivelLetra(nivelDia),
            operativo: consumeCupoOperativo(nivelDia)
          });
        }
      }
    }

    // Cargar asistencia para cada guardia
    try {
      var asisSh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Asistencia");
      if (asisSh) {
        var asisData = asisSh.getDataRange().getValues();
        for (var i = 0; i < resultado.length; i++) {
          var emailBuscado = resultado[i].email || "";
          if (!emailBuscado) continue;
          // Find this volunteer's Asistencia row
          for (var a = 1; a < asisData.length; a++) {
            if (String(asisData[a][0] || "").trim().toLowerCase() !== emailBuscado) continue;
            // Determine guardia index for this fecha
            for (var di = 1; di < data.length; di++) {
              if (String(data[di][2] || "").trim().toLowerCase() !== emailBuscado) continue;
              for (var c = 4; c <= 7; c++) {
                if (!data[di][c]) continue;
                var f = data[di][c] instanceof Date
                  ? Utilities.formatDate(data[di][c], Session.getScriptTimeZone(), "yyyy-MM-dd")
                  : String(data[di][c] || "").trim();
                if (f === fechaStr) {
                  var gi = c - 4;
                  resultado[i].estado = asisData[a][3 + gi * 3] || "";
                  resultado[i].reemplazoNombre = asisData[a][4 + gi * 3] || "";
                  break;
                }
              }
              break;
            }
            break;
          }
        }
      }
    } catch (e) { Logger.log("obtenerGuardiasDelDia/asistencia: " + e); }

    var total = resultado.length;
    var voluntarios = resultado.filter(function(r) { return r.cargo.indexOf("voluntario") !== -1; }).length;
    var maquinistas = resultado.filter(function(r) { return r.cargo.indexOf("maquinista") !== -1; }).length;

    return { ok: true, guardias: resultado, total: total, voluntarios: voluntarios, maquinistas: maquinistas };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

//══════════════════════════════════════════
// ASISTENCIA
//══════════════════════════════════════════

function inicializarHojaAsistencia() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName("Asistencia");
  if (!sh) {
    sh = ss.insertSheet("Asistencia");
  }
  var headers = ["Email","Nombre","Cargo",
    "G1_Estado","G1_ReempNombre","G1_ReempEmail",
    "G2_Estado","G2_ReempNombre","G2_ReempEmail",
    "G3_Estado","G3_ReempNombre","G3_ReempEmail",
    "G4_Estado","G4_ReempNombre","G4_ReempEmail",
    "UltimaActualizacion"];

  // Solo escribe encabezados si la hoja está vacía.
  // NUNCA borra datos: si el formato no coincide, se avisa y se requiere migración manual.
  var lastRow = sh.getLastRow();
  if (lastRow === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  var firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var formatoIncorrecto = (firstRow[0] !== "Email" || firstRow[3] !== "G1_Estado");
  if (formatoIncorrecto && lastRow > 1) {
    throw new Error("La hoja Asistencia tiene un formato antiguo con datos. No se modificará automáticamente; requiere migración manual.");
  }
  return sh;
}

function guardarAsistencias(email, registros) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: "El sistema está ocupado. Espera unos segundos e inténtalo de nuevo." };
  }
  try {
    email = String(email || "").trim().toLowerCase();
    if (!email) return { ok: false, error: "Email requerido." };
    if (!registros || !registros.length) return { ok: false, error: "Sin cambios." };

    var sh = inicializarHojaAsistencia();
    var datos = sh.getDataRange().getValues();

    // Find existing Asistencia row for this email
    var filaIdx = -1;
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0] || "").trim().toLowerCase() === email) {
        filaIdx = i;
        break;
      }
    }

    // If no row exists, create one
    if (filaIdx < 0) {
      var guardiasData = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME).getDataRange().getValues();
      var nombre = "", cargo = "";
      for (var i = 1; i < guardiasData.length; i++) {
        if (String(guardiasData[i][2] || "").trim().toLowerCase() === email) {
          nombre = guardiasData[i][1] || "";
          cargo = String(guardiasData[i][3] || "").trim();
          break;
        }
      }
      sh.appendRow([email, nombre, cargo, "", "", "", "", "", "", "", "", "", "", "", "", new Date()]);
      datos = sh.getDataRange().getValues();
      filaIdx = datos.length - 1;
    }

    var resultados = [];
    var huboError = false;

    for (var r = 0; r < registros.length; r++) {
      var reg = registros[r];
      var fecha = _fechaCelda(String(reg.fecha || "").trim());
      var estado = String(reg.estado || "").trim();
      var reempNombre = String(reg.reemplazoNombre || "").trim();
      var reempEmail = String(reg.reemplazoEmail || "").trim();

      if (!fecha || !estado) continue;
      if (estado === "NC") {
        resultados.push({ fecha: fecha, ok: false, error: "NC solo lo marca el oficial." });
        huboError = true;
        continue;
      }

      // Resolve guardia index (0-3) from the fecha
      var gi = _obtenerGuardiaIndex(email, fecha);
      if (gi < 0 || gi > 3) {
        resultados.push({ fecha: fecha, ok: false, error: "La fecha no corresponde a ninguna guardia." });
        huboError = true;
        continue;
      }

      if (estado === "C") {
        var hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        var partes = fecha.split("-");
        var fg = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
        if (fg > hoy) {
          resultados.push({ fecha: fecha, ok: false, error: "No puedes marcar Cumple antes del día." });
          huboError = true;
          continue;
        }
      }

      // Update the row's columns for this guardia index
      var estadoCol = 3 + gi * 3;
      var reempNombreCol = 4 + gi * 3;
      var reempEmailCol = 5 + gi * 3;
      datos[filaIdx][estadoCol] = estado;
      datos[filaIdx][reempNombreCol] = reempNombre;
      datos[filaIdx][reempEmailCol] = reempEmail;
      datos[filaIdx][15] = new Date();

      resultados.push({ fecha: fecha, ok: true });
    }

    // Write updated row once
    sh.getRange(filaIdx + 1, 1, 1, 16).setValues([datos[filaIdx]]);

    _bumpCalVersion();
    return { ok: !huboError, resultados: resultados };
  } catch (e) {
    Logger.log("guardarAsistencias: " + e);
    return { ok: false, error: "No se pudieron guardar los cambios de asistencia. Intenta nuevamente." };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function obtenerGuardiasConAsistencia(email) {
  try {
    var config = obtenerConfigGeneral();
    var mes = config.mes;
    var año = config.año;

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);
    var datos = sh.getDataRange().getValues();
    var fechas = [];
    var nombre = "";
    var cargo = "";

    var emailBuscado = String(email || "").trim().toLowerCase();

    for (var i = 1; i < datos.length; i++) {
      if (!datos[i][2]) continue;
      if (String(datos[i][2]).trim().toLowerCase() !== emailBuscado) continue;

      nombre = datos[i][1] || "";
      cargo = String(datos[i][3] || "").trim();

      for (var c = 4; c <= 7; c++) {
        if (!datos[i][c]) continue;
        var fpc = fechaPartesDe(datos[i][c]);
        if (fpc && (fpc.m - 1) === mes && fpc.y === año) {
          fechas.push({
            fecha: fpc.y + "-" + pad2(fpc.m) + "-" + pad2(fpc.d),
            indice: c - 4
          });
        }
      }
    }

    // Read Asistencia row (per-volunteer format)
    var asistencia = {};
    try {
      var asisSh = ss.getSheetByName("Asistencia");
      if (asisSh) {
        var asisData = asisSh.getDataRange().getValues();
        for (var i = 1; i < asisData.length; i++) {
          if (String(asisData[i][0] || "").trim().toLowerCase() !== emailBuscado) continue;
          for (var fi = 0; fi < fechas.length; fi++) {
            var gi = fechas[fi].indice;
            var estado = asisData[i][3 + gi * 3] || "";
            var reempNombre = asisData[i][4 + gi * 3] || "";
            asistencia[fechas[fi].fecha] = {
              estado: estado,
              reemplazoNombre: reempNombre
            };
          }
          break;
        }
      }
    } catch (e) { Logger.log("obtenerGuardiasConAsistencia: " + e); }

    var meses = ["enero","febrero","marzo","abril","mayo","junio",
                 "julio","agosto","septiembre","octubre","noviembre","diciembre"];

    var fechasSolo = fechas.map(function(f) { return f.fecha; });

    return {
      ok: true,
      nombre: nombre,
      cargo: cargo,
      fechas: fechasSolo,
      asistencia: asistencia,
      mesLabel: meses[mes],
      año: año
    };
  } catch (e) {
    return { ok: false, error: e.toString() };
  }
}

//══════════════════════════════════════════
// CALENDARIO — CONTRATO ÚNICO "cal-1"
// Una llamada → configuración + disponibilidad + requisitos + métricas.
// Siempre devuelve objeto serializable: NUNCA null/undefined/ambiguo.
//   ok=true  → {ok,version,generadoEn,mes,año,ocupacion,configuracion,diagnostico}
//   ok=false → {ok:false,errorCode,message,diagnostico}
//══════════════════════════════════════════

var VERSION_CONTRATO_CALENDARIO = "cal-1";
var BUILD_SERVICIO = "v1.0.0";

// Log estructurado de servicio. SIN datos sensibles (nunca nombres/emails/correo cuerpo).
function _logServicio(funcion, requestId, duracionMs, nivel, detalle) {
  try {
    var usuario = "";
    try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}
    Logger.log(JSON.stringify({
      svc: "guardias", fn: funcion, req: requestId || "", ms: duracionMs || 0,
      nivel: nivel || "info", usuario: usuario,
      ts: new Date().toISOString(), detalle: detalle || ""
    }));
  } catch (e) {}
}

function _calVersionActual() {
  try { return Number(PropertiesService.getScriptProperties().getProperty("CAL_VER") || 1); }
  catch (e) { return 0; }
}

function _bumpCalVersion() {
  try {
    PropertiesService.getScriptProperties().setProperty("CAL_VER", String(_calVersionActual() + 1));
    try { CacheService.getScriptCache().remove("CAL_ULTIMA"); } catch (e2) {}
  } catch (e) { Logger.log("bumpCalVersion: " + e); }
}

function invalidarCacheCalendario() { _bumpCalVersion(); }

// Endpoint canónico para el frontend
function obtenerCalendario(mes, año) {
  var t0 = Date.now();
  var diag = { build: VERSION_CONTRATO_CALENDARIO, cache: "MISS" };

  // ── Caché corta (120 s), solo respuestas ok; se invalida por versión ──
  try {
    var cruda = CacheService.getScriptCache().get("CAL_" + _calVersionActual());
    if (cruda) {
      var hit = JSON.parse(cruda);
      if (hit && hit.ok === true && hit.ocupacion &&
          (mes == null || Number(hit.mes) === Number(mes))) {
        diag.cache = "HIT";
        diag.totalMs = Date.now() - t0;
        hit.diagnostico = diag;
        return hit;
      }
    }
  } catch (e) { Logger.log("[CAL] caché lectura: " + e); }

  try {
    // ── Configuración: tolerante a valores vacíos/incompletos ──
    var tConfig = Date.now();
    var config = obtenerConfigGeneral();
    var avisos = [];
    var hoy = new Date();
    var configIncompleta = false;

    if (!config || isNaN(new Date(config.inicio).getTime())) {
      configIncompleta = true;
      // Fallback: mes actual y semana 0 desde el día 1; el calendario se ve,
      // con los días deshabilitados y un aviso visible para el administrador.
      avisos.push("Config incompleta: falta la fecha de inicio (Config C3). Los días aparecen deshabilitados.");
      config = config || {};
      config.inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12);
      config.mes = hoy.getMonth();
      config.año = hoy.getFullYear();
      if (!Array.isArray(config.semanas) || !config.semanas.length) config.semanas = [0];
    }
    if (mes == null) mes = config.mes;
    if (año == null) año = config.año;
    diag.configMs = Date.now() - tConfig;
    diag.avisos = avisos;

    // ── Lectura (una sola vez por petición) ──
    var tLect = Date.now();
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw { errorCode: "HOJA_FALTANTE", message: "No existe la hoja Guardias." };
    var dataAll;
    try {
      dataAll = sheet.getDataRange().getValues();
    } catch (errLect1) {
      // Error temporal de Sheets: un único reintento tras una pausa corta
      Utilities.sleep(400);
      dataAll = sheet.getDataRange().getValues();
    }
    var asisSh = ss.getSheetByName("Asistencia");
    var asisData = asisSh ? asisSh.getDataRange().getValues() : [];
    diag.lecturaMs = Date.now() - tLect;
    diag.filasLeidas = Math.max(dataAll.length - 1, 0);

    // ── Procesamiento en memoria (índice por fecha, una pasada) ──
    var tProc = Date.now();
    var snap = _construirSnapshotCalendario(dataAll, asisData, config, mes, año);
    diag.procesamientoMs = Date.now() - tProc;

    var payload = {
      ok: true,
      version: VERSION_CONTRATO_CALENDARIO,
      generadoEn: new Date().toISOString(),
      mes: snap.mes,
      año: snap.año,
      ocupacion: snap.ocupacion,
      configuracion: {
        cantidadGuardias: config.cantidadGuardias,
        mostrarAsistencia: !!config.mostrarAsistencia,
        semanas: config.semanas,
        diasEliminacion: config.diasEliminacion,
        fechaLimite: config.fechaLimite
          ? Utilities.formatDate(new Date(config.fechaLimite), Session.getScriptTimeZone(), "yyyy-MM-dd")
          : "",
        requisitosDespacho: { maquinistas: REGLAS.cupoMaquinistaPorDia, operativos: REGLAS.cupoOperativoPorDia }
      },
      diagnostico: diag
    };
    if (avisos.length) {
      payload.avisos = avisos;
      payload.configuracion.configIncompleta = true;
    }
    var tSer = Date.now();
    var json = JSON.stringify(payload);
    diag.serializacionMs = Date.now() - tSer;
    diag.totalMs = Date.now() - t0;
    diag.requestId = "req-" + t0 + "-" + Math.floor(Math.random() * 1000);
    payload.diagnostico = diag;

    try { CacheService.getScriptCache().put("CAL_" + _calVersionActual(), json, 120); } catch (e) {}

    _logServicio("obtenerCalendario", diag.requestId, diag.totalMs, "info",
      "cache=" + diag.cache + " filas=" + diag.filasLeidas + (avisos.length ? " avisos=" + avisos.length : ""));
    return payload;

  } catch (err) {
    var esObj = err && typeof err === "object";
    var codigoErr = esObj ? (err.errorCode || "INTERNO") : "INTERNO";
    var mensajeErr = esObj ? (err.message || "Error desconocido") : String(err);
    _logServicio("obtenerCalendario", "req-" + t0, Date.now() - t0, "error", codigoErr + ": " + mensajeErr);
    return {
      ok: false,
      errorCode: codigoErr,
      message: mensajeErr,
      diagnostico: { build: BUILD_SERVICIO, totalMs: Date.now() - t0 }
    };
  }
}

// Semana habilitada pura (usa config explícita, no el caché global)
function _semanaHabilitadaDe(fechaKey, config) {
  var fp = fechaPartesDe(fechaKey);
  if (!fp) return false;
  if ((fp.m - 1) !== config.mes || fp.y !== config.año) return false;
  var iniRaw = config.inicio instanceof Date ? config.inicio : new Date(String(config.inicio).trim() + "T12:00:00");
  var inicio = new Date(iniRaw.getFullYear(), iniRaw.getMonth(), iniRaw.getDate(), 12);
  var f = new Date(fp.y, fp.m - 1, fp.d, 12);
  var diff = Math.floor((f - inicio) / 86400000);
  if (diff < 0) return false;
  return config.semanas.indexOf(Math.floor(diff / 7)) !== -1;
}

// Índice por fecha construido EN UNA PASADA sobre Guardias,
// luego un solo pase de Asistencia cruzando por índice email→guardia.
function _construirSnapshotCalendario(dataAll, asisData, config, mes, año) {
  var ocupacion = {};
  var totalDias = new Date(año, mes + 1, 0).getDate();
  for (var d = 1; d <= totalDias; d++) {
    var fk = año + "-" + pad2(mes + 1) + "-" + pad2(d);
    ocupacion[fk] = {
      voluntarios: 0, maquinistas: 0, operativos: 0, iniciales: 0,
      habilitado: false, cumplido: false, guardias: []
    };
  }

  var indiceFechas = {}; // email -> [fechaStr ×4]

  for (var i = 1; i < dataAll.length; i++) {
    var fila = dataAll[i];
    if (!fila[2]) continue;
    var email = String(fila[2]).trim().toLowerCase();
    var cargo = String(fila[3] || "").trim().toLowerCase();
    var nivel = normalizarNivel(fila[8]); // ÚNICA vía de clasificación
    var esMaq = cargo.indexOf("maquinista") !== -1;
    var esVol = cargo.indexOf("voluntario") !== -1;
    var consumeOp = consumeCupoOperativo(nivel);

    if (!indiceFechas[email]) indiceFechas[email] = ["", "", "", ""];

    for (var cIdx = 0; cIdx < 4; cIdx++) {
      var raw = fila[4 + cIdx];
      if (!raw) continue;
      var fp = fechaPartesDe(raw);
      if (!fp) continue;
      var key = fp.y + "-" + pad2(fp.m) + "-" + pad2(fp.d);
      indiceFechas[email][cIdx] = key;

      var dia = ocupacion[key];
      if (!dia) continue; // registro de otro mes: queda indexado para asistencia

      dia.guardias.push({
        nombre: String(fila[1] || ""),
        email: email,
        cargo: cargo,
        nivel: nivel,
        condicion: nivelLetra(nivel),
        operativo: consumeOp,
        estado: "",
        reemplazoNombre: ""
      });
      if (esMaq) dia.maquinistas++;
      if (esVol) dia.voluntarios++;
      if (consumeOp) dia.operativos++;
      if (nivel === "INICIAL") dia.iniciales++;
    }
  }

  Object.keys(ocupacion).forEach(function(k) {
    var dia = ocupacion[k];
    dia.habilitado = _semanaHabilitadaDe(k, config);
    dia.cumplido = dia.maquinistas >= REGLAS.cupoMaquinistaPorDia &&
                   dia.operativos >= REGLAS.cupoOperativoPorDia;
  });

  // Asistencia: un pase plano, cruce O(1) por índice
  for (var ai = 1; ai < (asisData || []).length; ai++) {
    var aEmail = String(asisData[ai][0] || "").trim().toLowerCase();
    if (!aEmail || !indiceFechas[aEmail]) continue;
    var fechasEmail = indiceFechas[aEmail];
    for (var gi = 0; gi < 4; gi++) {
      var estado = String(asisData[ai][3 + gi * 3] || "").trim();
      var reemp = String(asisData[ai][4 + gi * 3] || "").trim();
      if (!estado && !reemp) continue;
      var k2 = fechasEmail[gi];
      if (!k2 || !ocupacion[k2]) continue;
      var lista = ocupacion[k2].guardias;
      for (var gE = 0; gE < lista.length; gE++) {
        if (lista[gE].email === aEmail) {
          lista[gE].estado = estado;
          lista[gE].reemplazoNombre = reemp;
        }
      }
    }
  }

  return { ocupacion: ocupacion, mes: mes, año: año };
}

// Compatibilidad: los campos históricos siguen presentes dentro del contrato.
function obtenerOcupacion(mes, año) {
  return obtenerCalendario(mes, año);
}

// Heartbeat mínimo: NUNCA usar obtenerOcupacion como ping.
function healthCheck() {
  var r;
  try {
    r = { ok: true, version: VERSION_CONTRATO_CALENDARIO, build: BUILD_SERVICIO,
          timestamp: new Date().toISOString() };
  } catch (e) {
    r = { ok: false, error: String(e) };
  }
  return r;
}

//══════════════════════════════════════════
// CORREO DE CONFIRMACIÓN
//══════════════════════════════════════════

var LOGO_URL = "https://drive.google.com/thumbnail?id=1KGkEIbJWCCy8qYYWf-bjmTE7PC5UznAI&sz=w200";

function formatearCargo(cargo){
  var roles = [];
  if (cargo.indexOf("voluntario") !== -1) roles.push("Voluntario");
  if (cargo.indexOf("maquinista") !== -1) roles.push("Maquinista");
  return roles.join(" + ");
}

function enviarConfirmacion(nombre, email, cargo, fechas) {
  var labelCargo = formatearCargo(cargo);
  var esMaq = cargo.indexOf("maquinista") !== -1;
  var accentColor = esMaq ? "#1a3a9b" : "#9b1a1a";
  var bgColor = esMaq ? "#e8edf5" : "#f5e8e8";

  var fechasHtml = fechas.map(function(f, i) {
    var fecha = new Date(f + "T12:00:00");
    var fechaFormateada = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "EEEE d 'de' MMMM 'de' yyyy");
    fechaFormateada = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);
    return '<tr>' +
      '<td style="padding:12px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:13px;color:#6b6b6b;letter-spacing:0.5px;">GUARDIA ' + String(i + 1).padStart(2, "0") + '</td>' +
      '<td style="padding:12px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:14px;color:#0e0e0e;text-align:right;font-weight:bold;">' + fechaFormateada + '</td>' +
    '</tr>';
  }).join("");

  var htmlBody =
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f7f5f2;font-family:Georgia,\'Times New Roman\',serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:40px 16px;">' +
    '<tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">' +

    // ═══ HEADER CON LOGO ═══
    '<tr><td style="background:#0e0e0e;padding:0;border-radius:8px 8px 0 0;">' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr>' +
          '<td style="padding:24px 28px;width:56px;vertical-align:middle;">' +
            '<img src="' + LOGO_URL + '" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;border:2px solid ' + accentColor + ';object-fit:cover;">' +
          '</td>' +
          '<td style="padding:24px 0 24px 4px;vertical-align:middle;">' +
            '<p style="margin:0 0 2px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:' + accentColor + ';">1ra Compañía CBC</p>' +
            '<p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;letter-spacing:-0.3px;">Registro de Guardias</p>' +
          '</td>' +
          '<td style="padding:24px 28px;text-align:right;vertical-align:middle;">' +
            '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:1px;line-height:1.8;">CONFIRMACIÓN<br>DE INSCRIPCIÓN</p>' +
          '</td>' +
        '</tr>' +
        '<tr><td colspan="3" style="height:3px;background:' + accentColor + ';"></td></tr>' +
      '</table>' +
    '</td></tr>' +

    // ═══ CUERPO ═══
    '<tr><td style="background:#ffffff;border:1px solid #dedad4;border-top:none;border-radius:0 0 8px 8px;">' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +

        // SALUDO
        '<tr><td style="padding:32px 32px 0;">' +
          '<p style="margin:0 0 8px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;">Para</p>' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#0e0e0e;font-weight:bold;">' + nombre + '</p>' +
        '</td></tr>' +

        // MENSAJE
        '<tr><td style="padding:18px 32px 0;">' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#6b6b6b;line-height:1.7;">Tus guardias del mes fueron registradas correctamente en el sistema de la <strong>1ra Compañía de Bomberos del CBC</strong>.</p>' +
        '</td></tr>' +

        // CARGO
        '<tr><td style="padding:26px 32px 0;">' +
          '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
            '<td style="font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;padding-right:14px;white-space:nowrap;">Cargo</td>' +
            '<td style="border-top:1px solid #eeebe6;"></td>' +
          '</tr></table>' +
        '</td></tr>' +
        '<tr><td style="padding:14px 32px 0;">' +
          '<span style="display:inline-block;font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' + accentColor + ';background:' + bgColor + ';padding:7px 16px;border-left:3px solid ' + accentColor + ';border-radius:3px;">' + labelCargo.toUpperCase() + '</span>' +
        '</td></tr>' +

        // FECHAS
        '<tr><td style="padding:26px 32px 0;">' +
          '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
            '<td style="font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;padding-right:14px;white-space:nowrap;">Fechas asignadas</td>' +
            '<td style="border-top:1px solid #eeebe6;"></td>' +
          '</tr></table>' +
        '</td></tr>' +
        '<tr><td style="padding:6px 32px 0;">' +
          '<table width="100%" cellpadding="0" cellspacing="0">' + fechasHtml + '</table>' +
        '</td></tr>' +

        // FOOTER DEL MENSAJE
        '<tr><td style="padding:28px 32px 32px;">' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#b0b0b0;line-height:1.7;border-top:1px solid #eeebe6;padding-top:20px;">Si detectás algún error en los datos, comunicate con el Ayudante u Oficial a Cargo. Este mensaje es generado automáticamente, por favor no respondas a este correo.</p>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    // ═══ PIE ═══
    '<tr><td style="padding:24px 0 0;text-align:center;">' +
      '<p style="margin:0 0 6px;font-family:\'Courier New\',monospace;font-size:9px;color:#b0b0b0;letter-spacing:2px;text-transform:uppercase;">Sistema de Guardias &mdash; 1ra Compañía de Bomberos del CBC</p>' +
      '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:9px;color:#ccc;letter-spacing:1px;"><a href="mailto:ayudantec1@bomberosdecoquimbo.cl" style="color:#9b1a1a;text-decoration:none;">ayudantec1@bomberosdecoquimbo.cl</a></p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  var textBody =
    "1RA COMPANIA CBC — CONFIRMACION DE GUARDIAS\n" +
    "============================================\n\n" +
    "Para: " + nombre + "\n" +
    "Cargo: " + labelCargo + "\n\n" +
    "FECHAS ASIGNADAS\n" +
    "----------------\n" +
    fechas.map(function(f, i) { return "Guardia " + String(i + 1).padStart(2, "0") + ": " + f; }).join("\n") + "\n\n" +
    "Si detectas algun error, comunicate con el Ayudante u Oficial a Cargo.\n\n" +
    "Sistema de Guardias — 1ra Compania de Bomberos del CBC\n" +
    "ayudantec1@bomberosdecoquimbo.cl";

  MailApp.sendEmail({
    to: email,
    subject: "Guardias registradas — 1ra Compañía CBC",
    name: "1ra Compañía CBC — Sistema de Guardias",
    body: textBody,
    htmlBody: htmlBody
  });
}

//══════════════════════════════════════════
// CONFIRMACIÓN DE ELIMINACIÓN
//══════════════════════════════════════════

function enviarConfirmacionEliminacion(nombre, email, cargo, fechasEliminadas) {
  var labelCargo = formatearCargo(cargo);

  var fechasHtml = fechasEliminadas.map(function(f, i) {
    return '<tr>' +
      '<td style="padding:10px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:13px;color:#6b6b6b;letter-spacing:0.5px;">GUARDIA ' + String(i + 1).padStart(2, "0") + '</td>' +
      '<td style="padding:10px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:14px;color:#9b5a1a;text-align:right;font-weight:bold;">' + f + '</td>' +
    '</tr>';
  }).join("");

  var htmlBody =
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f7f5f2;font-family:Georgia,\'Times New Roman\',serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:40px 16px;">' +
    '<tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">' +

    // HEADER
    '<tr><td style="background:#0e0e0e;padding:0;border-radius:8px 8px 0 0;">' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr>' +
          '<td style="padding:24px 28px;width:56px;vertical-align:middle;">' +
            '<img src="' + LOGO_URL + '" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;border:2px solid #9b5a1a;object-fit:cover;">' +
          '</td>' +
          '<td style="padding:24px 0 24px 4px;vertical-align:middle;">' +
            '<p style="margin:0 0 2px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#9b5a1a;">1ra Compañía CBC</p>' +
            '<p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;letter-spacing:-0.3px;">Baja de Guardias</p>' +
          '</td>' +
          '<td style="padding:24px 28px;text-align:right;vertical-align:middle;">' +
            '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:1px;line-height:1.8;">GUARDIAS<br>ELIMINADAS</p>' +
          '</td>' +
        '</tr>' +
        '<tr><td colspan="3" style="height:3px;background:#9b5a1a;"></td></tr>' +
      '</table>' +
    '</td></tr>' +

    // CUERPO
    '<tr><td style="background:#ffffff;border:1px solid #dedad4;border-top:none;border-radius:0 0 8px 8px;">' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr><td style="padding:32px 32px 0;">' +
          '<p style="margin:0 0 8px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;">Para</p>' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#0e0e0e;font-weight:bold;">' + nombre + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:18px 32px 0;">' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#6b6b6b;line-height:1.7;">Tus guardias del mes fueron <strong style="color:#9b5a1a;">eliminadas</strong> del sistema. Los cupos quedaron disponibles para otros bomberos.</p>' +
        '</td></tr>' +
        '<tr><td style="padding:14px 32px 0;">' +
          '<span style="display:inline-block;font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9b5a1a;background:#f5ede8;padding:7px 16px;border-left:3px solid #9b5a1a;border-radius:3px;">' + labelCargo.toUpperCase() + '</span>' +
        '</td></tr>' +
        '<tr><td style="padding:26px 32px 0;">' +
          '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
            '<td style="font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;padding-right:14px;white-space:nowrap;">Guardias eliminadas</td>' +
            '<td style="border-top:1px solid #eeebe6;"></td>' +
          '</tr></table>' +
        '</td></tr>' +
        '<tr><td style="padding:6px 32px 0;">' +
          '<table width="100%" cellpadding="0" cellspacing="0">' + fechasHtml + '</table>' +
        '</td></tr>' +
        '<tr><td style="padding:28px 32px 32px;">' +
          '<p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#b0b0b0;line-height:1.7;border-top:1px solid #eeebe6;padding-top:20px;">Si no realizaste esta operación, comunicate con el Ayudante u Oficial a Cargo. Para volver a inscribirte ingresa nuevamente al sistema.</p>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td style="padding:24px 0 0;text-align:center;">' +
      '<p style="margin:0 0 6px;font-family:\'Courier New\',monospace;font-size:9px;color:#b0b0b0;letter-spacing:2px;text-transform:uppercase;">Sistema de Guardias &mdash; 1ra Compañía de Bomberos del CBC</p>' +
      '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:9px;color:#ccc;letter-spacing:1px;"><a href="mailto:ayudantec1@bomberosdecoquimbo.cl" style="color:#9b1a1a;text-decoration:none;">ayudantec1@bomberosdecoquimbo.cl</a></p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  var textBody =
    "1RA COMPANIA CBC — BAJA DE GUARDIAS\n" +
    "====================================\n\n" +
    "Para: " + nombre + "\n" +
    "Cargo: " + labelCargo + "\n\n" +
    "GUARDIAS ELIMINADAS\n" +
    "-------------------\n" +
    fechasEliminadas.map(function(f, i) { return "Guardia " + String(i + 1).padStart(2, "0") + ": " + f; }).join("\n") + "\n\n" +
    "Si no realizaste esta operacion, comunicate con el Ayudante u Oficial a Cargo.\n\n" +
    "Sistema de Guardias — 1ra Compania de Bomberos del CBC\n" +
    "ayudantec1@bomberosdecoquimbo.cl";

  MailApp.sendEmail({
    to: email,
    subject: "Guardias eliminadas — 1ra Compañía CBC",
    name: "1ra Compañía CBC — Sistema de Guardias",
    body: textBody,
    htmlBody: htmlBody
  });
}

//══════════════════════════════════════════
// RECORDATORIO AUTOMÁTICO (ejecutar con trigger diario)
//══════════════════════════════════════════

function enviarRecordatorios() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  var datos = sh.getDataRange().getValues();

  var manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(0, 0, 0, 0);

  var agrupados = {};

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    if (!fila[2]) continue;

    var nombre = fila[1];
    var email = String(fila[2]).trim().toLowerCase();
    var cargo = String(fila[3] || "").trim().toLowerCase();
    if (cargo !== "voluntario" && cargo !== "maquinista") continue;

    for (var c = 4; c <= 7; c++) {
      if (!fila[c]) continue;
      var fpr = fechaPartesDe(fila[c]);
      if (!fpr) continue;
      var f = new Date(fpr.y, fpr.m - 1, fpr.d);
      f.setHours(0, 0, 0, 0);

      if (f.getTime() === manana.getTime()) {
        if (!agrupados[email]) {
          agrupados[email] = { nombre: nombre, email: email, cargo: cargo, fechas: [] };
        }
        agrupados[email].fechas.push(f);
      }
    }
  }

  for (var emailKey in agrupados) {
    (function(persona) {
      try {
        var labelCargo = persona.cargo.indexOf("maquinista") !== -1
          ? (persona.cargo.indexOf("voluntario") !== -1 ? "Voluntario+Maquinista" : "Maquinista")
          : "Voluntario";
        var esMaq = persona.cargo.indexOf("maquinista") !== -1;
        var accentColor = esMaq ? "#1a3a9b" : "#9b1a1a";
        var bgColor = esMaq ? "#e8edf5" : "#f5e8e8";

        var fechasHtml = persona.fechas.map(function(f, i) {
          var fd = Utilities.formatDate(f, Session.getScriptTimeZone(), "EEEE d 'de' MMMM");
          fd = fd.charAt(0).toUpperCase() + fd.slice(1);
          return '<tr>' +
            '<td style="padding:10px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:13px;color:#6b6b6b;letter-spacing:0.5px;">MAÑANA</td>' +
            '<td style="padding:10px 0;border-bottom:1px solid #eeebe6;font-family:Georgia,serif;font-size:14px;color:#0e0e0e;text-align:right;font-weight:bold;">' + fd + '</td>' +
          '</tr>';
        }).join("");

        var htmlBody =
          '<!DOCTYPE html>' +
          '<html lang="es"><head><meta charset="UTF-8"></head>' +
          '<body style="margin:0;padding:0;background:#f7f5f2;font-family:Georgia,\'Times New Roman\',serif;">' +
          '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:40px 16px;">' +
          '<tr><td align="center">' +
          '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">' +

          '<tr><td style="background:#0e0e0e;padding:0;border-radius:8px 8px 0 0;">' +
            '<table width="100%" cellpadding="0" cellspacing="0">' +
              '<tr>' +
                '<td style="padding:24px 28px;width:56px;vertical-align:middle;">' +
                  '<img src="' + LOGO_URL + '" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;border:2px solid ' + accentColor + ';object-fit:cover;">' +
                '</td>' +
                '<td style="padding:24px 0 24px 4px;vertical-align:middle;">' +
                  '<p style="margin:0 0 2px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:' + accentColor + ';">1ra Compañía CBC</p>' +
                  '<p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;letter-spacing:-0.3px;">Recordatorio de Guardia</p>' +
                '</td>' +
                '<td style="padding:24px 28px;text-align:right;vertical-align:middle;">' +
                  '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:1px;line-height:1.8;">RECORDATORIO<br>MAÑANA</p>' +
                '</td>' +
              '</tr>' +
              '<tr><td colspan="3" style="height:3px;background:' + accentColor + ';"></td></tr>' +
            '</table>' +
          '</td></tr>' +

          '<tr><td style="background:#ffffff;border:1px solid #dedad4;border-top:none;border-radius:0 0 8px 8px;">' +
            '<table width="100%" cellpadding="0" cellspacing="0">' +
              '<tr><td style="padding:32px 32px 0;">' +
                '<p style="margin:0 0 6px;font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;">Recordatorio</p>' +
                '<p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#0e0e0e;font-weight:bold;">' + persona.nombre + '</p>' +
              '</td></tr>' +
              '<tr><td style="padding:18px 32px 0;">' +
                '<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#6b6b6b;line-height:1.7;">Este mensaje es para recordarte que tienes guardia <strong>mañana</strong> como:</p>' +
              '</td></tr>' +
              '<tr><td style="padding:14px 32px 0;">' +
                '<span style="display:inline-block;font-family:\'Courier New\',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' + accentColor + ';background:' + bgColor + ';padding:7px 16px;border-left:3px solid ' + accentColor + ';border-radius:3px;">' + labelCargo.toUpperCase() + '</span>' +
              '</td></tr>' +
              '<tr><td style="padding:26px 32px 0;">' +
                '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
                  '<td style="font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#b0b0b0;padding-right:14px;white-space:nowrap;">Fecha</td>' +
                  '<td style="border-top:1px solid #eeebe6;"></td>' +
                '</tr></table>' +
              '</td></tr>' +
              '<tr><td style="padding:6px 32px 0;">' +
                '<table width="100%" cellpadding="0" cellspacing="0">' + fechasHtml + '</table>' +
              '</td></tr>' +
              '<tr><td style="padding:28px 32px 32px;">' +
                '<p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#b0b0b0;line-height:1.7;border-top:1px solid #eeebe6;padding-top:20px;">Presentarse en el cuartel con el uniforme reglamentario. Cualquier inconveniente, comunicate con el Ayudante u Oficial a Cargo.</p>' +
              '</td></tr>' +
            '</table>' +
          '</td></tr>' +

          '<tr><td style="padding:24px 0 0;text-align:center;">' +
            '<p style="margin:0 0 6px;font-family:\'Courier New\',monospace;font-size:9px;color:#b0b0b0;letter-spacing:2px;text-transform:uppercase;">Sistema de Guardias &mdash; 1ra Compañía de Bomberos del CBC</p>' +
            '<p style="margin:0;font-family:\'Courier New\',monospace;font-size:9px;color:#ccc;letter-spacing:1px;"><a href="mailto:ayudantec1@bomberosdecoquimbo.cl" style="color:#9b1a1a;text-decoration:none;">ayudantec1@bomberosdecoquimbo.cl</a></p>' +
          '</td></tr>' +
          '</table></td></tr></table></body></html>';

        var textBody =
          "1RA COMPANIA CBC — RECORDATORIO DE GUARDIA\n" +
          "===========================================\n\n" +
          persona.nombre.toUpperCase() + "\n\n" +
          "Recordatorio: tenes guardia MAÑANA como " + labelCargo + ".\n\n" +
          persona.fechas.map(function(f) {
            return "Fecha: " + Utilities.formatDate(f, Session.getScriptTimeZone(), "EEEE d 'de' MMMM 'de' yyyy");
          }).join("\n") + "\n\n" +
          "Presentarse en el cuartel con el uniforme reglamentario.\n\n" +
          "Sistema de Guardias — 1ra Compania de Bomberos del CBC\n" +
          "ayudantec1@bomberosdecoquimbo.cl";

        MailApp.sendEmail({
          to: persona.email,
          subject: "Recordatorio: tienes guardia mañana — 1ra Compañía CBC",
          name: "1ra Compañía CBC — Sistema de Guardias",
          body: textBody,
          htmlBody: htmlBody
        });
      } catch (e) { Logger.log("Recordatorio " + persona.email + ": " + e); }
    })(agrupados[emailKey]);
  }

  return Object.keys(agrupados).length;
}

//══════════════════════════════════════════
// INSTALAR TRIGGER DIARIO (ejecutar una vez desde el editor)
//══════════════════════════════════════════

function instalarTriggerRecordatorios() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "enviarRecordatorios") {
      Logger.log("El trigger ya existe.");
      return;
    }
  }
  ScriptApp.newTrigger("enviarRecordatorios")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  Logger.log("Trigger diario instalado (08:00).");
}

//══════════════════════════════════════════
// ESTADÍSTICAS BÁSICAS (compartido con Estadisticas.gs)
//══════════════════════════════════════════

function formatearHojaGuardias() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) return;
    var config = obtenerConfigGeneral();

    var ultimaCol = sh.getLastColumn();
    if (ultimaCol < 1) return;

    // Forzar 9 columnas con encabezados correctos
    var headers = ["Timestamp", "Nombre", "Email", "Cargo", "Guardia 01", "Guardia 02", "Guardia 03", "Guardia 04", "Nivel"];
    var numFilas = sh.getLastRow();

    // Escribir encabezados
    var rangoHeaders = sh.getRange(1, 1, 1, headers.length);
    rangoHeaders.setValues([headers]);
    rangoHeaders.setFontWeight("bold");
    rangoHeaders.setFontSize(11);
    rangoHeaders.setFontFamily("Arial");
    rangoHeaders.setBackground("#0e0e0e");
    rangoHeaders.setFontColor("white");
    rangoHeaders.setHorizontalAlignment("center");
    sh.setFrozenRows(1);

    // Column widths
    sh.setColumnWidth(1, 160);
    sh.setColumnWidth(2, 200);
    sh.setColumnWidth(3, 220);
    sh.setColumnWidth(4, 110);
    for (var c = 5; c <= 8; c++) sh.setColumnWidth(c, 130);
    sh.setColumnWidth(9, 120);

    // Nota: la columna Nivel (I) ya no se reescribe aquí.
    // La lectura usa normalizarNivel() (Reglas.gs) y la migración
    // histórica se hace con "Ejecutar migración niveles" del menú.

    // Formatear y normalizar fechas existentes (filas 2+)
    if (numFilas > 1) {
      for (var i = 2; i <= numFilas; i++) {
        var filaRange = sh.getRange(i, 1, 1, headers.length);
        var bg = i % 2 === 0 ? "#f7f5f2" : "#ffffff";
        filaRange.setBackground(bg);

        // Normalizar fechas (cols 5-8)
        for (var c = 5; c <= 8; c++) {
          var celda = sh.getRange(i, c);
          var val = celda.getValue();
          var fechaObj = null;

          if (val instanceof Date && !isNaN(val)) {
            fechaObj = val;
          } else if (typeof val === "string") {
            var strVal = val.trim();
            // DD/MM/YYYY
            var mDMY = strVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (mDMY) {
              fechaObj = new Date(parseInt(mDMY[3]), parseInt(mDMY[2]) - 1, parseInt(mDMY[1]));
              if (isNaN(fechaObj.getTime())) fechaObj = null;
            }
            // "jueves 9" etc
            if (!fechaObj) {
              var mDia = strVal.match(/^[a-záéíóúñ]+\s+(\d{1,2})$/i);
              if (mDia) {
                var ts = sh.getRange(i, 1).getValue();
                var m = (ts instanceof Date && !isNaN(ts)) ? ts.getMonth() : config.mes;
                var y = (ts instanceof Date && !isNaN(ts)) ? ts.getFullYear() : config.año;
                fechaObj = new Date(y, m, parseInt(mDia[1]));
                if (isNaN(fechaObj.getTime())) fechaObj = null;
              }
            }
          }

          if (fechaObj && !isNaN(fechaObj.getTime())) {
            celda.setValue(fechaObj);
            celda.setNumberFormat("dddd d");
          }
        }
      }
    }
    Logger.log("formatearHojaGuardias: OK");
  } catch(e) {
    Logger.log("Error formatearHojaGuardias: " + e);
  }
}

function generarEstadisticasBasicas() {
  // Ligera: solo métricas agregadas. No formatea la hoja (eso es manual, menú "Formatear hoja").
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) return;
  var data = sh.getDataRange().getValues();

  var totalGuardias = 0;
  var emails = new Set();

  for (var i = 1; i < data.length; i++) {
    var email = String(data[i][2] || "").trim().toLowerCase();
    if (!email) continue;
    emails.add(email);
    for (var j = 4; j <= 7; j++) {
      if (data[i][j]) totalGuardias++;
    }
  }

  var sheetName = "Estadisticas";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();
  sheet.getRange(1, 1, 4, 2).setValues([
    ["Métrica", "Valor"],
    ["Total guardias registradas", totalGuardias],
    ["Bomberos únicos registrados", emails.size],
    ["Registros (inscripciones)", data.length - 1]
  ]);
}