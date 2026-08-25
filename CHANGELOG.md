# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · SemVer.

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
