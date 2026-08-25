//══════════════════════════════════════════
// TESTS FASE 1 — Suite de reglas puras + pruebas de entorno
//
// Portable: `pruebasPuras()` corre igual en Apps Script y en Node.
// `ejecutarTestsFase1()` es la entrada desde el editor/menú.
//══════════════════════════════════════════

function _crearHarness() {
  var resultados = [];
  return {
    resultados: resultados,
    t: function(nombre, fn) {
      try {
        fn();
        resultados.push({ nombre: nombre, ok: true });
      } catch (e) {
        resultados.push({ nombre: nombre, ok: false, error: (e && e.message) ? e.message : String(e) });
      }
    },
    eq: function(actual, esperado, msg) {
      var a = JSON.stringify(actual), b = JSON.stringify(esperado);
      if (a !== b) throw new Error((msg || "valor") + ": esperado " + b + ", obtenido " + a);
    }
  };
}

//────────────────────────────────────────────
// PRUEBAS PURAS (sin dependencias de Apps Script)
//────────────────────────────────────────────

function pruebasPuras() {
  var h = _crearHarness();
  var N = normalizarNivel;

  // ── NIVELES ──
  h.t("Nivel INICIAL se reconoce", function() {
    h.eq(N("INICIAL"), "INICIAL"); h.eq(N("inicial"), "INICIAL"); h.eq(N("I"), "INICIAL");
  });
  h.t("Nivel OPERATIVO se reconoce", function() {
    h.eq(N("OPERATIVO"), "OPERATIVO"); h.eq(N("operativo"), "OPERATIVO"); h.eq(N("O"), "OPERATIVO");
  });
  h.t("Nivel PROFESIONAL se reconoce", function() {
    h.eq(N("PROFESIONAL"), "PROFESIONAL"); h.eq(N("profesional"), "PROFESIONAL"); h.eq(N("P"), "PROFESIONAL");
  });
  h.t("Histórico 'Sí' → OPERATIVO", function() {
    h.eq(N("Sí"), "OPERATIVO"); h.eq(N("si"), "OPERATIVO"); h.eq(N(" SÍ "), "OPERATIVO");
  });
  h.t("Histórico 'No' → INICIAL", function() {
    h.eq(N("No"), "INICIAL"); h.eq(N("no"), "INICIAL");
  });
  h.t("Histórico vacío → INICIAL", function() {
    h.eq(N(""), "INICIAL"); h.eq(N(null), "INICIAL"); h.eq(N(undefined), "INICIAL");
  });
  h.t("Valor desconocido → null (no se silencia)", function() {
    h.eq(N("X"), null); h.eq(N("tal vez"), null); h.eq(N("operativo2"), null);
  });
  h.t("Letras por nivel correctas", function() {
    h.eq(nivelLetra("INICIAL"), "I"); h.eq(nivelLetra("OPERATIVO"), "O"); h.eq(nivelLetra("PROFESIONAL"), "P");
  });

  // ── CANTIDAD DE GUARDIAS (config 2 / 3 / 4) ──
  h.t("Config 2: acepta 2, rechaza 3", function() {
    var r2 = evaluarCantidadFechas(["2026-09-01","2026-09-02"], [], 2);
    var r3 = evaluarCantidadFechas(["2026-09-01","2026-09-02","2026-09-03"], [], 2);
    h.eq(r2.errores, []); if (r3.errores.length !== 1) throw new Error("debe rechazar 3 con config 2");
  });
  h.t("Config 3: acepta 3", function() {
    var r = evaluarCantidadFechas(["2026-09-01","2026-09-02","2026-09-03"], [], 3);
    h.eq(r.errores, []);
  });
  h.t("Config 4: acepta 4", function() {
    var r = evaluarCantidadFechas(["2026-09-01","2026-09-02","2026-09-03","2026-09-04"], [], 4);
    h.eq(r.errores, []);
  });
  h.t("Rechaza 0 fechas", function() {
    var r = evaluarCantidadFechas([], [], 4);
    if (r.errores.indexOf("Selecciona al menos 1 día.") === -1) throw new Error("debe exigir ≥1");
  });
  h.t("Rechaza fechas duplicadas", function() {
    var r = evaluarCantidadFechas(["2026-09-01","2026-09-01"], [], 4);
    if (r.errores.indexOf("Las fechas no deben repetirse.") === -1) throw new Error("debe rechazar duplicadas");
  });

  // ── FUSIÓN CON HISTÓRICO ──
  h.t("Histórico 4 + nueva 1 → bloqueado (no recorta histórico)", function() {
    var hist = ["2026-08-03","2026-08-05","2026-08-17","2026-08-19"];
    var r = evaluarCantidadFechas(["2026-08-20"], hist, 2);
    if (r.errores.length === 0) throw new Error("debe superar máximo histórico");
  });
  h.t("Histórico 3 + nueva 1 → fusión a 4 permitida aunque config sea 2", function() {
    var hist = ["2026-08-03","2026-08-05","2026-08-17"];
    var r = evaluarCantidadFechas(["2026-08-19"], hist, 2);
    h.eq(r.errores, []);
    h.eq(r.fusion, ["2026-08-03","2026-08-05","2026-08-17","2026-08-19"]);
  });
  h.t("Reenviar mismas fechas → 'Ya estás registrado'", function() {
    var hist = ["2026-08-03","2026-08-05"];
    var r = evaluarCantidadFechas(["2026-08-03"], hist, 4);
    if (r.errores.indexOf("Ya estás registrado para estas fechas.") === -1) throw new Error("falta aviso duplicado");
  });

  // ── CAPACIDAD OPERATIVA ──
  h.t("Cupo operativo: históricos 'Sí' cuentan como operativos", function() {
    var c = contarCupoDia([
      { cargo: "voluntario", nivel: "OPERATIVO" },   // era "Sí"
      { cargo: "voluntario", nivel: normalizarNivel("Sí") },
      { cargo: "voluntario", nivel: "PROFESIONAL" }
    ]);
    h.eq(c.operativos, 3); h.eq(c.maquinistas, 0);
  });
  h.t("Inicial NO consume cupo operativo", function() {
    var c = contarCupoDia([
      { cargo: "voluntario", nivel: "INICIAL" },
      { cargo: "voluntario", nivel: normalizarNivel("No") },
      { cargo: "voluntario", nivel: "" }
    ]);
    h.eq(c.operativos, 0);
  });
  h.t("Maquinista: 1 existente llena su cupo", function() {
    var c = contarCupoDia([
      { cargo: "maquinista", nivel: "INICIAL" },
      { cargo: "voluntario", nivel: "INICIAL" }, { cargo: "voluntario", nivel: "INICIAL" }
    ]);
    h.eq(c.maquinistas, 1);
    if (!diaBloqueadoPara(c, "maquinista", false)) throw new Error("maquinista debe estar bloqueado");
    if (diaBloqueadoPara(c, "voluntario", false)) throw new Error("inicial no debe bloquearse");
    if (diaBloqueadoPara(c, "voluntario", true)) throw new Error("operativo no debe bloquearse aún (0 op.)");
  });
  h.t("Operativo: 2 existentes llenan cupo y bloquean O/P pero no inicial", function() {
    var c = contarCupoDia([
      { cargo: "voluntario", nivel: "OPERATIVO" },
      { cargo: "voluntario", nivel: "PROFESIONAL" }
    ]);
    if (!diaBloqueadoPara(c, "voluntario", true)) throw new Error("operativo debe bloquearse");
    if (diaBloqueadoPara(c, "voluntario", false)) throw new Error("inicial nunca se bloquea");
  });
  h.t("Regla preservada: maquinista bloqueado por cupo propio aunque haya cupo operativo", function() {
    var c = contarCupoDia([{ cargo: "maquinista", nivel: "OPERATIVO" }]);
    h.eq(c.maquinistas, 1); h.eq(c.operativos, 1);
    if (!diaBloqueadoPara(c, "maquinista", true)) throw new Error("maquinista debe bloquearse con cupo M lleno");
  });
  h.t("Combinado: ambos cupos llenos bloquean todo", function() {
    var c = contarCupoDia([
      { cargo: "maquinista", nivel: "INICIAL" },
      { cargo: "voluntario", nivel: "OPERATIVO" },
      { cargo: "voluntario", nivel: "OPERATIVO" }
    ]);
    if (!diaBloqueadoPara(c, "maquinista", true)) throw new Error("ambos llenos deben bloquear");
    if (!diaBloqueadoPara(c, "voluntario", true)) throw new Error("operativo debe bloquearse");
  });
  h.t("Valor de nivel desconocido no consume cupo", function() {
    var c = contarCupoDia([{ cargo: "voluntario", nivel: null }]);
    h.eq(c.operativos, 0);
  });

  // ── MIGRACIÓN (idempotente) ──
  h.t("Plan migración: mapeo histórico completo", function() {
    var p = planMigracionNiveles(["Sí","si","No","","O","o","P","p","INICIAL","OPERATIVO","PROFESIONAL","I"]);
    var destino = {};
    p.aCambiar.forEach(function(c){ destino[c.valorActual] = c.nuevo; });
    h.eq(destino["Sí"], "OPERATIVO"); h.eq(destino["si"], "OPERATIVO");
    h.eq(destino["No"], "INICIAL");   h.eq(destino[""], "INICIAL");
    h.eq(destino["O"], "OPERATIVO");  h.eq(destino["P"], "PROFESIONAL");
    h.eq(destino["OPERATIVO"], undefined); // ya normalizado: sin cambio
    h.eq(p.desconocidos.length, 0);
    h.eq(p.sinCambio, 3); // INICIAL, OPERATIVO, PROFESIONAL
    h.eq(p.aCambiar.length, 9);
  });
  h.t("Migración repetida → segunda pasada sin cambios", function() {
    var originales = ["Sí","No","", "O","P","X?"];
    var p1 = planMigracionNiveles(originales);
    var aplicados = originales.map(function(v) {
      for (var i = 0; i < p1.aCambiar.length; i++) {
        if (p1.aCambiar[i].valorActual === v) return p1.aCambiar[i].nuevo;
      }
      return v;
    });
    var p2 = planMigracionNiveles(aplicados.filter(function(v){ return planMigracionNiveles([v]).desconocidos.length === 0; }));
    h.eq(p2.aCambiar.length, 0);
  });
  h.t("Migración detecta desconocidos y no los toca", function() {
    var p = planMigracionNiveles(["Sí","¿?","quizás"]);
    h.eq(p.desconocidos.length, 2);
    h.eq(p.aCambiar.length, 1);
  });

  // ── MES/AÑO ──
  h.t("todasMismoMes detecta mezcla", function() {
    if (todasMismoMes(["2026-08-01","2026-09-01"])) throw new Error("meses distintos deben fallar");
    if (!todasMismoMes([])) throw new Error("vacío es válido");
    if (!todasMismoMes(["2026-08-01","2026-08-31"])) throw new Error("mismo mes válido");
  });

  // ── VALIDADOR DE EMAIL ──
  h.t("esEmailValido acepta formatos válidos", function() {
    h.eq(esEmailValido("a@b.cl"), true);
    h.eq(esEmailValido(" nombre.apellido@mail.com "), true);
    h.eq(esEmailValido("v+p@gmail.com"), true);
  });
  h.t("esEmailValido rechaza inválidos", function() {
    h.eq(esEmailValido(""), false);
    h.eq(esEmailValido(null), false);
    h.eq(esEmailValido("sin-arroba"), false);
    h.eq(esEmailValido("a@b"), false);
    h.eq(esEmailValido("a b@c.cl"), false);
  });

  // ── RESOLUTOR B9 / ASISTENCIA ──
  h.t("resolverMostrarAsistencia: 1 visible", function() {
    h.eq(resolverMostrarAsistencia(1, ""), true);
    h.eq(resolverMostrarAsistencia("1", null), true);
  });
  h.t("resolverMostrarAsistencia: 0 oculto", function() {
    h.eq(resolverMostrarAsistencia(0, ""), false);
    h.eq(resolverMostrarAsistencia("0 ", null), false);
  });
  h.t("resolverMostrarAsistencia: vacío usa legado y luego default OCULTO", function() {
    h.eq(resolverMostrarAsistencia("", 0), false);
    h.eq(resolverMostrarAsistencia("", 1), true);
    h.eq(resolverMostrarAsistencia("", ""), false);
    h.eq(resolverMostrarAsistencia(null, null), false);
  });

  // ── RESOLUTOR CANTIDAD DE GUARDIAS ──
  h.t("resolverCantidadGuardias: solo 2/3/4 válidos", function() {
    h.eq(resolverCantidadGuardias("3", "", 4), 3);
    h.eq(resolverCantidadGuardias(2, "", 4), 2);
    h.eq(resolverCantidadGuardias(4, null, 4), 4);
  });
  h.t("resolverCantidadGuardias: rechaza fuera de rango y usa legado/default", function() {
    h.eq(resolverCantidadGuardias("7", "", 4), 4);
    h.eq(resolverCantidadGuardias("1", 3, 4), 3);
    h.eq(resolverCantidadGuardias("", "", 4), 4);
  });

  // ── FECHAS SIN BUG DE ZONA HORARIA ──
  h.t("fechaPartesDe: texto YYYY-MM-DD conserva el día exacto", function() {
    var p = fechaPartesDe("2026-07-08");
    h.eq([p.y, p.m, p.d], [2026, 7, 8]);
  });
  h.t("fechaPartesDe: acepta sin ceros y con basura al final", function() {
    var p = fechaPartesDe("2026-7-8T12:00:00");
    h.eq([p.y, p.m, p.d], [2026, 7, 8]);
  });
  h.t("fechaPartesDe: Date construido local conserva partes", function() {
    var d = new Date(2026, 6, 8); // 8 julio local
    var p = fechaPartesDe(d);
    h.eq([p.y, p.m, p.d], [2026, 7, 8]);
  });
  h.t("fechaPartesDe: inválidos → null", function() {
    h.eq(fechaPartesDe(""), null);
    h.eq(fechaPartesDe("no-fecha"), null);
    h.eq(fechaPartesDe("2026-13-40"), null);
    h.eq(fechaPartesDe(new Date("zzz")), null);
  });
  h.t("pad2 completa a dos dígitos", function() {
    h.eq(pad2(7), "07"); h.eq(pad2(12), "12");
  });

  // ── CONTRATO CALENDARIO cal-1 ──
  h.t("Contrato válido (ok:true) aceptado", function() {
    var r = {
      ok: true, version: "cal-1", generadoEn: "2026-08-25T00:00:00Z",
      mes: 8, año: 2026,
      ocupacion: { "2026-08-05": { voluntarios: 0 } },
      configuracion: { cantidadGuardias: 4 },
      diagnostico: { totalMs: 10 }
    };
    h.eq(esContratoCalendarioValido(r), true);
  });
  h.t("Contrato válido (ok:false con errorCode) aceptado", function() {
    var r = { ok: false, version: "cal-1", errorCode: "CONFIG_INVALIDA",
              message: "fecha inválida", diagnostico: {} };
    h.eq(esContratoCalendarioValido(r), true);
  });
  h.t("null/undefined/objeto vacío → contrato INVÁLIDO", function() {
    h.eq(esContratoCalendarioValido(null), false);
    h.eq(esContratoCalendarioValido(undefined), false);
    h.eq(esContratoCalendarioValido({}), false);
  });
  h.t("ok:true sin ocupacion → INVÁLIDO", function() {
    var r = { ok: true, version: "cal-1", generadoEn: "x", mes: 1, año: 2026,
              configuracion: {}, diagnostico: {} };
    h.eq(esContratoCalendarioValido(r), false);
  });
  h.t("ok:false sin errorCode → INVÁLIDO", function() {
    var r = { ok: false, version: "cal-1", message: "x", diagnostico: {} };
    h.eq(esContratoCalendarioValido(r), false);
  });
  h.t("versión de contrato distinta → INVÁLIDO", function() {
    var r = { ok: true, version: "cal-0", generadoEn: "x", mes: 1, año: 2026,
              ocupacion: {}, configuracion: {}, diagnostico: {} };
    h.eq(esContratoCalendarioValido(r), false);
  });

  return h.resultados;
}

//────────────────────────────────────────────
// PRUEBAS DE ENTORNO (solo Apps Script)
//────────────────────────────────────────────

function pruebasEntorno() {
  var h = _crearHarness();

  h.t("Concurrencia: LockService adquirible y liberable", function() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("no se pudo adquirir lock");
    try { lock.releaseLock(); } catch (e) { throw new Error("release falló: " + e); }
    if (!lock.tryLock(10000)) throw new Error("lock re-adquirible tras release");
    lock.releaseLock();
  });

  h.t("Config: lectura B9/B10 con valores actuales", function() {
    var c = obtenerConfigGeneral();
    h.eq([2,3,4].indexOf(c.cantidadGuardias) !== -1, true, "cantidadGuardias ∈ {2,3,4}");
    h.eq(typeof c.mostrarAsistencia, "boolean", "mostrarAsistencia booleano");
  });

  h.t("Diagnóstico migración sobre datos reales (sin escribir)", function() {
    var d = _diagnosticoMigracion();
    h.eq(d.total > 0, true, "hay filas");
    h.eq(d.desconocidos.length, 0, "sin valores desconocidos en producción");
  });

  return h.resultados;
}

//────────────────────────────────────────────
// ENTRADA PRINCIPAL
//────────────────────────────────────────────

function ejecutarTestsFase1() {
  var todos = pruebasPuras().concat(
    (typeof SpreadsheetApp !== "undefined") ? pruebasEntorno() : []
  );
  var ok = todos.filter(function(r){ return r.ok; }).length;
  var fallos = todos.filter(function(r){ return !r.ok; });

  var resumen = "TESTS FASE 1: " + ok + "/" + todos.length + " OK";
  fallos.forEach(function(f) { resumen += "\n✗ " + f.nombre + " — " + f.error; });

  Logger.log(resumen);
  try {
    SpreadsheetApp.getUi().alert("Tests FASE 1",
      fallos.length ? resumen : resumen + "\n\nTodas las pruebas pasaron.",
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* sin UI */ }

  return { total: todos.length, ok: ok, fallos: fallos };
}
