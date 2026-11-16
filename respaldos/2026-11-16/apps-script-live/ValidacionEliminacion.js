function verificarFechaEliminacion(fechas) {
  if (!fechas || fechas.length === 0) return { permitido: true }

  var config = obtenerConfigGeneral()
  var diasLimite = config.diasEliminacion
  if (diasLimite === 0) return { permitido: true }

  var dias = ["domingo","lunes","martes","mi\u00e9rcoles","jueves","viernes","s\u00e1bado"]
  var meses = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"]

  var hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  var primera = new Date(fechas[0])
  primera.setHours(0, 0, 0, 0)

  for (var i = 1; i < fechas.length; i++) {
    var f = new Date(fechas[i])
    f.setHours(0, 0, 0, 0)
    if (f < primera) primera = f
  }

  var diff = (primera - hoy) / (1000 * 60 * 60 * 24)

  if (diff < diasLimite) {
    var fd = dias[primera.getDay()]
    var fm = meses[primera.getMonth()]
    var fechaStr = fd + " " + primera.getDate() + " de " + fm

    var limite = new Date(primera.getTime() - diasLimite*24*60*60*1000)
    var ld = dias[limite.getDay()]
    var lm = meses[limite.getMonth()]
    var limiteStr = ld + " " + limite.getDate() + " de " + lm

    return {
      permitido: false,
      mensaje: "Tu primera guardia es el " + fechaStr +
        ". Solo puedes eliminar hasta el " + limiteStr +
        " (al menos " + diasLimite + " d\u00edas antes)."
    }
  }

  return { permitido: true }
}