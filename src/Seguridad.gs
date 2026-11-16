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

//══════════════════════════════════════════
// AUTORIZACIÓN ADMINISTRATIVA (P0, 2026-11-16)
//
// Contextos de ejecución y qué entrega Google:
//  · Web App pública (executeAs=USER_DEPLOYING, access=ANYONE_ANONYMOUS):
//    Session.getActiveUser() SIEMPRE devuelve "" (cuentas @gmail.com,
//    sin dominio Workspace). No existe identidad del visitante → fail-closed.
//  · Menú de la hoja (script vinculado, función con autorización):
//    el dueño del script SÍ obtiene su correo; un editor de cuenta
//    personal puede obtener "" según las políticas de Google.
//
// Por eso la autorización acepta DOS vías, ambas validadas en servidor:
//  1. Identidad directa: getActiveUser ∈ ADMIN_EMAILS (propiedad auditable).
//  2. Token de capacidad: emitido SOLO desde el menú de la hoja tras validar
//     identidad, de corta vida (2 h), no reutilizable tras expirar y
//     revocable (si el correo sale de ADMIN_EMAILS, el token muere).
// Nunca se confía en correos enviados por el cliente ni en getEffectiveUser()
// como identidad del visitante. La lógica de decisión es pura y vive en
// Reglas.gs → evaluarAutorizacionAdmin().
//══════════════════════════════════════════

// Semilla inicial, documentada y revisable desde el menú (Administradores…).
// La fuente autoritativa es la propiedad ADMIN_EMAILS; esta semilla se aplica
// UNA sola vez si la propiedad no existe todavía (nunca sobrescribe cambios).
var ADMIN_SEMILLA_ = [
  "pvc.devno@gmail.com",
  "patriciovarelacontreras@gmail.com",
  "a2cl2674321@gmail.com"
];

function _emailsAdminConfigurados_() {
  var bruta = String(PropertiesService.getScriptProperties().getProperty("ADMIN_EMAILS") || "");
  return bruta.split(",").map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

// Siembra inicial: solo crea la propiedad si nunca existió. Auditable en log.
function asegurarAdminsSembrados_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty("ADMIN_EMAILS") !== null) return;
    props.setProperty("ADMIN_EMAILS", ADMIN_SEMILLA_.join(","));
    Logger.log("[AUDIT] ADMIN_EMAILS sembrada con " + ADMIN_SEMILLA_.length + " administrador(es) iniciales.");
  } catch (e) { Logger.log("[AUDIT] siembra ADMIN_EMAILS falló: " + e); }
}

function _emailActivoSesion_() {
  try {
    var email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (email && esEmailValido(email)) return { email: email, disponible: true };
  } catch (e) {}
  return { email: "", disponible: false };
}

// Token de capacidad: aleatorio, atado al correo validado, 2 h, un vínculo.
function emitirTokenAdmin_(email) {
  var token = Utilities.getUuid();
  var carga = JSON.stringify({ email: String(email).toLowerCase(), ts: Date.now() });
  CacheService.getScriptCache().put("admintok_" + _hashEmail(token), carga, 7200);
  return token;
}

function validarTokenAdmin_(token) {
  if (!token) return { valido: false, email: "" };
  var cruda = CacheService.getScriptCache().get("admintok_" + _hashEmail(String(token)));
  if (!cruda) return { valido: false, email: "" };
  try {
    var datos = JSON.parse(cruda);
    return { valido: true, email: String(datos.email || "").toLowerCase() };
  } catch (e) { return { valido: false, email: "" }; }
}

// Punto único de autorización de las funciones administrativas.
// token (opcional): credencial emitida por gestionarGuardiasProgramadas().
function autorizarAdmin_(token) {
  var lista = _emailsAdminConfigurados_();
  var sesion = null;

  if (token) {
    var tv = validarTokenAdmin_(token);
    sesion = { via: "token", email: tv.email, valido: tv.valido };
  } else {
    var id = _emailActivoSesion_();
    sesion = id.disponible ? { via: "identidad", email: id.email } : null;
  }

  var res = evaluarAutorizacionAdmin(sesion, lista);
  if (res.ok) Logger.log("[AUDIT] admin=" + res.email + " via=" + res.via);
  else Logger.log("[AUDIT] acceso denegado (" + res.codigo + ")");
  return res;
}

// Mensajes diferenciados por causa, sin exponer detalles sensibles.
function descripcionErrorAdmin_(codigo) {
  switch (codigo) {
    case "IDENTIDAD_NO_DISPONIBLE":
      return "No se pudo verificar tu identidad de Google en este contexto.\n" +
             "Abre la administración desde la hoja de cálculo (menú 🚒 GUARDIAS CBC), no desde el enlace público.";
    case "TOKEN_INVALIDO":
      return "Tu sesión administrativa expiró. Cierra el panel y reábrelo desde el menú 🚒 GUARDIAS CBC de la hoja.";
    case "ADMIN_NO_AUTORIZADO":
      return "Tu cuenta no figura en la lista de administradores del sistema.\n" +
             "El propietario puede agregarla desde: menú 🚒 GUARDIAS CBC → ⚙️ Configuración → Administradores del sistema.";
    default:
      return "Acceso administrativo no autorizado.";
  }
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
