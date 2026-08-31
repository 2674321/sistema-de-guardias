# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · SemVer.

## [No publicado]

### Cierre del proyecto (documentación / publicación)

- **Demo pública** en GitHub Pages (`docs/demo/`) con datos ficticios, desacoplada del backend real (sin `google.script.run` ni accesos a Sheets).
- **Landing** del proyecto en `docs/index.html`.
- **Workflow** `.github/workflows/pages.yml` que publica `docs/` en GitHub Pages y valida que la demo no referencia el backend real.
- **Calendario cívico** para el periodo de la demo (31/08/2026 → 27/09/2026).
- **LICENSE** (MIT) y **CITATION.cff** añadidos; README reescrito (estructura, capturas, sección "Demo vs Producción", uso y despliegue).
- Se incorpora `docs/img/guardias-hoja-generada.png`: previsualización de la hoja de guardias generada, con datos ficticios.

### Demo de alta fidelidad (rediseño)

- **Demo rediseñada** (`docs/demo/`): ahora es la interfaz de producción **verbatim** (head/CSS + markup + JS de `src/Index.html`) con una capa de datos ficticios. Antes era una simplificación; ahora replica la experiencia real: inscripción, panel de baja, asistencia y calendario bimestral.
- **Backend simulado** en la demo: sustituye la llamada `google.script.run` por un alias local (`D_RUN`) que responde con datos y retardos ficticios, con manejo correcto de peticiones en paralelo en el arranque. La demo **no contiene** referencia alguna a `google.script.run`, Sheets, Drive ni al backend real (lo valida el workflow de Pages).
- **Imagen corregida**: `docs/img/guardias-hoja-generada.png` pasa a ser la **captura real** del formato de hoja de cálculo (1852×745) en lugar de la previsualización generada por el asistente.

### Demo: realce visual del flujo

- El panel de **Inscripción** se pre-rellena al cargar con un ejemplo ficticio (nombre, correo y 2 días con cargo) y el calendario resalta esas fechas como seleccionadas. Así cualquier visitante entiende el flujo de registro sin escribir nada.
- Todo es **solo visual** (capa de datos ficticios de la demo): no persiste ni toca producción.

No hubo cambios funcionales en la aplicación de producción en esta iteración (Apps Script sigue en v58).

### Fixed
- Inscripciones con cargos mixtos (Voluntario + Maquinista) enviaban un correo por cada grupo: ahora llega **un solo resumen consolidado**.
- El correo de código de seguridad fallaba en silencio: ahora los errores de envío se informan y el diseño es distintivo (asunto incluye el código).

### Changed
- Plantillas de correo rediseñadas por completo (registro, baja y código) con la identidad de la app.

## [1.0.0] — 2026-08-25

Primera versión estable completa: reescritura del sistema histórico sobre Apps Script + Sheets con contrato de calendario versionado, niveles de bombero y seguridad de baja por correo.

### Added
- Contrato único `cal-1` para el calendario (`obtenerCalendario`): respuesta serializable garantizada con configuración, disponibilidad y métricas por etapa.
- Niveles de bombero INICIAL / OPERATIVO / PROFESIONAL con normalizador único (`normalizarNivel`) y compatibilidad total con históricos `Sí/No/O/P/I`.
- Cantidad máxima de guardias configurable (2·3·4, hoja Config) respetando registros históricos de 4 fechas.
- Baja de guardias protegida con código de 6 dígitos enviado al correo (TTL 10 min, máx. 5 intentos, un solo uso).
- Menú administrativo 🚒 GUARDIAS CBC en la hoja (7 categorías) con instalación de disparador automática/manual.
- Sistema de formato completo e idempotente para todas las hojas según tipo (DATOS/CONFIGURACIÓN/ASISTENCIA/ESTADÍSTICAS/LOG/BACKUP).
- Migración idempotente de condición histórica → niveles, con diagnóstico previo, respaldo en hoja oculta y bloqueo ante valores desconocidos.
- Estados visuales por día (Disponible/Limitada/Completa), tarjetas-día con cupos OP/MQ, timeline móvil y scroll horizontal seguro.
- Estado de conexión en pantalla (Conectado/Sincronizando/Lento/Sin conexión) con fallback al último calendario válido.
- `healthCheck()` ligero + ping desde menú; sondas de diagnóstico aisladas (`diagnosticoOcupacion`, `serializarRespuestaCalendario`).
- Suite de pruebas portable Apps Script/Node (50 casos) + verificadores estáticos (`check-funciones`, `node --check`) y prueba de carga no abusiva.

### Changed
- Motor de calendario optimizado: lectura única de hojas, índice fecha→guardias construido en una pasada y cruce O(1) con Asistencia (eliminado anidado por día).
- Frontend con máquina de estados de petición (loading/slow/ok/error), requestId contra respuestas obsoletas y reintentos controlados ante payload nulo.
- Autorefresh consciente: se omite con pestaña oculta, escritura, envíos en curso, selecciones activas o interacción reciente (<25 s).
- Controles segmentados para nivel y cantidad de guardias; formulario agrupado con resumen visual de selección.
- Correo autodetectado cuando Google lo permite (siempre editable, silencioso si anónimo).
- Config reubicada en layout por secciones (C3–C8) con validaciones y compatibilidad de lectura con celdas legadas B*.

### Fixed
- Fechas texto desplazadas un día por zona horaria (`new Date("YYYY-MM-DD")` UTC) en PDF, recordatorios, estadísticas, mes activo y baja — unificado vía `fechaPartesDe()`.
- Semanas habilitadas ignoradas cuando la celda se guardaba como decimal regional (`0.2`) — parser robusto (`parseSemanas`).
- `condLetra` indefinida rompía la exportación PDF.
- Reglas de capacidad inoperantes sobre históricos "Sí"/"No" (conteo solo reconocía "O"/"P").
- `inicializarHojaAsistencia()` borraba datos ante formato distinto; ahora nunca destruye información.
- Detección de mes activo frágil (última fila ganaba) → fecha máxima real.
- Pipeline de formato abortado por validaciones mal construidas y rango de 0 columnas en Estadísticas.
- `_pintarCarga`/validador de contrato invocados en cliente sin existir allí.
- Botón REINTENTAR mostrado como texto plano por doble escape.
- Dead code eliminado (`buscarFilaVacia`, `bomberoYaRegistrado`, `marcarAsistencia`, `obtenerAsistencia`, `obtenerTextoCupos`) y ~15 `catch{}` vacíos ahora registran en Logger.

### Security
- Eliminación de guardias ajena usando solo el correo: requerido código enviado al correo del titular.
- LockService en todas las escrituras críticas (inscripción, baja, asistencia, migración).
- Hojas LOG/BACKUP ocultas y con protección de aviso; sin secretos en el repositorio (`.gitignore` + datos demo anonimizados).

### Performance
- Lectura masiva → procesamiento en memoria → escritura masiva; sin `getRange` por celda en flujos automáticos.
- Caché de snapshot de calendario (120 s) invalidada por versión en cada escritura/configuración.
- Autorefresh condicionado (pestaña visible, sin interacción reciente, sin envíos ni inputs activos).

[1.0.0]: https://github.com/2674321/sistema-de-guardias/releases/tag/v1.0.0
