# Sistema de Guardias — 1Cia C.B.C

Sistema de registro y gestión de guardias de voluntarios de la 1Cia C.B.C.

## Arquitectura (FASE 1)

```
Index.html (SPA) ──google.script.run──► Backend Apps Script ──► Google Sheets
                                              │
                                              └──► MailApp (confirmaciones, códigos, recordatorios)
```

| Archivo | Responsabilidad |
|---|---|
| `src/Config.gs` | Configuración central, lectura de hoja Config, semanas habilitadas |
| `src/Reglas.gs` | Reglas puras testeables: normalizador de niveles, cupos, cantidades, migración |
| `src/Db.gs` | Utilidades de lectura/normalización de la hoja Guardias |
| `src/Código.js` | Flujo principal: inscripción, calendario, eliminación, asistencia, correos |
| `src/Seguridad.gs` | Código de baja por correo (anti-suplantación) |
| `src/Migracion.gs` | Migración idempotente de niveles históricos con diagnóstico y respaldo |
| `src/Exportar.js` | Generación del PDF mensual |
| `src/Estadisticas.js` | Estadísticas agregadas (días, mensuales, ranking) |
| `src/Tests.gs` | Suite de pruebas portable (Apps Script / Node) |

## Niveles de bombero

| Nivel | Valor en hoja | Consumo cupo operativo (2/día) |
|---|---|---|
| 🔵 Bombero Inicial | `INICIAL` | No |
| 🟢 Bombero Operativo | `OPERATIVO` | Sí |
| 🟣 Bombero Profesional | `PROFESIONAL` | Sí |

El **normalizador único** (`normalizarNivel` en Reglas.gs) acepta históricos: `Sí→OPERATIVO`, `No/vacío→INICIAL`, letras `O/P/I`. Los valores desconocidos devuelven `null` y nunca se silencian.

## Hoja Config (celdas)

| Celda | Configuración | Default si vacía |
|---|---|---|
| B3 | Primer lunes de guardia del mes | — |
| B6 | Días de antelación para eliminar | 3 |
| B7 | Fecha límite de inscripción | sin límite |
| B8 | Semanas habilitadas, ej: `0,2` | `[0,2]` |
| B9 | Mostrar Panel de Asistencia: `0`=ocultar | visible |
| B10 | **Cantidad MÁXIMA de guardias por inscripción: `2`, `3` o `4`** (el voluntario elige libremente cuántas hacer, desde 1) | 4 |

## Seguridad

- La baja de guardias exige un **código de 6 dígitos enviado al correo** del bombero (válido 10 min, máx. 5 intentos). Ya no basta conocer el correo ajeno.
- `LockService` protege escrituras concurrentes (inscripción, baja, asistencia).

## Migración de datos

Desde el menú **Guardias CBC** en la hoja de cálculo:
1. *Diagnóstico migración niveles* — informe sin escribir.
2. *Ejecutar migración niveles* — pide confirmación, respalda la columna original en `_BackupMigracionNiveles` (oculta) y aplica. Idempotente.

## Menú administrativo (hoja de cálculo)

Al abrir la hoja: **🚒 GUARDIAS CBC**. Si no aparece (script independiente), ejecutar una vez
desde el editor: `instalarTriggerMenuAdmin` — o usar el menú → Mantenimiento.

Categorías: Sistema · Configuración · Formato · Guardias · Asistencia · Mantenimiento · Pruebas.
Destacados:
- **✨ Aplicar formato completo** — idempotente; formatea cada hoja según su tipo
  (encabezados, filtros, zebra, niveles 🔵🟢🟣 con color, estados C/P/R/NC, validaciones,
  hojas técnicas ocultas y protegidas).
- **Config por secciones** — nuevo layout `C3:C8` (Calendario/Guardias/Reglas/Asistencia)
  con validaciones; los valores legados `B*` se leen como respaldo y se migran solos.

## Interfaz web (FASE 2)

- **DEVICE_MODE**: `DESKTOP / TABLET / MOBILE` detectado por pointer/hover + viewport
  (User-Agent solo de apoyo) + orientación; atributos `data-modo/data-orient` en `<body>`.
- **Móvil**: bottom-nav táctil (áreas ≥44px), calendario como **lista/timeline** con pills
  ● Disponible / ● Disponibilidad limitada / ● Completa y cupos por día.
- **Desktop**: navegación sticky con scrollspy; puntos de estado en cada día del grid.
- **Animaciones** profesionales respetando `prefers-reduced-motion`.
- **Estados de botón**: GUARDANDO… → ✓ GUARDADO / ✗ ERROR (sin doble envío).
- **Correo**: detección automática vía `Session.getActiveUser()` cuando Google lo permite;
  siempre editable; si es anónimo, aviso discreto de ingreso manual.
- **Auto-refresh inteligente** (45 s): se omite si hay interacción reciente (<25 s),
  inputs activos, envíos en curso o pestaña oculta.
- Consola: `__fase2SelfTest()` muestra modo, orientación y coherencia del panel Asistencia.

## Pruebas

```bash
node tools/local-tests/run_tests.mjs     # local (Node)
# En Apps Script: menú "Guardias CBC" → "Ejecutar tests FASE 1"
```

## Estructura

```
data/
  registro_guardias.csv   # Respuestas del formulario (Google Sheets)
src/                      # Código Apps Script (sincronizado con clasp)
  appsscript.json         # Configuración del proyecto (zona horaria, web app)
  Código.js               # Lógica principal: doGet, registrarGuardia, formatearHoja
  Index.html              # Interfaz web del sistema
  Estadisticas.js         # Estadísticas diarias/mensuales
  Exportar.js             # Exportación de datos
  ValidacionEliminacion.js # Validaciones y eliminación de registros
```

## Datos

- **Hoja de cálculo:** [Registro de guardias](https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/edit?usp=sharing)
- Columnas: Timestamp, Nombre, Email, Cargo, Guardia 01–04, Nivel

## Sincronización con Apps Script

Configuración en `.clasp.json` (raíz del repo, `rootDir: src`). Ejecutar desde la raíz:

```bash
clasp pull   # Apps Script → repo
clasp push   # repo → Apps Script
```

Requiere sesión previa: `clasp login` (cuenta propietaria).

## Actualización de datos

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/export?format=csv" -o data/registro_guardias.csv
git commit -am "Actualiza datos de guardias" && git push
```
