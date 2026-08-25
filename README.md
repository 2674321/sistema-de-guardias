# Sistema de Guardias — 1Cia C.B.C

Sistema de registro y gestión de guardias de voluntarios de la 1Cia C.B.C.

## Estructura

```
data/
  registro_guardias.csv   # Respuestas del formulario (Google Sheets)
src/
  appsscript.json         # Configuración del proyecto (zona horaria, web app)
  codigo.gs               # Lógica principal: doGet, registrarGuardia, formatearHoja
  index.html              # Interfaz web del sistema
  Estadisticas.gs         # Cálculo de estadísticas diarias/mensuales
```

## Datos

- **Hoja de cálculo:** [Registro de guardias](https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/edit?usp=sharing)
- Columnas: Timestamp, Nombre, Email, Cargo, Guardia 01–04, Operativo

## Actualización de datos

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1pvDXSzGwySOPK9hDIHgGjbb4XMY7wQDk3RTC5QSPsWs/export?format=csv" -o data/registro_guardias.csv
git commit -am "Actualiza datos de guardias" && git push
```
