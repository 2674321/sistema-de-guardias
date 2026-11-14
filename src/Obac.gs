//══════════════════════════════════════════
// OBAC — adapter privado de Sheets hacia el motor puro resolverObacDia()
//══════════════════════════════════════════

var HOJA_OBAC_PUENTE = "OBAC_PuenteNomina";
var HOJA_OBAC_HABILITACIONES = "OBAC_Habilitaciones";

function _tablaObjetosPorHeader(sh) {
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (!data.length) return [];
  var headers = data[0].map(function(h) { return normalizarTextoIdentidad(h).replace(/ /g, "_"); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {};
    headers.forEach(function(h, i) { if (h) o[h] = data[r][i]; });
    out.push(o);
  }
  return out;
}

function _leerFuenteObac() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var puente = _tablaObjetosPorHeader(ss.getSheetByName(HOJA_OBAC_PUENTE));
  var habil = _tablaObjetosPorHeader(ss.getSheetByName(HOJA_OBAC_HABILITACIONES));
  if (!puente.length) return { ok: false, codigo: "PUENTE_NOMINA_NO_DISPONIBLE" };
  var props = PropertiesService.getScriptProperties();
  var ancla = String(props.getProperty("OBAC_ANCHOR_PERSON_ID") || "").trim();
  if (!ancla) return { ok: false, codigo: "ANCLA_NO_CONFIGURADA" };

  var timestamps = puente.map(function(p) { return String(p.fuente_timestamp || "").trim(); }).filter(Boolean).sort();
  var ts = timestamps.length ? timestamps[timestamps.length - 1] : "";
  if (!ts) return { ok: false, codigo: "FUENTE_SIN_TIMESTAMP" };
  var maxHoras = Number(props.getProperty("OBAC_SOURCE_MAX_AGE_HOURS") || 24);
  var edadMs = Date.now() - new Date(ts).getTime();
  var vigente = isFinite(edadMs) && edadMs >= 0 && edadMs <= maxHoras * 3600000;

  return {
    ok: true,
    anclaPersonaId: ancla,
    fuenteTimestamp: ts,
    fuenteVigente: vigente,
    fuente: "OBAC_PuenteNomina",
    nomina: puente.map(function(p) {
      return {
        personaId: String(p.persona_id || ""),
        nombrePresentacion: String(p.nombre_presentacion || ""),
        emailGuardias: normalizarTextoIdentidad(p.email_guardias),
        identidadEstado: String(p.identidad_estado || ""),
        orden: Number(p.orden),
        activo: p.activo,
        vigente: valorAfirmativo(p.vigente),
        esReintegrado: p.es_reintegrado,
        oddPendiente: p.odd_pendiente
      };
    }),
    habilitaciones: habil.map(function(h) {
      return {
        personaId: String(h.persona_id || ""),
        estado: h.estado,
        vigenteDesde: h.vigente_desde,
        vigenteHasta: h.vigente_hasta,
        origen: h.origen,
        fundamento: h.fundamento
      };
    })
  };
}

function resolverObacParaCalendario(personasPorDia) {
  var fuente;
  try { fuente = _leerFuenteObac(); }
  catch (e) {
    Logger.log("resolverObacParaCalendario/fuente: " + e);
    fuente = { ok: false, codigo: "FUENTE_ERROR" };
  }
  var resultado = {};
  Object.keys(personasPorDia || {}).forEach(function(fecha) {
    if (!fuente.ok) {
      resultado[fecha] = { fecha: fecha, estado: "OBAC_PENDIENTE", motivo: fuente.codigo };
      return;
    }
    var dotacion = [];
    (personasPorDia[fecha] || []).forEach(function(p) {
      var email = normalizarTextoIdentidad(p.email);
      var matches = fuente.nomina.filter(function(n) { return n.emailGuardias && n.emailGuardias === email; });
      dotacion.push({
        personaId: matches.length === 1 ? matches[0].personaId : "",
        nombrePresentacion: String(p.nombre || ""),
        identidadEstado: matches.length === 1 && normalizarTextoIdentidad(matches[0].identidadEstado) === "verificada" ? "VERIFICADA" : "PENDIENTE",
        condicionInstitucional: "VOLUNTARIO_ACTIVO",
        rolGuardia: p.esMaq ? "MAQUINISTA" : "VOLUNTARIO"
      });
    });
    resultado[fecha] = resolverObacDia({
      fecha: fecha,
      dotacion: dotacion,
      nomina: fuente.nomina,
      habilitaciones: fuente.habilitaciones,
      anclaPersonaId: fuente.anclaPersonaId,
      fuente: fuente.fuente,
      fuenteTimestamp: fuente.fuenteTimestamp,
      fuenteVigente: fuente.fuenteVigente,
      versionReglas: "obac-1",
      permitirMaquinistaObac: false
    });
  });
  return resultado;
}
