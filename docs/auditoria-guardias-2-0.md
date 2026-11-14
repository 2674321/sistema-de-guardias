# Auditoría verificable — Sistema de Guardias 2.0

Fecha: 2026-11-14  
Rama de trabajo: `codex/guardias-v2-redesign`  
HEAD inicial: `201f0acd3b88e5dc038d25e4ccab2c0de4c3e59c`  
Alcance: repositorio local, fuentes públicas y fixtures sintéticos. **Producción no fue alterada.**

## Estado de la evidencia

| Fuente | Estado | Evidencia |
|---|---|---|
| Repositorio y tests locales | VERIFICADO | checkout de `origin/main`, suite Node y análisis estático |
| Issue público de seguridad #3 | VERIFICADO | abierto al 2026-11-14; tag `v1.1.0` todavía alcanza dos artefactos retirados |
| Documentación de deployments | VERIFICADO | Apps Script distingue versión inmutable de deployment editable; actualizar el deployment conserva ID/URL |
| Libros Guardias/Ayudantía | NO VERIFICADO EN ESTA EJECUCIÓN | no hay conector autorizado ni credenciales locales; se conserva el diagnóstico V2 como antecedente, no como lectura nueva |
| Permisos de Drive | NO VERIFICADO EN ESTA EJECUCIÓN | no se modificaron ACL ni archivos |
| Deployments Apps Script | NO VERIFICADO | `.clasp.json` ausente y no se autenticó `clasp`; la URL antes hardcodeada no prueba inventario ni vigencia |

## Baseline

- Rama principal remota: `origin/main` en `201f0ac`.
- Tags: `v1.0.0` → `3c8ffeb`; `v1.1.0` → `c5529b9`.
- Baseline local: 69/69 pruebas puras, integridad de 70 funciones cliente/servidor y sintaxis JS correctas.
- Stack: Apps Script V8, HtmlService, Sheets, MailApp, CacheService y LockService.
- Manifest actual: `executeAs=USER_DEPLOYING`, `access=ANYONE_ANONYMOUS`.
- `.clasp.json`: ausente. No se ejecutó `clasp pull`, `push`, `version` ni `deploy`.

## Hallazgos y riesgos

| ID | Prioridad | Hallazgo | Estado / control |
|---|---:|---|---|
| R-01 | P0 | `registrarGuardia` confiaba en `cargo` y nivel enviados por el navegador | IMPLEMENTADO localmente: autorización server-side contra `Voluntarios`, fallo seguro y tests T-A1/T-A2 |
| R-02 | P0 | `SHEET_ID`, deployment ID y URL productiva estaban versionados | IMPLEMENTADO localmente: `SHEET_ID`, `WEB_APP_URL` y `ENVIRONMENT` pasan a Script Properties; falta rotación/verificación autorizada |
| R-03 | P0 | App pública anónima expone varias funciones RPC; no existía autorización administrativa uniforme | IMPLEMENTADO parcialmente: exportación y edición de guardias exigen sesión incluida en `ADMIN_EMAILS`; falta cubrir y probar cada función de mantenimiento en Apps Script QA |
| R-04 | P0 | Antecedente de ACL `anyone` en Drive | NO VERIFICADO; remediación requiere inventario, simulación, autorización y readback |
| R-05 | P0 | Issue #3 abierto; `v1.1.0` conserva en su árbol dos archivos retirados | VERIFICADO; no se movió ni reescribió el tag |
| R-06 | P1 | Consulta/asistencia se basaban solo en correo ingresado | IMPLEMENTADO localmente: sesión activa debe coincidir exactamente; baja usa consulta interna protegida por OTP |
| R-07 | P1 | `doGet()` usaba `ALLOWALL` sin dependencia de embedding documentada | IMPLEMENTADO localmente: eliminado, vuelve la protección por defecto de HtmlService |
| R-08 | P1 | OTP de baja usaba `Math.random()` | IMPLEMENTADO localmente: UUID de plataforma + SHA-256 + rate limit/TTL existentes; pendiente prueba Apps Script QA |
| R-09 | P1 | UI usa `innerHTML` extensamente | PARCIAL: errores pasan a `textContent` y nombres/reemplazos se escapan; falta CSP/análisis contextual completo |
| R-10 | P1 | No existe modelo separado para postulantes ni cumplimiento formativo | PENDIENTE; no se ampliará `Guardias!A:I` directamente |
| R-11 | P1 | Exportador deja OBAC vacío | PENDIENTE; motor puro y adapter de Ayudantía requeridos |
| R-12 | P1 | No se puede comprobar el contrato A:G ni límite 250 sin acceso a los libros | NO VERIFICADO; se debe probar con copia QA estructural |

## Cambio P0: autorización server-side

La autorización nueva sigue esta secuencia:

```mermaid
flowchart LR
  UI[Payload del navegador] --> V[Validación sintáctica]
  V --> P[Lectura server-side de Voluntarios]
  P --> I{Correo exacto y único}
  I -->|No| R[REQUIERE_VALIDACION]
  I -->|Sí| A{Activo y condición operativa}
  A -->|No| R
  A -->|Sí| H{Rol y nivel acreditados}
  H -->|No| R
  H -->|Sí| W[Validar cupos y escribir bajo lock]
```

Reglas conservadoras implementadas:

- no hay fallback por nombre, alias parcial o apellido;
- `Activo=Si` no basta si la condición es Aspirante, Postulante, Brigadier o Pendiente;
- maquinista exige habilitación explícita o cargo de maquinista en el padrón;
- Operativo/Profesional exige un nivel acreditado igual o superior;
- ausencia de hoja, columnas obligatorias, identidad única o evidencia produce rechazo sin escritura;
- el mensaje público no revela el contenido del padrón.

El adapter admite encabezados acotados y requiere al menos correo y estado. El esquema real debe reconciliarse en una copia QA antes de publicar; hasta entonces este cambio no debe desplegarse.

## Superficies RPC observadas

El cliente invoca funciones de configuración, calendario, registro, consulta por correo, códigos/baja, detalle diario, asistencia y exportación. El panel `AdminGuardias.html` invoca lectura/escritura de guardias programadas. Apps Script expone por nombre las funciones globales no terminadas en `_`, por lo que ocultar botones no constituye autorización.

Clasificación inicial:

| Grupo | Funciones representativas | Control requerido |
|---|---|---|
| Lectura pública operativa | `getConfig`, `obtenerCalendario`, `healthCheck` | minimizar datos, rate limit y contrato estable |
| Identidad/consulta | `detectarCorreoUsuario`, `buscarGuardiasPorEmail` | sesión/OTP; no confiar solo en correo ingresado |
| Mutación personal | `registrarGuardia`, `solicitarCodigoEliminacion`, `eliminarGuardiasPorEmail` | identidad, autorización de rol, OTP, lock, idempotencia y auditoría |
| Mutación administrativa | `guardarAsistencias`, `guardarGuardiasAdmin`, generación/exportación | autorización server-side por función y cuenta |
| Diagnóstico/mantenimiento | diagnósticos, instalación, migraciones y formato | no disponibles a visitantes anónimos |

## Flujo de datos y compatibilidad

```mermaid
flowchart TD
  WEB[Index.html] -->|google.script.run| GAS[Apps Script]
  GAS --> G[Guardias A:I legado]
  GAS --> V[Voluntarios / habilitación]
  GAS --> AS[Asistencia]
  GAS --> GP[GuardiasProgramadas]
  G --> SHARE[Guardias Compartir A:G]
  SHARE -->|IMPORTRANGE A6:G250; antecedente V2| AY[Guardias Integración / Ayudantía]
  AY -. lectura mínima futura .-> ID[Identidades y Nómina Interna]
  ID -. elegibilidad verificada .-> OBAC[Motor OBAC]
  OBAC --> EXP[Calendario exportado]
```

Invariantes de migración:

- `Guardias!A:I` no cambia durante la transición;
- postulantes y OBAC se almacenarán en tablas técnicas privadas versionadas;
- la vista A:G se conserva desde fila 6 hasta probar un contrato sucesor;
- una inscripción programada nunca se traduce automáticamente en asistencia;
- hojas heredadas/ocultas no se borran ni se publican.

## Deployments y ambientes

Apps Script documenta que una versión es inmutable y un deployment posee ID/URL; para actualizar sin cambiar la URL se crea una versión y se edita el deployment existente. No se ejecutó ninguna operación de deployment.

| Ambiente | Script ID | Deployment ID | URL | Sheet | Estado |
|---|---|---|---|---|---|
| Demo pública | N/A | GitHub Pages | histórica `/demo/` | ninguno | VERIFICADO en repo, sintético |
| QA funcional | NO VERIFICADO | NO VERIFICADO | NO VERIFICADO | debe ser solo QA | BLOQUEADO hasta inventario autorizado |
| Producción | NO VERIFICADO | NO VERIFICADO | candidato histórico retirado del código | real | NO TOCADO |

Las propiedades obligatorias por proyecto son `ENVIRONMENT`, `SHEET_ID`, `WEB_APP_URL`, `ADMIN_EMAILS`, `OBAC_ANCHOR_PERSON_ID` y opcionalmente `OBAC_SOURCE_MAX_AGE_HOURS`. QA debe fallar el preflight si el ID de hoja coincide con producción o si el banner de ambiente no es `QA`.

## Git e issue de seguridad

El issue público #3 sigue abierto. La inspección local confirma que `v1.1.0` contiene `REM_ECICEP_2026_08.xlsx` y `ODD INTERNA N°001.2026.pdf`; `git log v1.1.0 --` devuelve un commit para esas rutas. No se movió el tag, no se reescribió historia y no se hizo push. La corrección requiere una autorización separada y coordinación con consumidores del tag.

## Gate para continuar

Antes de QA conectado:

1. obtener acceso de solo lectura autorizado y reconciliar el esquema real de `Voluntarios`;
2. crear/confirmar proyecto y libro QA sintético separados;
3. inventariar deployments con propietario y acceso;
4. cerrar autorización de RPC administrativas;
5. confirmar que el cambio de Script Properties no deja valores sin configurar;
6. ejecutar pruebas de entorno Apps Script sobre QA, nunca producción;
7. comparar `Guardias | Compartir!A:G` y el `IMPORTRANGE` en copias QA.

## Evidencia de esta iteración

- 82/82 pruebas puras PASS tras controles de rol, OBAC y postulantes.
- Integridad frontend/backend: 71 funciones llamadas/definidas PASS.
- Sintaxis de archivos `.js`/`.mjs`: PASS.
- `git diff --check`: PASS.
- QA visual local: escritorio y 320/360/375/390/430 px; sin overflow horizontal; flujo formativo demo confirmado.
- QA visual local: escritorio y 320/360/375/390/430 px; sin overflow horizontal. Flujo formativo demo confirmado.
- Producción, Drive, ACL, correos, Apps Script y Git remoto: **NO MODIFICADOS**.
