# Sistema de Guardias — 1Cia C.B.C

Sistema de registro y gestión de guardias de voluntarios de la 1Cia C.B.C.

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

## Sincronización con Apps Script

Configuración en `.clasp.json` (raíz del repo, `rootDir: src`). Ejecutar desde la raíz:

```bash
clasp pull   # Apps Script → repo
clasp push   # repo → Apps Script
```

Requiere sesión previa: `clasp login` (cuenta propietaria).

## Datos

- **Hoja de cálculo:** [Registro de guardias](https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/edit?usp=sharing)
- Columnas: Timestamp, Nombre, Email, Cargo, Guardia 01–04, Operativo

## Actualización de datos

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/export?format=csv" -o data/registro_guardias.csv
git commit -am "Actualiza datos de guardias" && git push
```
