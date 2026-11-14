# Modelo de datos V2 y migración segura

## Contrato legado preservado

`Guardias!A:I` permanece como:

`Timestamp | Nombre | Email | Cargo | Guardia 01 | Guardia 02 | Guardia 03 | Guardia 04 | Nivel`

No se agrega `postulante` a `Cargo`. La vista `Guardias | Compartir` y el contrato A:G no se modifican en esta rama.

## Tablas técnicas nuevas

### `Postulantes_Autorizados`

`persona_id | email | nombre_presentacion | condicion_institucional | estado | requiere_supervisor`

Contiene solo datos mínimos. `condicion_institucional` debe ser exactamente `POSTULANTE` y `estado` exactamente `AUTORIZADO` para programar. No contiene expediente, RUT, teléfono ni antecedentes.

### `ActividadesFormativas`

`evento_id | creado_en | persona_id | nombre_presentacion | fecha | tipo_actividad | estado_programacion | estado_cumplimiento | requiere_supervisor | validado_por | validado_en`

`tipo_actividad` queda fijado por el servidor a `GUARDIA_FORMATIVA`. No es una elección del postulante ni representa una citación; registra el cumplimiento mensual formativo sin incorporarlo a la dotación operativa.

`evento_id` es determinista por persona, fecha y tipo; impide duplicados activos. Programación y cumplimiento son dimensiones separadas.

### `OBAC_Habilitaciones` (contrato objetivo)

`persona_id | estado | origen | vigente_desde | vigente_hasta | es_reintegrado | fundamento | validado_por | validado_en | observacion`

### `OBAC_PuenteNomina`

`persona_id | nombre_presentacion | email_guardias | identidad_estado | orden | activo | vigente | es_reintegrado | odd_pendiente | fuente_timestamp`

Es una proyección mínima autorizada, no una copia de la nómina. El adapter exige `OBAC_ANCHOR_PERSON_ID` y rechaza la fuente cuando supera `OBAC_SOURCE_MAX_AGE_HOURS` (24 h por defecto).

### `OBAC_Asignaciones` (contrato objetivo)

`fecha | persona_id | estado | regla_version | fuente_timestamp | origen | motivo | revisado_por | revisado_en`

## Migración

1. Ejecutar dry run en copia QA de estructura.
2. Crear tablas nuevas sin tocar `Guardias!A:I`.
3. Cargar únicamente identidades verificadas y datos mínimos.
4. Comparar conteos y producir discrepancias, sin emparejar por nombre aproximado.
5. Probar idempotencia y rollback eliminando solo tablas QA creadas para la prueba.
6. Verificar A:G desde fila 6 y el `IMPORTRANGE` consumidor en copia QA.
7. No ejecutar en libros reales hasta aprobación y respaldo privado.

## Matriz de roles

| Condición | Guardia operativa | Maquinista | Cupo O/P | OBAC | Guardia formativa |
|---|---:|---:|---:|---:|---:|
| Voluntario activo inicial | Sí, autorizado | solo habilitación | No | solo habilitación OBAC | N/A |
| Voluntario operativo/profesional | Sí, nivel acreditado | solo habilitación | Sí | solo habilitación OBAC | N/A |
| Postulante | No | No | No | No | Sí, autorizado y supervisado |
| Aspirante/Brigadier/Pendiente | No automático | No | No | No | requiere definición/validación |
