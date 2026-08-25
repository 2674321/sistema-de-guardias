function generarPDF() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID)
    var sh = ss.getSheetByName(SHEET_NAME)
    var datos = sh.getDataRange().getValues()
    var config = obtenerConfigGeneral()
    var meses = ["enero","febrero","marzo","abril","mayo","junio",
                 "julio","agosto","septiembre","octubre","noviembre","diciembre"]
    var mes = meses[config.mes]
    var año = config.año

    var totalDias = new Date(año, config.mes + 1, 0).getDate()
    var primerDia = new Date(año, config.mes, 1).getDay()
    primerDia = primerDia === 0 ? 6 : primerDia - 1

    var diasSemana = ["LUN", "MAR", "MI\u00C9", "JUE", "VIE", "S\u00C1B", "DOM"]

    var mapa = {}
    for (var d = 1; d <= totalDias; d++) {
      var key = año + "-" + (config.mes + 1) + "-" + d
      mapa[key] = { voluntarios: [], voluntariosEmail: [], maquinistas: [], maquinistasEmail: [], operativos: [], operativosNivel: {} }
    }

    var emailsVol = {}, emailsMaq = {}

    for (var i = 1; i < datos.length; i++) {
      if (!datos[i][2]) continue
      var nivelFila = normalizarNivel(datos[i][8])
      for (var c = 4; c <= 7; c++) {
        if (!datos[i][c]) continue
        var fpx = fechaPartesDe(datos[i][c])
        if (!fpx || (fpx.m - 1) !== config.mes || fpx.y !== año) continue
        var fechaStr = año + "-" + (config.mes + 1) + "-" + fpx.d
        var nombre = datos[i][1] || ""
        var email = String(datos[i][2] || "").trim().toLowerCase()
        var cargo = String(datos[i][3] || "").trim().toLowerCase()
        var esMaq = cargo.includes("maquinista")
        var esVol = cargo.includes("voluntario")
        if (esMaq) {
          if (mapa[fechaStr]) { mapa[fechaStr].maquinistas.push(nombre); mapa[fechaStr].maquinistasEmail.push(email) }
          emailsMaq[email] = true
        }
        if (esVol) {
          if (mapa[fechaStr]) { mapa[fechaStr].voluntarios.push(nombre); mapa[fechaStr].voluntariosEmail.push(email) }
          emailsVol[email] = true
        }
        if (consumeCupoOperativo(nivelFila) && mapa[fechaStr]) {
          if (!mapa[fechaStr].operativos.includes(nombre)) mapa[fechaStr].operativos.push(nombre)
          mapa[fechaStr].operativosNivel[nombre] = nivelFila
        }
      }
    }
    var totalVol = Object.keys(emailsVol).length
    var totalMaq = Object.keys(emailsMaq).length

    function fechaCeldaAStr(val) {
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
        return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-M-d")
      }
      var s = String(val || "").trim()
      return s.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, "$1-$2-$3")
    }

    var asistenciaMap = {}
    try {
      var asisSh = ss.getSheetByName("Asistencia")
      if (asisSh) {
        var asisData = asisSh.getDataRange().getValues()
        for (var i = 1; i < asisData.length; i++) {
          var email = String(asisData[i][0] || "").trim().toLowerCase()
          if (!email) continue
          // Find this volunteer's Guardias row to map guardia index → fecha
          for (var di = 1; di < datos.length; di++) {
            if (String(datos[di][2] || "").trim().toLowerCase() !== email) continue
            for (var gi = 0; gi < 4; gi++) {
              if (!datos[di][4 + gi]) continue
              var f = datos[di][4 + gi] instanceof Date
                ? Utilities.formatDate(datos[di][4 + gi], Session.getScriptTimeZone(), "yyyy-M-d")
                : String(datos[di][4 + gi]).trim()
              f = fechaCeldaAStr(f)
              if (!f || !mapa[f]) continue
              if (!asistenciaMap[f]) asistenciaMap[f] = {}
              asistenciaMap[f][email] = {
                estado: asisData[i][3 + gi * 3] || "",
                reemplazoNombre: asisData[i][4 + gi * 3] || ""
              }
            }
            break
          }
        }
      }
    } catch(e) {}

    function esc(t) { return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") }
    function abreviar(n){
      var p = n.trim().split(/\s+/);
      if(p.length < 2) return p[0] || "";
      return p[0] + " " + p[1].charAt(0) + ".";
    }

    // ═════════ GENERAR CELDAS ═════════
    var celdas = ""
    for (var i = 0; i < primerDia; i++) {
      celdas += "<td class='cel empty'></td>"
    }

    var MIN_FILAS = 7
    var totalGuardias = 0

    for (var d = 1; d <= totalDias; d++) {
      var fechaKey = año + "-" + (config.mes + 1) + "-" + d
      var info = mapa[fechaKey]
      var totalDia = (info ? info.voluntarios.length + info.maquinistas.length : 0)
      totalGuardias += totalDia

      // Combinar todas las personas en un array (sin duplicar)
      var personas = []
      var seen = {}
      if (info) {
        info.voluntarios.forEach(function(n, idx) {
          var email = info.voluntariosEmail[idx] || ""
          if (seen[email]) {
            seen[email].tipo = "m+v"
            return
          }
          seen[email] = {nombre: n, email: email, tipo: "v", operativo: info.operativos.indexOf(n) !== -1, nivel: info.operativosNivel[n] || "INICIAL"}
          personas.push(seen[email])
        })
        info.maquinistas.forEach(function(n, idx) {
          var email = info.maquinistasEmail[idx] || ""
          if (seen[email]) {
            seen[email].tipo = "m+v"
            return
          }
          seen[email] = {nombre: n, email: email, tipo: "m", operativo: info.operativos.indexOf(n) !== -1, nivel: info.operativosNivel[n] || "INICIAL"}
          personas.push(seen[email])
        })
      }

      var filas = Math.max(personas.length, MIN_FILAS)
      var rowsHtml = ""
      var reempTexts = []
      for (var r = 0; r < filas; r++) {
        if (r < personas.length) {
          var p = personas[r]
          var cls = p.tipo === "m" ? "m" : (p.tipo === "m+v" ? "m+v" : "v")
          var estG = "", estC = "", estNC = "", estR = ""
          if (p.email && asistenciaMap[fechaKey] && asistenciaMap[fechaKey][p.email]) {
            var est = asistenciaMap[fechaKey][p.email]
            if (est.estado === "C") estC = "C"
            else if (est.estado === "P") estG = "P"
            else if (est.estado === "NC") estNC = "NC"
            else if (est.estado === "R") {
              estR = "R"
              if (est.reemplazoNombre) reempTexts.push(est.reemplazoNombre)
            }
          }
          var niv = p.nivel || "INICIAL"
          var letraN = niv === "PROFESIONAL" ? "P" : (niv === "OPERATIVO" ? "O" : "I")
          var claseN = niv === "PROFESIONAL" ? "lv-p" : (niv === "OPERATIVO" ? "lv-o" : "lv-i")
          rowsHtml += "<tr class='pr'><td class='" + cls + "'><span class='lv " + claseN + "' title='" + niv + "'>" + letraN + "</span>" + esc(abreviar(p.nombre)) + "</td>" +
            "<td class='asis-cell'>" + estC + "</td>" +
            "<td class='asis-cell'>" + estG + "</td>" +
            "<td class='asis-cell'>" + estNC + "</td>" +
            "<td class='asis-cell'>" + estR + "</td></tr>"
        } else {
          rowsHtml += "<tr class='pr'><td></td><td class='asis-cell'></td><td class='asis-cell'></td><td class='asis-cell'></td><td class='asis-cell'></td></tr>"
        }
      }

      var reempHtml = ""
      if (reempTexts.length) {
        reempHtml = '<div class="reemp-info">' + reempTexts.map(function(n){
          return esc(n) + " REEMPLAZA"
        }).join("<br>") + '</div>'
      }

      var countClass = ""
      if (totalDia > 0) countClass = " has-guardias"
      var colIdx = (primerDia + d - 1) % 7
      if (colIdx >= 5) countClass += " finde"

      celdas += "<td class='cel" + countClass + "'>" +
        "<div class='cel-head'><span class='dia-n'>" + d + "</span>" +
        (totalDia > 0 ? "<span class='dia-count'>" + totalDia + "</span>" : "") +
        "</div>" +
        "<table class='itbl'><thead><tr><th></th><th>C</th><th>P</th><th>NC</th><th>R</th></tr></thead><tbody>" +
        rowsHtml + "</tbody></table>" + reempHtml + "</td>"

      if ((primerDia + d) % 7 === 0 && d < totalDias) celdas += "</tr><tr>"
    }

    var ultimo = (primerDia + totalDias) % 7
    if (ultimo !== 0) {
      for (var i = ultimo; i < 7; i++) celdas += "<td class='cel empty'></td>"
    }

    // ═════════ HTML FINAL ═════════
    var html = "<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
      "<title>Guardias \u2014 1ra Compa\u00F1\u00EDa CBC \u2014 " + mes.charAt(0).toUpperCase() + mes.slice(1) + " " + año + "</title>" +
      "<style>" +
      "@page{margin:12mm 4mm;size:A4}" +
      "*{box-sizing:border-box;margin:0;padding:0}" +
      "body{font-family:Georgia,'Times New Roman',serif;font-size:10pt;color:#222;line-height:1.5;padding:4px 4px;max-width:100%;overflow-x:auto}" +
      ".wrapper{width:100%;margin:0 auto;padding:0}" +

      // ═══ HEADER ═══
      ".hdr{display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:2px solid #9b1a1a;margin-bottom:12px}" +
      ".hdr-logo{width:36px;height:36px;border-radius:50%;border:2px solid #9b1a1a;object-fit:cover}" +
      ".hdr-l{flex:1}" +
      ".hdr-tit{font-size:13pt;font-weight:700;color:#0e0e0e;letter-spacing:-0.2px}" +
      ".hdr-sub{font-size:6.5pt;letter-spacing:2px;text-transform:uppercase;color:#9b1a1a;font-weight:600;margin-top:1px}" +
      ".hdr-r{text-align:right}" +
      ".hdr-r .hdr-mes{font-size:11pt;font-weight:600;color:#0e0e0e}" +

      // ═══ ESTADÍSTICAS ═══
      ".stats{display:flex;justify-content:center;gap:24px;margin:0 0 14px}" +
      ".stat{text-align:center;min-width:100px}" +
      ".stat-num{font-size:16pt;font-weight:700;display:block;color:#0e0e0e}" +
      ".stat-label{font-size:7pt;letter-spacing:2px;text-transform:uppercase;color:#999;margin-top:1px}" +
      ".stat-bar{display:block;width:28px;height:2px;margin:3px auto 0}" +
      ".stat-bar.red{background:#9b1a1a}" +
      ".stat-bar.blue{background:#1a3a9b}" +
      ".stat-bar.black{background:#0e0e0e}" +
      ".stat-bar.gray{background:#bbb}" +

      // ═══ TABLA ═══
      "table{border-collapse:collapse;width:100%;table-layout:fixed}" +
      "thead th{background:#0e0e0e;color:#fff;padding:6px 4px;font-size:7.5pt;letter-spacing:2px;text-align:center;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif}" +
      "tbody td{border:1px solid #d4d0cc;padding:4px 4px;min-height:80px;height:auto;width:14.28%;vertical-align:top}" +
      "td.empty{border:none;background:transparent;height:auto}" +

      // ═══ CELDA ═══
      ".cel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:1px}" +
      ".dia-n{font-size:10pt;font-weight:700;color:#999}" +
      ".has-guardias .dia-n{color:#0e0e0e}" +
      ".dia-count{font-size:7pt;font-weight:600;color:#9b1a1a;background:#f5f0ee;padding:1px 6px;border-radius:8px;letter-spacing:0.3px}" +

      // ═══ MINI-TABLA INTERNA ═══
      ".itbl{width:100%;border-collapse:collapse;table-layout:fixed}" +
      ".itbl thead th{background:none;color:#999;padding:2px 3px;font-size:6pt;letter-spacing:1px;text-align:center;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;border:none;border-bottom:1px solid #bbb}" +
      ".itbl thead th:first-child{width:44%;text-align:left}" +
      ".itbl thead th:nth-child(2){width:14%}" +
      ".itbl thead th:nth-child(3){width:14%}" +
      ".itbl thead th:nth-child(4){width:14%}" +
      ".itbl thead th:nth-child(5){width:14%}" +
      ".itbl td{padding:0;border:none;height:20px;font-size:6.5pt;line-height:20px;font-family:'Helvetica Neue',Arial,sans-serif;vertical-align:middle}" +
      ".itbl .pr td{border-bottom:1px solid #e0ddd9;padding:0 2px}" +
      ".itbl .pr td:first-child{padding-left:4px;border-left:3px solid transparent;font-size:6pt}" +
      ".itbl .pr td.v{border-left-color:#9b1a1a;color:#333;font-weight:500}" +
      ".itbl .pr td.m{border-left-color:#1a3a9b;color:#555}" +
      ".itbl .pr td.m\\+v{border-left-color:transparent;background:linear-gradient(135deg,#1a3a9b,#6b2fa0);color:#333;font-weight:700}" +
      ".op-badge{display:inline-block;background:#f0c040;color:#333;font-size:5pt;font-weight:700;padding:0 3px;border-radius:2px;margin-right:3px;letter-spacing:0.5px;line-height:12px;vertical-align:middle}" +

      ".lv{display:inline-block;min-width:12px;padding:0 3px;border-radius:2px;font-size:5pt;font-weight:700;line-height:12px;text-align:center;margin-right:3px;vertical-align:middle}" +
      ".lv-i{background:#e3edfb;color:#1a56b0}" +
      ".lv-o{background:#e2f3e8;color:#1a6b3a}" +
      ".lv-p{background:#efe6fa;color:#6b2fa0}" +
      "td.cel.finde{background:#faf7f1}" +
      ".leyenda-nivel{display:flex;justify-content:center;align-items:center;gap:16px;font-size:6.5pt;color:#888;margin:-8px 0 12px;font-family:'Helvetica Neue',Arial,sans-serif}" +
      ".leyenda-nivel .lv{margin-right:2px}" +
      ".reemp-info{font-size:5.5pt;color:#1a3a9b;font-family:'Helvetica Neue',Arial,sans-serif;line-height:1.5;padding:4px 2px 0;border-top:1px dashed #bbb;margin-top:3px}" +
      ".itbl .pr td:not(:first-child){text-align:center}" +
      ".asis-cell{font-weight:600;font-size:6.5pt;color:#444}" +

      // ═══ INSTRUCCIÓN (solo en pantalla) ═══
      ".topbar{display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#f9f6f4 0%,#fff 100%);border:1px solid #e0ddd9;border-left:4px solid #9b1a1a;padding:8px 14px;margin-bottom:12px;border-radius:4px;font-family:'Helvetica Neue',Arial,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.06)}" +
      ".topbar .hint{flex:1;font-size:9pt;color:#666;line-height:1.5}" +
      ".topbar .hint kbd{display:inline-block;background:#f0eeeb;border:1px solid #d4d0cc;padding:1px 5px;font-size:8pt;border-radius:3px;font-family:monospace;color:#555}" +
      ".topbar .btn-pdf{background:#9b1a1a;color:#fff;border:none;padding:7px 14px;font-size:9pt;border-radius:3px;cursor:pointer;font-weight:600;letter-spacing:0.3px;white-space:nowrap}" +
      ".topbar .btn-pdf:hover{background:#7a1313}" +
      ".topbar .btn-pdf:active{transform:scale(0.97)}" +
      ".topbar .btn-close{background:none;border:1px solid #d4d0cc;color:#888;padding:7px 12px;font-size:9pt;border-radius:3px;cursor:pointer;white-space:nowrap}" +
      ".topbar .btn-close:hover{background:#f0eeeb;color:#555}" +
      ".topbar .btn-close:active{transform:scale(0.97)}" +
      "@media print{.topbar{display:none}}" +

      // ═══ FOOTER ═══
      ".ftr{display:flex;justify-content:space-between;align-items:center;padding-top:6px;margin-top:10px;border-top:1px solid #d4d0cc;font-size:6.5pt;color:#999;font-family:'Helvetica Neue',Arial,sans-serif}" +
      ".ftr .f-l{text-align:left}" +
      ".ftr .f-c{text-align:center}" +
      ".ftr .f-r{text-align:right}" +
      "@media print{" +
      "body{padding:0;overflow:visible}" +
      ".wrapper{max-width:100%;padding:0}" +
      "td.cel{min-height:50px;height:auto;padding:2px 3px}" +
      ".dia-n{font-size:9pt}" +
      ".itbl td{height:18px;font-size:6pt;line-height:18px}}" +

      "</style></head><body>" +
      "<div class='wrapper'>" +

      "<div class='topbar'>" +
        "<span class='hint'>\u2B07 Presion\u00E1 <kbd>Ctrl+P</kbd> o hac\u00E9 clic en <strong>Descargar</strong> — luego eleg\u00ED <strong>Guardar como PDF</strong> en el di\u00E1logo.</span>" +
        "<button class='btn-pdf' onclick='window.print()'>\u2B07 Descargar PDF</button>" +
        "<button class='btn-close' onclick='window.close()'>\u2715 Cerrar</button>" +
      "</div>" +

      // ═══ HEADER ═══
      "<div class='hdr'>" +
        "<img class='hdr-logo' src='https://drive.google.com/thumbnail?id=1KGkEIbJWCCy8qYYWf-bjmTE7PC5UznAI&sz=w200' alt=''>" +
        "<div class='hdr-l'>" +
          "<div class='hdr-tit'>Calendario de Guardias</div>" +
          "<div class='hdr-sub'>1ra C\u00EDa de Bomberos del CBC</div>" +
        "</div>" +
        "<div class='hdr-r'>" +
          "<div class='hdr-mes'>" + mes.charAt(0).toUpperCase() + mes.slice(1) + " " + año + "</div>" +
        "</div>" +
      "</div>" +

      // ═══ ESTADÍSTICAS ═══
      "<div class='stats'>" +
        "<div class='stat'><span class='stat-num'>" + totalVol + "</span><span class='stat-label'>Voluntarios</span><span class='stat-bar red'></span></div>" +
        "<div class='stat'><span class='stat-num'>" + totalMaq + "</span><span class='stat-label'>Maquinistas</span><span class='stat-bar blue'></span></div>" +
        "<div class='stat'><span class='stat-num'>" + (totalVol + totalMaq) + "</span><span class='stat-label'>Personal</span><span class='stat-bar black'></span></div>" +
        "<div class='stat'><span class='stat-num'>" + totalGuardias + "</span><span class='stat-label'>Guardias</span><span class='stat-bar gray'></span></div>" +
      "</div>" +

      "<div class='leyenda-nivel'>" +
        "<span>Niveles:</span>" +
        "<span><span class='lv lv-i'>I</span> Inicial</span>" +
        "<span><span class='lv lv-o'>O</span> Operativo</span>" +
        "<span><span class='lv lv-p'>P</span> Profesional</span>" +
      "</div>" +

      // ═══ TABLA ═══
      "<table><thead><tr>" +
      diasSemana.map(function(d) { return "<th>" + d + "</th>" }).join("") +
      "</tr></thead><tbody><tr>" + celdas + "</tr></tbody></table>" +

      // ═══ FOOTER ═══
      "<div class='ftr'>" +
        "<span class='f-l'>1ra Compa\u00F1\u00EDa de Bomberos del CBC</span>" +
        "<span class='f-r'>Generado: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") + "</span>" +
      "</div>" +
      "</div>" +
      "</body></html>"

    return { ok: true, html: html, mesLabel: mes.charAt(0).toUpperCase() + mes.slice(1), año: año }
  } catch (e) {
    return { ok: false, error: e.toString() }
  }
}