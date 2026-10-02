# AGENTS.md — Sistema de Guardias (1ra Cía CBC, Coquimbo)

## Flujo de trabajo (dev process — activo)
- Modo **TDEV (proceso dev)**: tras cada iteración terminada y validada, ejecutar automáticamente:
  1. `clasp push` (sube `src/` completo)
  2. crear versión con `clasp version "<descripción>"` y actualizar el deployment live de la Web App:
     - deployment: `AKfycbxZyIlFLu7kj0kJlJsksV9D9Zy4tATlTtCQW-zYTqvYLeL1mmGK4jAx_2VWzfEmDfZ0` (URL `https://script.google.com/macros/s/AKfycbxZyIlFLu7kj0kJlJsksV9D9Zy4tATlTtCQW-zYTqvYLeL1mmGK4jAx_2VWzfEmDfZ0/exec`)
     - `clasp deploy -i <deploymentId> -V <nuevaVersión> -d "<descripción>"`
  3. verificar respuesta HTTP 200 del `/exec`
  4. `git add -A && git commit -m "<mensaje descriptivo>" && git push`
- No es necesario mantener una versión estable: el deploy/commit/push son automáticos.

## Verificación local (antes de desplegar)
- Tests puros: `node tools/local-tests/run_tests.mjs` (suite `pruebasPuras()`, solo Reglas.gs + Exportar.js + Tests.gs)
- Funciones de la Web App: `node tools/check-funciones.mjs`
- `node --check` no acepta `.gs` en Node 18; la sintaxis queda validada por el runner vía `new Function`.

## Arquitectura clave
- Fuente única del calendario: guardias explícitas en hoja `GuardiasProgramadas` (`obtenerGuardias()`), fechas SIEMPRE cívicas (`Date.UTC`), inmunes a DST.
- El botón "Guardias" genera una **Google Sheet formateada** (no PDF) en carpeta Drive `Calendario de Guardias`, replicando `python-formato-calendario-de-guardias/Formato_calendario_guardia_xlsx.py`.
- Separación DATOS vs PRESENTACIÓN: los builders puros de `Exportar.js` (`_modeloHojaGuardias` y helpers `_*Desde`) son testeables en Node.