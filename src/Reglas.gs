//══════════════════════════════════════════
// REGLAS DE NEGOCIO — funciones puras
// Sin dependencias de Apps Script (testeable en Node)
//══════════════════════════════════════════

var REGLAS = {
  cupoOperativoPorDia: 2,       // Operativos + Profesionales por día
  cupoMaquinistaPorDia: 1,      // Maquinistas por día
  nivelesCupoOperativo: ["OPERATIVO", "PROFESIONAL"],
  guardiasMaxHistoricoMes: 4    // Compatibilidad con registros antiguos de 4 fechas
};

//══════════════════════════════════════════
// NORMALIZADOR ÚNICO DE NIVEL
// Acepta valores históricos y actuales:
//   "Sí"/"si"      → OPERATIVO   (histórico checkbox)
//   "No"/""        → INICIAL     (histórico checkbox)
//   "O"/"operativo"→ OPERATIVO
//   "P"/"profesional" → PROFESIONAL
//   "I"/"inicial"  → INICIAL
//   "INICIAL"/"OPERATIVO"/"PROFESIONAL" (ya normalizado)
// Devuelve null si el valor es desconocido (no se silencia).
//══════════════════════════════════════════

function normalizarNivel(valor) {
  var v = String(valor == null ? "" : valor).trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes: sí -> si
  if (v === "") return "INICIAL";
  if (v === "si") return "OPERATIVO";
  if (v === "no") return "INICIAL";
  if (v === "o" || v === "operativo") return "OPERATIVO";
  if (v === "p" || v === "profesional") return "PROFESIONAL";
  if (v === "i" || v === "inicial") return "INICIAL";
  return null;
}

function nivelLetra(nivel) {
  if (nivel === "OPERATIVO") return "O";
  if (nivel === "PROFESIONAL") return "P";
  if (nivel === "INICIAL") return "I";
  return "";
}

function consumeCupoOperativo(nivel) {
  return REGLAS.nivelesCupoOperativo.indexOf(nivel) !== -1;
}

//══════════════════════════════════════════
// VALIDADORES Y RESOLUTORES PUROS
//══════════════════════════════════════════

function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email == null ? "" : email).trim());
}

//══════════════════════════════════════════
// FECHAS — partes seguras por zona horaria
//
// PROBLEMA que resuelve: new Date("2026-07-08") se interpreta como
// medianoche UTC; en Santiago (UTC-3) eso es el 7 de julio a las 21:00,
// así que getDate()/getMonth() devuelven EL DÍA ANTERIOR.
//
// fechaPartesDe acepta Date o texto "YYYY-MM-DD" (con o sin ceros)
// y devuelve SIEMPRE las partes reales: {y:2026, m:7, d:8} (m:1-12).
// Devuelve null si no se puede interpretar.
//══════════════════════════════════════════

function fechaPartesDe(valor) {
  if (Object.prototype.toString.call(valor) === "[object Date]") {
    if (isNaN(valor.getTime())) return null;
    return { y: valor.getFullYear(), m: valor.getMonth() + 1, d: valor.getDate() };
  }
  var s = String(valor == null ? "" : valor).trim();
  var mch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!mch) return null;
  var y = parseInt(mch[1], 10), m = parseInt(mch[2], 10), d = parseInt(mch[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y: y, m: m, d: d };
}

function pad2(n) { return String(n).padStart(2, "0"); }

//══════════════════════════════════════════
// VALIDADOR DEL CONTRATO "cal-1"
// Garantiza que la respuesta del calendario sea predecible:
//   ok:true  → version, mes, año, ocupacion, configuracion, diagnostico
//   ok:false → errorCode, message, diagnostico
// Cualquier otra forma (null, undefined, campos faltantes) es inválida.
//══════════════════════════════════════════

function esContratoCalendarioValido(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (obj.version !== "cal-1") return false;
  if (!obj.diagnostico || typeof obj.diagnostico !== "object") return false;

  if (obj.ok === true) {
    if (typeof obj.mes !== "number" || typeof obj.año !== "number") return false;
    if (!obj.ocupacion || typeof obj.ocupacion !== "object" || Array.isArray(obj.ocupacion)) return false;
    if (!obj.configuracion || typeof obj.configuracion !== "object") return false;
    if (typeof obj.generadoEn !== "string" || !obj.generadoEn) return false;
    return true;
  }
  if (obj.ok === false) {
    if (typeof obj.errorCode !== "string" || !obj.errorCode) return false;
    if (typeof obj.message !== "string") return false;
    return true;
  }
  return false;
}

// Resuelve "Mostrar panel de asistencia" (Config!C8 nuevo / B9 legado).
// 1, "1", true → true · 0, "0", false → false · vacío/inválido → default FALSE (oculto)
function resolverMostrarAsistencia(valor, valorLegado) {
  function f(v) {
    if (v === "" || v === null || v === undefined) return null;
    var s = String(v).trim();
    if (s === "1") return true;
    if (s === "0") return false;
    return null;
  }
  var nuevo = f(valor);
  if (nuevo !== null) return nuevo;
  var viejo = f(valorLegado);
  if (viejo !== null) return viejo;
  return false; // default: OCULTO (minimalista por defecto)
}

// Resuelve cantidad de guardias (Config!C5 nuevo / B10 legado). Solo 2|3|4.
function resolverCantidadGuardias(valor, valorLegado, defecto) {
  function p(v) {
    var n = parseInt(v, 10);
    return (n === 2 || n === 3 || n === 4) ? n : null;
  }
  var nuevo = p(valor);
  if (nuevo !== null) return nuevo;
  var viejo = p(valorLegado);
  if (viejo !== null) return viejo;
  return defecto || 4;
}

//══════════════════════════════════════════
// CAPACIDAD POR DÍA
// Cuenta igual que hace cumplir el motor:
//  - maquinistas: filas cuyo cargo incluye "maquinista"
//  - operativos: filas cuyo nivel consume cupo operativo (O o P, cualquier cargo)
// filas: [{ cargo: String, nivel: String }]
//══════════════════════════════════════════

function contarCupoDia(filas) {
  var r = { maquinistas: 0, operativos: 0 };
  (filas || []).forEach(function(f) {
    var cargo = String(f.cargo || "").trim().toLowerCase();
    if (cargo.indexOf("maquinista") !== -1) r.maquinistas++;
    if (consumeCupoOperativo(f.nivel)) r.operativos++;
  });
  return r;
}

function diaBloqueadoPara(cuenta, cargo, consumeCupo) {
  // Espejo exacto de la regla vigente desde siempre:
  //  - maquinista: bloqueado si ya hay 1 maquinista
  //  - operativo/profesional: bloqueado si ya hay 2 operativos
  //  - combinación: bloqueada solo si AMBOS cupos están llenos
  //  - inicial: nunca bloqueado por cupo
  var maqLleno = cuenta.maquinistas >= REGLAS.cupoMaquinistaPorDia;
  var opLleno = cuenta.operativos >= REGLAS.cupoOperativoPorDia;
  var esMaq = String(cargo || "").indexOf("maquinista") !== -1;
  var esVol = String(cargo || "").indexOf("voluntario") !== -1;
  if (!esMaq && !consumeCupo) return false;
  if (esMaq && esVol && consumeCupo) return maqLleno && opLleno;
  if (esMaq && maqLleno && consumeCupo && opLleno) return true;
  if (esMaq && maqLleno) return true;
  if (!esMaq && consumeCupo && opLleno) return true;
  return false;
}

//══════════════════════════════════════════
// CANTIDAD DE FECHAS POR INSCRIPCIÓN
// fechasNuevas: ["YYYY-MM-DD", ...] enviadas ahora
// fechasExistentes: [] o fechas ya registradas del mismo mes
// cantidadGuardias: configuración vigente (2 | 3 | 4)
// Devuelve { errores:[], fusion:[fechas], total:number }
// Nota: el máximo de fusión con histórico sigue siendo 4
//       (compatibilidad: no se recorta ni borra histórico).
//══════════════════════════════════════════

function fusionFechasUnicas(existentes, nuevas) {
  var todas = (existentes || []).slice();
  (nuevas || []).forEach(function(f) {
    if (todas.indexOf(f) === -1) todas.push(f);
  });
  todas.sort();
  return todas;
}

function evaluarCantidadFechas(fechasNuevas, fechasExistentes, cantidadGuardias) {
  var errores = [];
  var nuevas = fechasNuevas || [];
  var n = nuevas.length;

  if (n < 1) errores.push("Selecciona al menos 1 día.");

  var maxInscripcion = Math.max(1, Math.min(cantidadGuardias || 4, REGLAS.guardiasMaxHistoricoMes));
  if (n > maxInscripcion) {
    errores.push("La configuración actual permite hasta " + maxInscripcion +
      " guardia" + (maxInscripcion !== 1 ? "s" : "") + " por inscripción.");
  }

  if (n !== new Set(nuevas).size) errores.push("Las fechas no deben repetirse.");

  var fusion = nuevas.slice();
  var hayExistentes = !!(fechasExistentes && fechasExistentes.length);
  if (hayExistentes) {
    fusion = fusionFechasUnicas(fechasExistentes, nuevas);
    if (fusion.length > REGLAS.guardiasMaxHistoricoMes) {
      errores.push("Ya tienes " + fechasExistentes.length +
        " guardias este mes. Agregando estas fechas superarías el máximo histórico de " +
        REGLAS.guardiasMaxHistoricoMes + ".");
    } else if (fusion.length === fechasExistentes.length && n > 0) {
      errores.push("Ya estás registrado para estas fechas.");
    }
  }

  return { errores: errores, fusion: fusion, total: fusion.length };
}

//══════════════════════════════════════════
// PLAN DE MIGRACIÓN DE NIVELES (puro, testeable)
// Recibe los valores crudos de la columna Nivel y devuelve
// qué cambiar, qué queda igual y qué es desconocido.
// Idempotente por construcción: aplicar dos veces → 0 cambios.
//══════════════════════════════════════════

function planMigracionNiveles(valoresCrudos) {
  var plan = { total: valoresCrudos.length, porValor: {}, aCambiar: [], sinCambio: 0, desconocidos: [] };
  for (var i = 0; i < valoresCrudos.length; i++) {
    var raw = valoresCrudos[i];
    var clave = String(raw === "" || raw == null ? "(vacío)" : raw);
    plan.porValor[clave] = (plan.porValor[clave] || 0) + 1;

    var norm = normalizarNivel(raw);
    if (norm === null) {
      plan.desconocidos.push({ indice: i, valor: String(raw) });
      continue;
    }
    if (String(raw).trim() !== norm) {
      plan.aCambiar.push({ indice: i, valorActual: String(raw), nuevo: norm });
    } else {
      plan.sinCambio++;
    }
  }
  return plan;
}

//══════════════════════════════════════════
// MES/AÑO de una fecha "YYYY-MM-DD"
//══════════════════════════════════════════

function mesAnioDeFecha(fechaStr) {
  var d = new Date(fechaStr + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  return { mes: d.getMonth(), anio: d.getFullYear() };
}

function todasMismoMes(fechas) {
  if (!fechas || fechas.length === 0) return true;
  var primera = mesAnioDeFecha(fechas[0]);
  for (var i = 1; i < fechas.length; i++) {
    var m = mesAnioDeFecha(fechas[i]);
    if (!m || m.mes !== primera.mes || m.anio !== primera.anio) return false;
  }
  return true;
}

// Validador del healthCheck {ok:true, version, timestamp}
function esHealthCheckValido(o) {
  return !!(o && typeof o === "object" &&
    o.ok === true &&
    typeof o.version === "string" && o.version.length > 0 &&
    typeof o.timestamp === "string" && o.timestamp.length > 0);
}
