# Reporte de avance verificable — Guardias 2.0

Fecha: 2026-11-14  
Rama: `codex/guardias-v2-redesign`  
HEAD inicial: `201f0acd3b88e5dc038d25e4ccab2c0de4c3e59c`  
HEAD funcional auditado: `dda6ca1`

> **Producción actualizada y verificada.** El deployment canónico conserva su URL y apunta a Apps Script v61. Se creó el respaldo inmutable v59 antes del cambio. No se modificaron permisos de Drive, no se enviaron correos reales y no se movieron tags.

## Resumen ejecutivo

El sistema productivo lleva aproximadamente seis meses operativo con funcionamiento normal. La rama conserva sus contratos vigentes e implementa una V2 revisable: autorización server-side de rol/nivel, guardias formativas separadas para postulantes, motor OBAC determinista, exportación con pendiente explícito, configuración por ambiente, endurecimiento de RPC y una interfaz responsive más simple.

La interfaz V2 está operativa en producción. QA mantiene una hoja sintética privada y deployment canónico independiente. La estructura real se inspeccionó antes del despliegue y se añadió compatibilidad segura para los 28 correos con historial: rol, nivel y nombre se resuelven en el servidor desde el último registro histórico. Las identidades nuevas quedan en validación hasta incorporar correo al padrón.

## Estado por fase

| Fase | Estado | Evidencia / pendiente |
|---|---|---|
| F0 Auditoría | IMPLEMENTADO | repositorio, libro productivo inspeccionado, 11 deployments inventariados; ACL productivas no modificadas |
| F1 Seguridad/entornos | IMPLEMENTADO, PROBADO parcialmente | proyecto/hoja QA separados, Script Properties, rol server-side, OTP y `ALLOWALL` retirado; `ADMIN_EMAILS` aún sin configurar |
| F2 Design system/UI | IMPLEMENTADO y PROBADO | interfaz neutra y compacta; vista previa escritorio/móvil; asistencia oculta desde el HTML y Config |
| F3 Inscripción/consulta/bajas | PARCIAL | inscripción endurecida, consulta ligada a sesión, baja OTP preservada; reemplazos y cancelación individual pendientes |
| F4 Postulantes | IMPLEMENTADO local, PROBADO sintético | tablas separadas, correo único autorizado, guardia no operativa; cumplimiento administrativo pendiente |
| F5 Identidad/OBAC | IMPLEMENTADO como motor + adapter | puente mínimo, ancla por propiedad, frescura, reintegros/ODD/alias fail-closed; datos reales NO VERIFICADOS |
| F6 Exportador | IMPLEMENTADO local | OBAC asignado o `PENDIENTE DE ASIGNACIÓN`; prueba real de hoja pendiente |
| F7 Panel/admin/ACL | PARCIAL | RPC críticas protegidas; panel V2 y remediación ACL pendientes de autorización |
| F8 QA URL estable | IMPLEMENTADO | deployment canónico actualizado hasta `@8`, conservando el mismo ID y `/exec` |
| F9 Paquete PROD | IMPLEMENTADO | respaldo v59, candidata v61 y deployment canónico productivo actualizado con smoke test conectado |

## Cambios principales

### Seguridad e identidad

- `registrarGuardia` ya no confía en cargo/nivel del navegador.
- `Voluntarios` se lee por encabezados; correo exacto y único, activo, condición operativa y habilitación específica son obligatorios.
- Aspirante/Postulante/Brigadier/Pendiente nunca se autohabilitan.
- consulta y asistencia requieren que `Session.getActiveUser()` coincida con el correo solicitado;
- exportación y administración de guardias requieren sesión incluida en `ADMIN_EMAILS`;
- OTP deriva seis dígitos de UUID de plataforma + SHA-256, conservando TTL y límite de intentos;
- se eliminó `XFrameOptionsMode.ALLOWALL`;
- errores visibles usan `textContent` y nombres de detalle se escapan.

### Configuración/ambientes

- se retiraron Sheet ID, deployment ID y URL productiva del código activo;
- propiedades: `ENVIRONMENT`, `SHEET_ID`, `WEB_APP_URL`, `ADMIN_EMAILS`, `OBAC_ANCHOR_PERSON_ID`, `OBAC_SOURCE_MAX_AGE_HOURS`;
- `tools/prueba-carga.mjs` exige URL QA explícita y `CONFIRM_QA_LOAD_TEST=YES`;
- ambiente sin configurar bloquea el botón de registro; QA/vista previa muestran banner persistente.

### Postulantes

- `Postulantes_Autorizados` guarda solo identidad mínima y autorización;
- `ActividadesFormativas` separa programación de cumplimiento;
- no escribe `postulante` en `Guardias!A:I`, no asigna nivel/rol, no cuenta cupos y no entra en OBAC/ranking;
- modalidad única `GUARDIA_FORMATIVA`, sin selector de actividad ni lenguaje de citación;
- idempotencia por `persona_id|fecha|GUARDIA_FORMATIVA`;
- guardia formativa requiere correo exacto y único con condición `POSTULANTE/AUTORIZADO`; conserva el mismo patrón de inscripción simple del flujo operativo.

### OBAC

- motor puro `resolverObacDia()`;
- ancla localizada por `persona_id`, nunca por fila/orden hardcodeado;
- exige fuente con timestamp vigente, identidad verificada, persona programada, orden inclusivo, activo/vigente y habilitación explícita;
- excluye posteriores al corte, reintegrados sin validación, ODD pendiente, postulantes, identidad ambigua y maquinistas por defecto;
- desempate por menor orden y luego ID estable;
- `OBAC_PuenteNomina` es proyección mínima privada;
- exportador nunca deja celda OBAC vacía.

## Pruebas

| Verificación | Resultado |
|---|---|
| Reglas puras Node | 83/83 PASS |
| Integridad funciones frontend/backend | 71 definidas, PASS |
| Sintaxis `.gs` | 11 archivos, PASS |
| Sintaxis `.js/.mjs` | PASS |
| `git diff --check` | PASS |
| Preview sin `google.script.run`/SpreadsheetApp/URL Apps Script | PASS |
| Responsive 320/360/375/390/430 | PASS, sin overflow horizontal |
| Flujo formativo vista previa | PASS, confirmación segregada |
| Apps Script/Sheets QA | PASS: carga real, banner QA, libro privado, calendario conectado, inscripción formativa persistida y asistencia ausente |
| Concurrencia real/último cupo | NO VERIFICADO |
| Releases misma URL QA | PASS: actualizaciones sucesivas hasta `@8` conservaron el deployment canónico |
| Producción v61 | PASS: shell, configuración y calendario real cargaron con estado `Conectado` |

Casos cubiertos: payload maquinista/operativo falsificado, `Activo=Si + Aspirante`, identidad ausente/duplicada/inactiva, corte inclusivo, posterior al corte, reintegro, ODD pendiente, inhabilitación, alias pendiente, maquinista, fuente ausente/desactualizada, postulante no dotación y OBAC pendiente visible.

## Compatibilidad

- `Guardias!A:I`: sin cambio de contrato.
- `Guardias | Compartir!A:G`: código no modificado; prueba contra libro real NO VERIFICADA.
- `IMPORTRANGE A6:G250`: no modificado; capacidad y spill NO VERIFICADOS.
- hojas heredadas/ocultas: no se tocaron.
- `Oficial de Semana`: lógica independiente conservada.

## Drive y permisos

Se creó un libro QA exclusivamente sintético y se leyó su ACL después de importarlo:

- QA sintético: solo `user:owner`; no existe permiso `anyone`;
- producción: esquema y configuración inspeccionados; sin remediación ni cambios de ACL;
- se modificó el proyecto Apps Script y su deployment canónico; el libro de datos no fue reestructurado;
- respaldo previo v59 y versión activa v61 permiten reversión inmediata del deployment.

## Issue de tag

El issue público #3 continúa abierto. Localmente `v1.1.0` todavía contiene las dos rutas indicadas por el issue. No se movió el tag ni se reescribió historia. Requiere autorización separada.

## Archivos relevantes

- Seguridad/dominio: `src/Reglas.gs`, `src/Db.gs`, `src/Seguridad.gs`, `src/Postulantes.gs`, `src/Obac.gs`.
- Casos de uso: `src/Código.js`, `src/Exportar.js`, `src/Guardias.gs`.
- UI/vista previa: `src/Index.html`, `docs/preview/index.html`.
- Config/CI: `src/Config.gs`, `.github/workflows/ci.yml`, `tools/check-gs-syntax.mjs`, `tools/prueba-carga.mjs`.
- Documentación: auditoría, diseño, modelo y runbook en `docs/`.

## QA ejecutada

1. Se creó un proyecto Apps Script QA y un libro nativo de Sheets con datos exclusivamente ficticios.
2. Se configuraron `ENVIRONMENT`, `SHEET_ID`, `WEB_APP_URL`, ancla OBAC y frescura; el ID de hoja no coincide con producción.
3. Se verificó el libro QA como privado (`user:owner`) y con Asistencia desactivada (`Config C8 = 0`).
4. Se publicaron las versiones 3 a 8 sobre el mismo deployment canónico, sin cambiar la URL.
5. El smoke test confirmó banner QA, interfaz simplificada, flujo formativo sin selector/cupos OP-MQ, ausencia de Asistencia y persistencia E2E de una guardia sintética `GUARDIA_FORMATIVA`.
6. El lector de Config se endureció para fechas nativas, ISO y civiles después de probar una importación real.

## Seguimientos posteriores al despliegue

- completar correo y nivel en `Voluntarios` para eliminar gradualmente el adaptador histórico;
- cargar los correos de postulantes autorizados: los seis aspirantes existentes no poseen correo en el padrón y no se asociaron por nombre;
- habilitaciones OBAC individuales y ancla estable confirmadas;
- ACL de Drive remediadas o riesgo aceptado explícitamente;
- autorización administrativa probada con cuentas reales en QA;
- panel de Ayudantía, validación de cumplimiento y reemplazos completos;
- pruebas E2E/Sheets, concurrencia, correo sink, exportación e integración;
- configurar `ADMIN_EMAILS` una vez confirmado qué cuenta debe administrar los RPC protegidos.
