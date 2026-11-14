# Runbook de deployments estables (borrador; no ejecutar sin autorización)

## Principio

QA y producción son proyectos y hojas separados. Cada ambiente conserva un único deployment versionado canónico. Una publicación crea una nueva versión y actualiza el deployment existente; no crea una URL nueva.

## Preflight obligatorio

1. Confirmar cuenta, proyecto y rama autorizados.
2. Ejecutar `clasp --version` y consultar `clasp help deploy`; la sintaxis depende de la versión instalada.
3. Inventariar deployments y registrar Script ID, deployment ID, versión, URL, acceso, propietario y propósito.
4. Confirmar Script Properties `ENVIRONMENT`, `SHEET_ID`, `WEB_APP_URL`, `ADMIN_EMAILS`, `OBAC_ANCHOR_PERSON_ID` y `OBAC_SOURCE_MAX_AGE_HOURS`.
5. Rechazar si QA y producción comparten Sheet ID o proyecto.
6. Ejecutar tests locales y de entorno contra datos sintéticos.
7. Preparar versión anterior y procedimiento de rollback.

## Publicación QA autorizada

1. `clasp push` al proyecto QA confirmado.
2. Crear una versión inmutable con descripción trazable.
3. Actualizar el **deployment QA existente** por su ID.
4. Verificar que el deployment ID y la URL `/exec` son idénticos antes/después.
5. Smoke test con identidad y datos ficticios; confirmar escritura solo en la hoja QA y sink de correo.
6. Repetir con una segunda versión para demostrar estabilidad de URL.

## Producción autorizada

Requiere aprobación explícita posterior a QA, revisión de riesgos P0, snapshot privado, ventana de cambio y responsable de rollback. Se actualiza el deployment productivo existente; nunca se crea uno nuevo por comodidad.

## Rollback

Editar el mismo deployment para volver a la última versión conocida como sana. Verificar URL invariable, lectura del calendario y ausencia de escrituras de prueba. No borrar ni archivar deployments durante el incidente.

## Registro mínimo de evidencia

Guardar fuera del repositorio público: timestamp, operador, Script ID abreviado, deployment ID abreviado, versión anterior/nueva, hash Git, URL comparada, Sheet ID abreviado, tests y resultado del smoke test.
