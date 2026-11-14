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

function autorizarCorreoSesion_(email) {
  var solicitado = String(email || "").trim().toLowerCase();
  var activo = "";
  try { activo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase(); } catch (e) {}
  return {
    ok: !!activo && activo === solicitado && esEmailValido(activo),
    codigo: !activo ? "IDENTIDAD_NO_DISPONIBLE" : activo !== solicitado ? "IDENTIDAD_NO_COINCIDE" : "OK"
  };
}

function autorizarAdmin_() {
  var activo = "";
  try { activo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase(); } catch (e) {}
  var lista = String(PropertiesService.getScriptProperties().getProperty("ADMIN_EMAILS") || "")
    .split(",").map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean);
  return { ok: !!activo && lista.indexOf(activo) !== -1, codigo: activo ? "ADMIN_NO_AUTORIZADO" : "IDENTIDAD_NO_DISPONIBLE" };
}

function _generarCodigoOtp_() {
  // Apps Script no expone Web Crypto en servidor. Se deriva el código de un
  // UUID de plataforma y SHA-256, evitando Math.random() y sus estados débiles.
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ":" + new Date().toISOString()
  );
  var n = 0;
  for (var i = 0; i < 4; i++) n = (n * 256 + (bytes[i] < 0 ? bytes[i] + 256 : bytes[i])) >>> 0;
  return String(100000 + (n % 900000));
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
    var consulta = _buscarGuardiasPorEmailInterno(email);
    if (!consulta.ok) {
      return { ok: false, error: "No se pudieron consultar tus guardias. Intenta más tarde." };
    }
    if (!consulta.guardias || consulta.guardias.length === 0) {
      return { ok: false, error: "No se encontraron guardias para este correo." };
    }

    var codigo = _generarCodigoOtp_();
    cache.put("delcode_" + _hashEmail(email), codigo, CONFIG.codigoEliminacionTtlSeg);
    cache.put(keyReq, "1", 60);

    var html = _emailShell({
      titulo: "Código de seguridad",
      accent: "#1a56b0",
      cuerpo: 'Hola <strong>' + (consulta.nombre || "") + '</strong>, recibiste este mensaje porque solicitaste eliminar tus guardias del mes.',
      contenido: '<div style="text-align:center;margin:22px 0;">' +
          '<div style="font-size:11px;letter-spacing:2px;color:#9a948c;text-transform:uppercase;">Tu código es</div>' +
          '<div style="font-size:34px;font-weight:800;letter-spacing:12px;color:#0e0e0e;margin:12px 0;">' + codigo + '</div>' +
          '<div style="font-family:Arial,sans-serif;font-size:11px;color:#8a857d;">Válido por 10 minutos · Un solo uso</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#8a857d;text-align:center;line-height:1.6;">Si no solicitaste este código, ignora este mensaje y tus datos no cambiarán.</div>',
      pieNota: ""
    });

    try {
      MailApp.sendEmail({
        to: email,
        subject: codigo + " — código para eliminar guardias · Guardias 1ra Compañía Coquimbo",
        name: "Guardias 1ra Compañía Coquimbo",
        body: "Tu código es: " + codigo + "\n\nVálido por 10 minutos.",
        htmlBody: html
      });
    } catch (errMail) {
      Logger.log("envío código: " + errMail);
      return { ok: false, error: "No pudimos enviarte el correo con el código. Intenta en unos minutos." };
    }

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
