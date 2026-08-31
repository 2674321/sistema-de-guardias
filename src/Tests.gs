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

// Fixture genérica de guardias (mismo ciclo que producción: 31/08 y 14/09).
var HM_GUARDIAS_GEN = [
  { id: "g1", inicio: "2026-08-31", fin: "2026-09-06", activa: true },
  { id: "g2", inicio: "2026-09-14", fin: "2026-09-20", activa: true }
];

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
  h.t("Maquinista O/P NO consume cupo operativo (cuenta solo como maquinista)", function() {
    // Un conductor, sea Operativo o Profesional, cuenta únicamente como maquinista:
    // no aporta al cupo de operativos necesarios para el despacho.
    var c = contarCupoDia([{ cargo: "maquinista", nivel: "OPERATIVO" }, { cargo: "maquinista", nivel: "PROFESIONAL" }]);
    h.eq(c.maquinistas, 2); h.eq(c.operativos, 0);
    if (!diaBloqueadoPara(c, "maquinista", true)) throw new Error("maquinista debe bloquearse con cupo M lleno");
    if (diaBloqueadoPara(c, "voluntario", true)) throw new Error("sin voluntarios O/P aún, operativo no debe bloquearse");
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
  h.t("parseSemanas: texto con coma", function() {
    h.eq(parseSemanas("0,2"), [0, 2]);
  });
  h.t("parseSemanas: número decimal regional 0.2 → [0,2]", function() {
    h.eq(parseSemanas(0.2), [0, 2]);
    h.eq(parseSemanas("0.2"), [0, 2]);
  });
  h.t("parseSemanas: otros separadores y una sola semana", function() {
    h.eq(parseSemanas("0;2"), [0, 2]);
    h.eq(parseSemanas("0 2"), [0, 2]);
    h.eq(parseSemanas(2), [2]);
    h.eq(parseSemanas("abc"), []);
  });

  h.t("healthCheck válido reconocido", function() {
    h.eq(esHealthCheckValido({ ok:true, version:"cal-1", timestamp:"2026-08-25T00:00:00Z" }), true);
    h.eq(esHealthCheckValido({ ok:false, version:"cal-1", timestamp:"x" }), false);
    h.eq(esHealthCheckValido(null), false);
    h.eq(esHealthCheckValido({ ok:true }), false);
  });

  h.t("versión de contrato distinta → INVÁLIDO", function() {
    var r = { ok: true, version: "cal-0", generadoEn: "x", mes: 1, año: 2026,
              ocupacion: {}, configuracion: {}, diagnostico: {} };
    h.eq(esContratoCalendarioValido(r), false);
  });

  // ── FECHA CIVIL (inmune a DST: causa raíz del bug septiembre 2026) ──
  h.t("fechaStrCivil: Date y 'YYYY-MM-DD' y 'DD/MM/YYYY'", function() {
    h.eq(fechaStrCivil(new Date(2026, 7, 31)), "2026-08-31");
    h.eq(fechaStrCivil("2026-08-31"), "2026-08-31");
    h.eq(fechaStrCivil("31/08/2026"), "2026-08-31");
    h.eq(fechaStrCivil("basura"), null);
  });
  h.t("diasEntreCiviles: 31/08→07/09 = 7 y 31/08→14/09 = 14 (cruza DST)", function() {
    h.eq(diasEntreCiviles("2026-08-31", "2026-09-07"), 7);
    h.eq(diasEntreCiviles("2026-08-31", "2026-09-14"), 14);
    h.eq(diasEntreCiviles("2026-09-06", "2026-09-07"), 1);
  });
  h.t("sumarDiasCivil: fin de guardia = inicio + 6 días exactos", function() {
    h.eq(sumarDiasCivil("2026-08-31", 6), "2026-09-06");
    h.eq(sumarDiasCivil("2026-09-14", 6), "2026-09-20");
    h.eq(sumarDiasCivil("2026-12-31", 1), "2027-01-01");
  });
  h.t("diasDeCicloDesde: 28 días cívicos desde el inicio", function() {
    var cic = diasDeCicloDesde("2026-08-31", 28);
    h.eq(cic.length, 28);
    h.eq(cic[0], "2026-08-31");
    h.eq(cic[27], "2026-09-27");
    h.eq(cic.indexOf("2026-09-07") !== -1, true);
    h.eq(cic.indexOf("2026-09-14") !== -1, true);
  });

  // ── GUARDIAS EXPLÍCITAS (fuente única → pertenencia por rango) ──
  var G = normalizarGuardias([
    { id: "G1", inicio: "2026-08-31", duracion: 7, activa: true },
    { id: "G2", inicio: "2026-09-14", duracion: 7, activa: true }
  ]).guardias;
  h.t("esDiaGuardiaEn: regresión DST (14/09 es guardia, no 15/09; sin colados)", function() {
    h.eq(esDiaGuardiaEn(G, "2026-08-31"), true);   // D0 guardia
    h.eq(esDiaGuardiaEn(G, "2026-09-06"), true);   // D6 guardia
    h.eq(esDiaGuardiaEn(G, "2026-09-07"), false);  // D7 descanso (descarta el 07 colado)
    h.eq(esDiaGuardiaEn(G, "2026-09-13"), false);  // D13 descanso
    h.eq(esDiaGuardiaEn(G, "2026-09-14"), true);   // D14 GUARDIA (corrige el bug)
    h.eq(esDiaGuardiaEn(G, "2026-09-15"), true);   // D15 guardia
    h.eq(esDiaGuardiaEn(G, "2026-09-20"), true);   // D20 guardia
    h.eq(esDiaGuardiaEn(G, "2026-09-21"), false);  // D21 descanso (sin 21 colado)
  });
  h.t("esDiaGuardiaEn: guardias inactivas no habilitan", function() {
    var Gi = [{ id: "G1", inicio: "2026-09-14", duracion: 7, activa: false }];
    h.eq(esDiaGuardiaEn(Gi, "2026-09-14"), false);
  });
  h.t("guardiaDesdePartes: valores y validaciones", function() {
    h.eq(guardiaDesdePartes("x", "basura", "", 7), null);
    var g = guardiaDesdePartes("G1", new Date(2026, 7, 31), "", 7);
    h.eq(g.inicio, "2026-08-31");
    var g2 = guardiaDesdePartes("G1", "31/08/2026", "SI", 7);
    h.eq(g2.fin, "2026-09-06");
    var gi = guardiaDesdePartes("A", "2026-09-14", "NO", 7);
    h.eq(gi.activa, false);
    var gd = guardiaDesdePartes("A", "2026-09-14", true, "x");
    h.eq(gd.duracion, 7);
  });
  h.t("normalizarGuardias: básicos sin avisos", function() {
    var n = normalizarGuardias(G);
    h.eq(n.total, 2);
    h.eq(n.avisos, []);
    h.eq(n.guardias[0].inicio, "2026-08-31");
    h.eq(n.guardias[1].fin, "2026-09-20");
  });
  h.t("normalizarGuardias: duración ≠ 7 → aviso + normaliza a 7", function() {
    var c = normalizarGuardias([{ id: "X", inicio: "2026-08-31", duracion: 6 }]);
    h.eq(c.guardias[0].duracion, 7);
    h.eq(c.avisos.length, 1);
  });
  h.t("normalizarGuardias: inicio inválido → aviso y descarte", function() {
    var v = normalizarGuardias([{ id: "Y", inicio: "nada" }]);
    h.eq(v.total, 0);
    h.eq(v.avisos.length, 1);
  });
  h.t("normalizarGuardias: solapamiento detectado", function() {
    var s = normalizarGuardias([
      { id: "A", inicio: "2026-08-31", duracion: 7, activa: true },
      { id: "B", inicio: "2026-09-05", duracion: 7, activa: true }
    ]);
    h.eq(s.avisos.some(function(a){ return a.indexOf("solapamiento") !== -1; }), true);
  });
  h.t("guardiasDesdeLegacy: puente desde Config C3+C4", function() {
    var leg = guardiasDesdeLegacy(new Date(2026, 7, 31), [0, 2]);
    h.eq(leg.total, 2);
    h.eq(leg.guardias[0].inicio, "2026-08-31");
    h.eq(leg.guardias[0].fin, "2026-09-06");
    h.eq(leg.guardias[1].inicio, "2026-09-14");
    h.eq(leg.guardias[1].fin, "2026-09-20");
    h.eq(leg.guardias[1].activa, true);
  });

  h.t("Calendario: bloques de 7 días (guardia / descanso)", function() {
    var bloques = _bloquesCalendario(HM_GUARDIAS_GEN);
    h.eq(bloques.length, 3, "31/08→20/09 → 3 bloques");
    h.eq(bloques[0].inicio, "2026-08-31");
    h.eq(bloques[0].fin, "2026-09-06");
    h.eq(bloques[0].esGuardia, true);
    h.eq(bloques[1].inicio, "2026-09-07");
    h.eq(bloques[1].fin, "2026-09-13");
    h.eq(bloques[1].esGuardia, false, "semana de descanso");
    h.eq(bloques[2].inicio, "2026-09-14");
    h.eq(bloques[2].fin, "2026-09-20");
    h.eq(bloques[2].esGuardia, true);
    var porDescanso = _porDiaDesdeOficialesSemana(bloques, { "2026-09-07": "Opc. Díaz" });
    h.eq(porDescanso["2026-09-07"], "Opc. Díaz", "semana de descanso también asignable");
    h.eq(porDescanso["2026-09-13"], "Opc. Díaz", "todo el bloque descanso");
    h.eq(!!porDescanso["2026-08-31"], false, "no contamina la semana de guardia anterior");
  });

  h.t("Oficial: mapa de semana → día a día, una semana por vez", function() {
    var porDia = _porDiaDesdeOficialesSemana(HM_GUARDIAS_GEN, { "2026-09-14": "102" });
    h.eq(porDia["2026-09-14"], "102", "inicio de semana con oficial");
    h.eq(porDia["2026-09-20"], "102", "fin de semana con oficial");
    h.eq(!!porDia["2026-08-31"], false, "otras semanas no se tocan");
    h.eq(Object.keys(_porDiaDesdeOficialesSemana(HM_GUARDIAS_GEN, {})).length, 0, "sin oficiales → porDia vacío");
  });

  h.t("Oficial: valor en blanco se ignora, texto se recorta", function() {
    var conNombre = _porDiaDesdeOficialesSemana(HM_GUARDIAS_GEN, { "2026-08-31": "  Capitán Aliro  " });
    h.eq(conNombre["2026-08-31"], "Capitán Aliro", "nombre recortado");
    var sin = _porDiaDesdeOficialesSemana(HM_GUARDIAS_GEN, { "2026-08-31": "   " });
    h.eq(!!sin["2026-08-31"], false, "solo espacios → no se asigna");
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

  //────────────────────────────────────────────
  // HOJA DE GUARDIAS (modelo puro, sin spreadsheets)
  //────────────────────────────────────────────

  var G_P1 = { id: "g1", inicio: "2026-08-31", fin: "2026-09-06", activa: true };
  var G_P2 = { id: "g2", inicio: "2026-09-14", fin: "2026-09-20", activa: true };
  var HM_GUARDIAS = [G_P1, G_P2];
  var HM_PERSONAS = {
    "2026-08-31": [
      { nombre: "Cristian Silva", email: "cs@x.cl", nivel: "OPERATIVO", esMaq: true, esVol: false },
      { nombre: "Aymara Segura", email: "as@x.cl", nivel: "PROFESIONAL", esMaq: false, esVol: true }
    ],
    "2026-09-14": [
      { nombre: "Matias Nuñez", email: "mn@x.cl", nivel: "OPERATIVO", esMaq: true, esVol: false }
    ]
  };
  var HM_ASIS = { "as@x.cl|2026-08-31": "C", "mn@x.cl|2026-09-14": "R" };

  function hayMerge(merges, r1, c1, r2, c2) {
    return merges.some(function(x) {
      return x.r1 === r1 && x.c1 === c1 && x.r2 === r2 && x.c2 === c2;
    });
  }
  function findStyle(m, r, c) {
    for (var i = 0; i < m.estilos.length; i++) {
      if (m.estilos[i].r1 === r && m.estilos[i].c1 === c) return m.estilos[i];
    }
    return null;
  }

  h.t("Hoja: título dinámico (31 de Agosto al 20 de septiembre del 2026)", function() {
    h.eq(_tituloHojaDesde(HM_GUARDIAS), "Guardia Nocturna (31 de Agosto al 20 de septiembre del 2026)");
  });
  h.t("Hoja: nombre de archivo dinámico desde las fechas", function() {
    h.eq(_nombreArchivoGuardias(HM_GUARDIAS), "Calendario de Guardias - 31-08-26 a 20-09-26");
  });
  h.t("Hoja: sin guardias → error claro, no crea hoja", function() {
    var m = _modeloHojaGuardias([], {}, {});
    h.eq(m.ok, false, "ok false");
    h.eq(m.error, "No existen guardias programadas para generar.");
  });
  h.t("Hoja: sin presentes, solo períodos (31/08 y 14/09, sin DST)", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    h.eq(m.ok, true, "modelo ok");
    var i31 = m.indice["2026-08-31"];
    h.eq(!!i31, true, "índice 31/08");
    h.eq(m.valores[i31.dia - 1][1], "LUNES\n31-08-26", "fila día 31/08");
    h.eq(i31.roja, true, "31/08..06/09 = GUARDIA (roja)");
    h.eq(i31.inicio, "2026-08-31", "bloque inicia 31/08");
    var i07 = m.indice["2026-09-07"];
    h.eq(!!i07, true, "07/09 presente");
    h.eq(i07.roja, false, "07/09..13/09 = DESCANSO (azul)");
    h.eq(i07.inicio, "2026-09-07", "bloque descanso inicia 07/09");
    var i14 = m.indice["2026-09-14"];
    h.eq(i14.roja, true, "14/09..20/09 = GUARDIA (roja)");
    h.eq(i14.inicio, "2026-09-14", "bloque guardia inicia 14/09 (nunca 15/09)");
    h.eq(m.indice["2026-09-21"] ? true : false, false, "21/09 fuera del rango");
    var v15 = m.indice["2026-09-15"];
    h.eq(v15 && v15.inicio === "2026-09-15", false, "15/09 no inicia ningún bloque");
  });
  h.t("Hoja: encabezado Fecha Guardia / Cumple / Cubre", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    var f3 = m.valores[2], f4 = m.valores[3];
    h.eq(f3[1], "Fecha\nGuardia", "col2 Fecha Guardia");
    h.eq(f3[2], "Cumple", "col3 Cumple");
    h.eq(f3[4], "Cubre", "col5 Cubre");
    h.eq(f4[2], "Si", "Fila2 col3 Si");
    h.eq(f4[3], "No", "Fila2 col4 No");
  });
  h.t("Hoja: merges esperados (título, Oficial de, VOLUNTARIOS)", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, HM_PERSONAS, {});
    h.eq(hayMerge(m.merges, 1, 1, 1, 36), true, "título abarca 36 columnas");
    var of = m.indice["2026-08-31"].oficial;
    h.eq(hayMerge(m.merges, of, 2, of, 36), true, "fila Oficial de col 2..36");
    var vol = m.indice["2026-08-31"].vol;
    h.eq(hayMerge(m.merges, vol[0], 1, vol[vol.length - 1], 1), true, "etiqueta VOLUNTARIOS vertical");
  });
  h.t("Hoja: asistencia C→X(Si), R→X(Cubre); nombres reales", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, HM_PERSONAS, HM_ASIS);
    var i31 = m.indice["2026-08-31"];
    h.eq(m.valores[i31.maq - 1][1], "Cristian Silva", "maquinista 31/08");
    h.eq(m.valores[i31.maq - 1][2], "", "maquinista sin asistencia");
    h.eq(m.valores[i31.vol[0] - 1][1], "Aymara Segura", "voluntaria 31/08");
    h.eq(m.valores[i31.vol[0] - 1][2], "X", "C → X en Si");
    h.eq(m.valores[i31.vol[0] - 1][3], "", "No vacío");
    var i14 = m.indice["2026-09-14"];
    h.eq(m.valores[i14.maq - 1][1], "Matias Nuñez", "maquinista 14/09");
    h.eq(m.valores[i14.maq - 1][4], "X", "R → X en primer Cubre");
  });
  h.t("Hoja: oficiales sin fuente → en blanco + nota informativa", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    h.eq(m.notaOficial, "No existe fuente de datos suficiente para determinar el oficial.");
    var of = m.indice["2026-08-31"].oficial;
    h.eq(m.valores[of - 1][0], "Oficial de Semana:", "etiqueta Oficial de Semana");
    h.eq(m.valores[of - 1][1], "", "valor oficial en blanco");
  });
  h.t("Hoja: oficial leído desde fuente porDia cuando exista", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {},
      { porDia: { "2026-09-14": "102" }, nota: "" });
    var of = m.indice["2026-09-14"].oficial;
    h.eq(m.valores[of - 1][1], "102", "oficial de segunda semana");
  });
  h.t("Hoja: consistencia Web App ↔ hoja (misma fuente esDiaGuardiaEn)", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    for (var k = "2026-08-31"; k <= "2026-09-20"; k = sumarDiasCivil(k, 1)) {
      h.eq(m.indice[k].roja, esDiaGuardiaEn(HM_GUARDIAS, k), "día " + k);
    }
  });
  h.t("Hoja: esquema de colores referencia (roja/azul) en fila de día", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    var s31 = findStyle(m, m.indice["2026-08-31"].dia, 2);
    var s07 = findStyle(m, m.indice["2026-09-07"].dia, 2);
    var s14 = findStyle(m, m.indice["2026-09-14"].dia, 2);
    h.eq(!!s31 && s31.bg === "#C00000", true, "guardia roja #C00000");
    h.eq(!!s07 && s07.bg === "#2E74B5", true, "descanso azul #2E74B5");
    h.eq(!!s14 && s14.bg === "#C00000", true, "guardia roja #C00000");
  });
  h.t("Hoja: freeze de filas no corta merges del encabezado", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    h.eq(m.freezeRows, 4, "freezeRows 1-4 incluye merges 3-4 completos");
    var mal = m.merges.some(function(x) { return x.r1 < m.freezeRows && x.r2 >= m.freezeRows; });
    h.eq(mal, false, "ningún merge cruza el borde de freeze inferior");
  });
  h.t("Hoja: anchos de columna en píxeles (unidades del formato original)", function() {
    var m = _modeloHojaGuardias(HM_GUARDIAS, {}, {});
    h.eq(m.anchoColumnas[1], _pxDesdeAnchoXls(11), "etiqueta 11 → ~82 px");
    h.eq(m.anchoColumnas[2], _pxDesdeAnchoXls(15), "Fecha 15 → ~110 px");
    h.eq(m.anchoColumnas[3], _pxDesdeAnchoXls(4.2), "check 4.2 → ~34 px");
    var total = m.anchoColumnas[1] + 7 * (m.anchoColumnas[2] + 4 * m.anchoColumnas[3]);
    h.eq(total > 1700, true, "ancho total del formato original (~1800 px)");
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
