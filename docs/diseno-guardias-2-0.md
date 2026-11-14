# Sistema de diseño y UX — Guardias 2.0

## Dirección

Producto institucional de operación diaria: sobrio, táctico sin estética militar, legible y explícito sobre estados. El color refuerza significado; nunca sustituye texto.

## Tokens principales

| Token | Valor | Uso |
|---|---|---|
| Azul petróleo | `#122B3A` | navegación, encabezados, selección principal |
| Azul profundo | `#163548` | superficies oscuras y jerarquía |
| Blanco cálido | `#F7F9FA` | fondo de aplicación |
| Gris pizarra | `#5D6A73` | texto secundario |
| Rojo institucional | `#B7423C` | identidad y error/alerta relevante |
| Ámbar funcional | `#C09248` | revisión, pendiente y foco contextual |
| Verde validación | `#267965` | éxito confirmado |

Radio base `10px`; sombras discretas; tipografía Archivo/DM Mono con fallbacks de sistema. En un despliegue con requisito offline se deben autohospedar o eliminar las fuentes remotas.

## Arquitectura de información

- Cabecera: identidad, ambiente y estado de conexión.
- Navegación: Inscripción, Disponibilidad, Mi baja y Asistencia.
- Inscripción: identidad → tipo de participación → condición/actividad → fechas → resumen → resultado.
- Calendario: disponibilidad y requisitos operativos expresados por texto, cifras e iconografía.
- Postulante: variante explícita de actividad formativa, nunca un cargo operativo.

## Estados

| Estado | Presentación requerida |
|---|---|
| Cargando/sincronizando | progreso visible y `aria-live` |
| Guardando | botón bloqueado, texto persistente |
| Guardado | confirmación específica del objeto persistido |
| Error | explicación y valores conservados |
| Requiere validación | ámbar + siguiente acción Ayudantía |
| QA/demo | banner permanente, no dependiente de scroll |
| Sin configuración | escritura bloqueada |
| OBAC pendiente | texto `PENDIENTE DE ASIGNACIÓN`, no celda vacía |

## Semántica de participación

`Voluntario habilitado` muestra nivel y rol por fecha. `Postulante` oculta controles operativos, muestra tipo de actividad y usa el resumen `Actividad formativa · no dotación`. El cambio de vista no altera el modelo histórico `Guardias!A:I`.

## Accesibilidad y responsive

- labels programáticos, `aria-pressed`, `aria-live`, foco visible y navegación por teclado;
- controles táctiles de al menos 44 px cuando el layout lo permite;
- `prefers-reduced-motion` existente;
- prueba visual a 320, 360, 375, 390 y 430 px: sin overflow horizontal;
- escritorio verificado en viewport por defecto del navegador de QA local;
- la elección de estado no depende solo del color.

## Fuente única demo/producto

La estructura visual se mantiene equivalente en `src/Index.html` y `docs/demo/index.html`; la demo sustituye únicamente el adapter RPC por datos ficticios. Como mejora siguiente se debe automatizar la generación de la demo desde una plantilla común para impedir deriva manual.

