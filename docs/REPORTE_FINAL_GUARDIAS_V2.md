# Reporte de avance verificable — Guardias 2.0

Fecha: 2026-11-14  
Rama: `codex/guardias-v2-redesign`  
HEAD inicial: `201f0acd3b88e5dc038d25e4ccab2c0de4c3e59c`  
HEAD funcional auditado: `d55cf31`  
Commits locales: `fb0c0ab`, `d55cf31`  

> **Producción NO fue alterada.** No se ejecutaron `clasp push/version/deploy`, escrituras en Drive/Sheets, cambios de permisos, correos reales, movimientos de tags ni `git push`.

## Resumen ejecutivo

La rama implementa una base V2 segura y revisable: autorización server-side de rol/nivel, separación de postulantes, motor OBAC determinista, exportación con pendiente explícito, configuración por ambiente, endurecimiento de RPC y una interfaz institucional responsive con demo sintética.

No se declara lista para producción. Faltan acceso autorizado a copias QA de los dos libros, reconciliación real 60/47, inventario de deployments/ACL, pruebas Apps Script y dos publicaciones sobre el mismo deployment QA.

## Estado por fase

| Fase | Estado | Evidencia / pendiente |
|---|---|---|
| F0 Auditoría | IMPLEMENTADO local | auditoría, riesgos, flujo, issue #3 y baseline; Drive/deployments NO VERIFICADOS |
| F1 Seguridad/entornos | IMPLEMENTADO local, PROBADO parcialmente | rol server-side, Script Properties, RPC de sesión/admin, OTP, `ALLOWALL` retirado; falta Apps Script QA |
| F2 Design system/UI | IMPLEMENTADO y PROBADO local | demo escritorio/móvil; 320/360/375/390/430 sin overflow |
| F3 Inscripción/consulta/bajas | PARCIAL | inscripción endurecida, consulta ligada a sesión, baja OTP preservada; reemplazos y cancelación individual pendientes |
| F4 Postulantes | IMPLEMENTADO local, PROBADO sintético | tablas separadas, identidad/autorización, actividad no dotación; cumplimiento administrativo pendiente |
| F5 Identidad/OBAC | IMPLEMENTADO como motor + adapter | puente mínimo, ancla por propiedad, frescura, reintegros/ODD/alias fail-closed; datos reales NO VERIFICADOS |
| F6 Exportador | IMPLEMENTADO local | OBAC asignado o `PENDIENTE DE ASIGNACIÓN`; prueba real de hoja pendiente |
| F7 Panel/admin/ACL | PARCIAL | RPC críticas protegidas; panel V2 y remediación ACL pendientes de autorización |
| F8 QA URL estable | PENDIENTE | no existe inventario autenticado ni permiso de publicación |
| F9 Paquete PROD | PENDIENTE | bloqueado por QA, ACL e integración real |

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
- ambiente sin configurar bloquea el botón de registro; QA/demo muestran banner persistente.

### Postulantes

- `Postulantes_Autorizados` guarda solo identidad mínima y autorización;
- `ActividadesFormativas` separa programación de cumplimiento;
- no escribe `postulante` en `Guardias!A:I`, no asigna nivel/rol, no cuenta cupos y no entra en OBAC/ranking;
- idempotencia por `persona_id|fecha|tipo_actividad`;
- actividad requiere sesión coincidente y condición exacta `POSTULANTE/AUTORIZADO`.

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
| Reglas puras Node | 82/82 PASS |
| Integridad funciones frontend/backend | 71 definidas, PASS |
| Sintaxis `.gs` | 11 archivos, PASS |
| Sintaxis `.js/.mjs` | PASS |
| `git diff --check` | PASS |
| Demo sin `google.script.run`/SpreadsheetApp/URL Apps Script | PASS |
| Responsive 320/360/375/390/430 | PASS, sin overflow horizontal |
| Flujo formativo demo | PASS, confirmación segregada |
| Apps Script/Sheets QA | NO VERIFICADO |
| Concurrencia real/último cupo | NO VERIFICADO |
| Dos releases misma URL QA | NO VERIFICADO |

Casos cubiertos: payload maquinista/operativo falsificado, `Activo=Si + Aspirante`, identidad ausente/duplicada/inactiva, corte inclusivo, posterior al corte, reintegro, ODD pendiente, inhabilitación, alias pendiente, maquinista, fuente ausente/desactualizada, postulante no dotación y OBAC pendiente visible.

## Compatibilidad

- `Guardias!A:I`: sin cambio de contrato.
- `Guardias | Compartir!A:G`: código no modificado; prueba contra libro real NO VERIFICADA.
- `IMPORTRANGE A6:G250`: no modificado; capacidad y spill NO VERIFICADOS.
- hojas heredadas/ocultas: no se tocaron.
- `Oficial de Semana`: lógica independiente conservada.

## Drive y permisos

Los antecedentes V2 señalan `anyone:writer/reader`, pero esta ejecución no tuvo conector autorizado. Por ello:

- estado actual: **NO VERIFICADO**;
- no se afirma filtración ni remediación;
- no se modificaron ACL, carpetas, originales ni respaldos;
- antes de producción se requiere matriz actor/rol, simulación, reversión, aprobación, cambio gradual y readback.

## Issue de tag

El issue público #3 continúa abierto. Localmente `v1.1.0` todavía contiene las dos rutas indicadas por el issue. No se movió el tag ni se reescribió historia. Requiere autorización separada.

## Archivos relevantes

- Seguridad/dominio: `src/Reglas.gs`, `src/Db.gs`, `src/Seguridad.gs`, `src/Postulantes.gs`, `src/Obac.gs`.
- Casos de uso: `src/Código.js`, `src/Exportar.js`, `src/Guardias.gs`.
- UI/demo: `src/Index.html`, `docs/demo/index.html`.
- Config/CI: `src/Config.gs`, `.github/workflows/ci.yml`, `tools/check-gs-syntax.mjs`, `tools/prueba-carga.mjs`.
- Documentación: auditoría, diseño, modelo y runbook en `docs/`.

## Puesta en QA (requiere autorización)

1. Crear o confirmar proyecto Apps Script y libro QA sintético separados.
2. Configurar todas las Script Properties; comprobar que `SHEET_ID` no coincide con producción.
3. Crear estructuras QA para `Voluntarios`, postulantes y puente OBAC con identidades ficticias.
4. Ejecutar 82 pruebas locales y pruebas de entorno Apps Script.
5. Inventariar deployments; seleccionar el deployment QA canónico existente.
6. `clasp push` solo al proyecto QA autorizado, crear versión y actualizar ese deployment por ID.
7. Verificar misma URL `/exec`, banner QA, escritura solo QA y correo sink.
8. Repetir una segunda versión sobre el mismo deployment y comparar URL exacta.
9. Probar copia QA del contrato A:G/IMPORTRANGE y calendario exportado.
10. Documentar rollback a la versión anterior.

## Bloqueos antes de producción

- reconciliación real de esquemas e identidades 60/47 y 32/33;
- habilitaciones OBAC individuales y ancla estable confirmadas;
- ACL de Drive remediadas o riesgo aceptado explícitamente;
- autorización administrativa probada con cuentas reales en QA;
- panel de Ayudantía, validación de cumplimiento y reemplazos completos;
- pruebas E2E/Sheets, concurrencia, correo sink, exportación e integración;
- dos releases QA con URL idéntica;
- aprobación formal del propietario.

