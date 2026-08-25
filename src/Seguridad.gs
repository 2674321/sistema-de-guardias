//══════════════════════════════════════════
// SEGURIDAD — BAJA DE GUARDIAS CON CODIFICACIÓN POR CORREO
//
// Problema resuelto: antes, cualquier persona que conociera el correo
// de un bombero podía eliminar sus guardias. Ahora la eliminación
// exige un código de un solo uso enviado a ese correo.
//══════════════════════════════════════════

function _hashEmail(email) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    String(email || "").trim().toLowerCase());
  return raw.map(function(b) {
    var h = (b < 0 ? b + 256 : b).toString(16);
    return h.length === 1 ? "0" + h : h;
  }).join("").substring(0, 16);
}

// Paso 1: el bombero solicita el código. Se envía a su correo.
function solicitarCodigoEliminacion(email) {
  try {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Ingresa un correo válido." };
    }

    // Rate-limit: 1 solicitud por minuto por correo
    var cache = CacheService.getScriptCache();
    var keyReq = "delreq_" + _hashEmail(email);
    if (cache.get(keyReq)) {
      return { ok: false, error: "Acabamos de enviarte un código. Revisa tu correo o espera un minuto." };
    }

    // Verificar que efectivamente tenga guardias (evita correos falsos)
    var consulta = buscarGuardiasPorEmail(email);
    if (!consulta.ok) {
      return { ok: false, error: "No se pudieron consultar tus guardias. Intenta más tarde." };
    }
    if (!consulta.guardias || consulta.guardias.length === 0) {
      return { ok: false, error: "No se encontraron guardias para este correo." };
    }

    var codigo = String(Math.floor(100000 + Math.random() * 900000));
    cache.put("delcode_" + _hashEmail(email), codigo, CONFIG.codigoEliminacionTtlSeg);
    cache.put(keyReq, "1", 60);

    MailApp.sendEmail({
      to: email,
      subject: "Código para eliminar guardias — 1ra Compañía CBC",
      name: "1ra Compañía CBC — Sistema de Guardias",
      body: "Tu código para eliminar tus guardias del mes es:\n\n" +
            codigo + "\n\n" +
            "Válido por 10 minutos. Si no solicitaste este código, ignora este mensaje.\n\n" +
            "Sistema de Guardias — 1ra Compañía de Bomberos del CBC"
    });

    return { ok: true, mensaje: "Te enviamos un código a tu correo. Válido por 10 minutos." };
  } catch (e) {
    Logger.log("solicitarCodigoEliminacion: " + e);
    return { ok: false, error: "No se pudo enviar el código. Intenta nuevamente en unos minutos." };
  }
}

// Paso 2 (interno): valida el código antes de eliminar.
// Devuelve {ok:true} o {ok:false, error:"..."}; consume intentos.
function verificarCodigoEliminacion_(email, codigo) {
  email = String(email || "").trim().toLowerCase();
  var esperado = String(codigo == null ? "" : codigo).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Correo inválido." };
  }
  if (!/^\d{6}$/.test(esperado)) {
    return { ok: false, error: "Ingresa el código de 6 dígitos que te enviamos a tu correo." };
  }

  var cache = CacheService.getScriptCache();
  var keyCode = "delcode_" + _hashEmail(email);
  var keyAtt = "delatt_" + _hashEmail(email);

  var guardado = cache.get(keyCode);
  if (!guardado) {
    return { ok: false, error: "El código expiró o no existe. Solicita uno nuevo (botón «Recibir código»)." };
  }

  // Límite de intentos contra fuerza bruta
  var intentos = Number(cache.get(keyAtt) || 0);
  if (intentos >= CONFIG.codigoEliminacionMaxIntentos) {
    cache.remove(keyCode);
    cache.remove(keyAtt);
    return { ok: false, error: "Demasiados intentos incorrectos. Solicita un código nuevo." };
  }

  if (guardado !== esperado) {
    cache.put(keyAtt, String(intentos + 1), CONFIG.codigoEliminacionTtlSeg);
    var restantes = CONFIG.codigoEliminacionMaxIntentos - intentos - 1;
    return { ok: false, error: "El código no coincide. Te quedan " + Math.max(restantes, 0) + " intento(s)." };
  }

  // Éxito: consumir el código (un solo uso)
  cache.remove(keyCode);
  cache.remove(keyAtt);
  return { ok: true };
}
