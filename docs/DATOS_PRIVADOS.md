# Política de datos privados

Este repositorio público debe contener solamente **código, documentación y datos de demostración sintéticos**.

## Prohibido versionar

- bases de datos o planillas con información real;
- datos clínicos, personales, administrativos u operativos identificables;
- RUT, teléfonos, correos, direcciones o identificadores institucionales de personas;
- respaldos, exportaciones, reportes o PDFs generados desde datos reales;
- credenciales, tokens, cookies, archivos de servicio y configuración privada;
- archivos locales de despliegue como `.clasp.json` y `.clasprc.json`.

## Datos de prueba

Los datos de prueba deben ser inventados y no corresponder a personas reales. No basta con ocultar parcialmente un nombre o RUT si el resto del conjunto permite reidentificar a la persona.

## Antes de publicar

1. Revisar `git diff --staged`.
2. Confirmar que no se agregaron exportaciones o respaldos.
3. Ejecutar las pruebas y validaciones del proyecto.
4. Verificar que demos y capturas usen únicamente información ficticia.
5. Si hubo una exposición, no limitarse a borrar el archivo del último commit: revisar también el historial Git.
