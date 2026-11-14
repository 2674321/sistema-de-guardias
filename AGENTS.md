# AGENTS.md — Sistema de Guardias (1ra Cía CBC, Coquimbo)

## Flujo de trabajo seguro
- El trabajo ordinario se realiza en una rama y con pruebas locales/sintéticas.
- **Nunca** ejecutar automáticamente `clasp push`, crear versiones, cambiar deployments,
  escribir en hojas reales, enviar correos reales ni hacer `git push`.
- QA y producción usan proyectos, hojas y Script Properties separados.
- Cualquier publicación requiere autorización explícita del propietario, inventario previo,
  preflight, rollback y actualización del deployment existente por ID para conservar su URL.
- Los IDs de hojas, scripts, deployments y las URLs operativas no se versionan.

## Verificación local (antes de desplegar)
- Tests puros: `node tools/local-tests/run_tests.mjs` (suite `pruebasPuras()`, solo Reglas.gs + Exportar.js + Tests.gs)
- Funciones de la Web App: `node tools/check-funciones.mjs`
- `node --check` no acepta `.gs` en Node 18; la sintaxis queda validada por el runner vía `new Function`.

## Arquitectura clave
- Fuente única del calendario: guardias explícitas en hoja `GuardiasProgramadas` (`obtenerGuardias()`), fechas SIEMPRE cívicas (`Date.UTC`), inmunes a DST.
- El botón "Guardias" genera una **Google Sheet formateada** (no PDF) en carpeta Drive `Calendario de Guardias`, replicando `python-formato-calendario-de-guardias/Formato_calendario_guardia_xlsx.py`.
- Separación DATOS vs PRESENTACIÓN: los builders puros de `Exportar.js` (`_modeloHojaGuardias` y helpers `_*Desde`) son testeables en Node.
