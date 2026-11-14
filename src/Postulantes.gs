//══════════════════════════════════════════
// POSTULANTES — actividades formativas separadas de Guardias!A:I
//══════════════════════════════════════════

var HOJA_POSTULANTES_AUTORIZADOS = "Postulantes_Autorizados";
var HOJA_ACTIVIDADES_FORMATIVAS = "ActividadesFormativas";

function _leerPostulantesAutorizados() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA_POSTULANTES_AUTORIZADOS);
  if (!sh) return { ok: false, codigo: "PADRON_FORMATIVO_NO_DISPONIBLE", personas: [] };
  var data = sh.getDataRange().getValues();
  if (!data.length) return { ok: false, codigo: "PADRON_FORMATIVO_VACIO", personas: [] };
  var idx = {};
  data[0].forEach(function(h, i) { idx[normalizarTextoIdentidad(h).replace(/ /g, "_")] = i; });
  var oblig = ["persona_id", "email", "nombre_presentacion", "condicion_institucional", "estado"];
  if (oblig.some(function(k) { return idx[k] === undefined; })) {
    return { ok: false, codigo: "PADRON_FORMATIVO_CONTRATO_INCOMPLETO", personas: [] };
  }
  var personas = [];
  for (var r = 1; r < data.length; r++) {
    if (!data[r][idx.email]) continue;
    personas.push({
      personaId: data[r][idx.persona_id],
      email: data[r][idx.email],
      nombrePresentacion: data[r][idx.nombre_presentacion],
      condicionInstitucional: data[r][idx.condicion_institucional],
      estado: data[r][idx.estado],
      requiereSupervisor: idx.requiere_supervisor === undefined ? true : valorAfirmativo(data[r][idx.requiere_supervisor])
    });
  }
  return { ok: true, codigo: "OK", personas: personas };
}

function _asegurarHojaActividadesFormativas(ss) {
  var sh = ss.getSheetByName(HOJA_ACTIVIDADES_FORMATIVAS);
  if (!sh) sh = ss.insertSheet(HOJA_ACTIVIDADES_FORMATIVAS);
  var headers = ["evento_id", "creado_en", "persona_id", "nombre_presentacion", "fecha", "tipo_actividad", "estado_programacion", "estado_cumplimiento", "requiere_supervisor", "validado_por", "validado_en"];
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function registrarActividadFormativa(datos) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, errorCode: "SISTEMA_OCUPADO", errores: ["El sistema está ocupado. Intenta nuevamente."] };
  try {
    var email = normalizarTextoIdentidad(datos && datos.email);
    var correoSesion = "";
    try { correoSesion = normalizarTextoIdentidad(Session.getActiveUser().getEmail()); } catch (e) {}
    var padron = _leerPostulantesAutorizados();
    if (!padron.ok) return { ok: false, errorCode: padron.codigo, estado: "REQUIERE_VALIDACION", errores: ["No fue posible verificar la autorización formativa."] };
    var ev = evaluarSolicitudFormativa(padron.personas, {
      email: email,
      identidadVerificada: !!correoSesion && correoSesion === email,
      tipoActividad: datos && datos.tipoActividad,
      fechas: (datos && datos.fechas) || []
    });
    if (!ev.ok) return { ok: false, errorCode: ev.codigo, estado: ev.estado, errores: ["La actividad requiere validación de identidad y autorización por Ayudantía."] };
    for (var f = 0; f < ev.fechas.length; f++) {
      if (!esSemanaHabilitada(ev.fechas[f])) return { ok: false, errorCode: "FECHA_NO_HABILITADA", errores: ["Una fecha no está habilitada para actividades."] };
    }
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = _asegurarHojaActividadesFormativas(ss);
    var existentes = sh.getDataRange().getValues();
    var nuevas = [];
    ev.fechas.forEach(function(fecha) {
      var id = [ev.personaId, fecha, ev.tipoActividad].join("|");
      var duplicado = existentes.some(function(row, i) { return i > 0 && String(row[0]) === id && String(row[6]) !== "CANCELADA"; });
      if (!duplicado) nuevas.push([id, new Date(), ev.personaId, ev.nombrePresentacion, fecha, ev.tipoActividad, "PROGRAMADA", "PENDIENTE", ev.requiereSupervisor ? "SI" : "NO", "", ""]);
    });
    if (!nuevas.length) return { ok: true, estado: "YA_PROGRAMADA", creadas: 0 };
    sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, nuevas[0].length).setValues(nuevas);
    return { ok: true, estado: "PROGRAMADA", creadas: nuevas.length };
  } catch (e) {
    Logger.log("registrarActividadFormativa: " + e);
    return { ok: false, errorCode: "ERROR_INTERNO", errores: ["No se pudo programar la actividad."] };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
