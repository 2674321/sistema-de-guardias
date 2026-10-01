# Política de seguridad

Este repositorio contiene código fuente y documentación, no datos operativos reales.

## Reporte responsable

Si detectas una vulnerabilidad, exposición de datos, credenciales, identificadores sensibles o una configuración insegura, evita abrir un issue público con detalles explotables. Contacta al mantenedor del repositorio por un canal privado disponible en su perfil de GitHub.

## Datos que no deben versionarse

- datos personales, clínicos u operativos reales;
- RUT, teléfonos, correos, domicilios o antecedentes sensibles;
- exportaciones de Google Sheets, respaldos y archivos de trabajo reales;
- credenciales, tokens, cookies, archivos de servicio o secretos;
- `.clasp.json` y `.clasprc.json` asociados al entorno real;
- archivos `.env` o equivalentes.

Las demos, fixtures y capturas públicas deben usar únicamente datos sintéticos o anonimizados de forma irreversible.

## Alcance

Los identificadores o configuraciones que hayan existido en el historial Git deben tratarse separadamente del saneamiento del branch actual. Reescribir historial requiere una revisión específica antes de ejecutarse.
