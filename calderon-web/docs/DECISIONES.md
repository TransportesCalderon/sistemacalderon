# Decisiones congeladas

Congeladas el 28/10/2026. Antes de proponer un cambio de arquitectura o de pantallas, leer esto.
Lo que está acá no se discute en cada tarea: se cambia solo como dice el final.

## Arquitectura

1. **Toda validación vive en la base.** Las funciones de Postgres validan y devuelven el error; la web lo muestra
   tal cual (`shared/ui/errores.tsx`). No se reinterpretan errores ni se duplican reglas en el frontend.
2. **Colores y umbrales los decide la base** (nivel verde, naranja o rojo; estado del motor). La web solo pinta,
   con los mapas de `shared/ui/niveles.ts`.
3. **Permisos de rutas en un solo lugar:** `modules/core/navigation/rutas.ts`. El menú solo dibuja. Toda página
   de `app/(app)` llama a `requirePermiso` o `requireSession` (lo controla `tests/rutas.test.ts`).
4. **Recargas después de guardar en un solo lugar:** `shared/query/invalidar.ts`. Ninguna pantalla llama
   a `invalidateQueries` directamente.
5. **Funciones nuevas detrás de la versión de la base:** `useBaseTiene(n)`. Cada migración desde la 114
   actualiza `web.version_base`. Primero se aplica el SQL, después se sube la web.
6. **Migraciones:** con guarda al inicio, `SECURITY DEFINER` con `search_path` fijo, parches con
   `pg_get_functiondef` que fallan si no aplican, permisos explícitos y `NOTIFY pgrst` al final.
   Cada una con su prueba que termina en «VERIFICACIÓN CORRECTA».
7. **Sin datos de ejemplo en la base.** Nada de seeds, demos ni cargas ficticias. Las pruebas usan
   transacciones que se deshacen o la copia local descartable.
8. **Claves solo en Supabase Vault.** Nunca `service_role` ni claves secretas en Vercel, en el navegador ni
   en el chat. El repositorio es privado.
9. **Sin prettier:** se edita a mano para que cada cambio se vea en la revisión.

## UX

La experiencia de uso quedó definida en la *Especificación UX definitiva* y se aplica con el
*Plan de migración UX* (8 sprints). Eso no se rediseña: se implementa.

- Sin funcionalidades ni módulos nuevos que no estén en el plan.
- Lo sencillo y fácil de usar va primero.
- Un sprint técnico (como el Sprint 0) no cambia nada de lo que se ve.

## Cómo se cambia algo congelado

Se agrega una línea abajo con fecha, qué cambia, por qué y quién lo aprobó. No se borra ni se reescribe lo
anterior. No hay excepciones silenciosas.

| Fecha | Cambio | Motivo | Aprobó |
| --- | --- | --- | --- |
| 28/10/2026 | Congelamiento inicial | Arrancar el Sprint 0 | Gerencia |
| 28/10/2026 | Sprint 1: el detalle de un camión, chofer, cliente, carga, cierre, viaje, genset, empresa, operación o factura se abre en un panel a la derecha (`?ficha=tipo:id`). Un solo panel a la vez, con rastro navegable arriba y la fila de origen resaltada. Las rutas `/x/[id]` redirigen a su lista con la ficha (temporales hasta el Sprint 8). | Ver un registro sin perder la lista; no crear una nueva forma de perderse al pasar de ficha en ficha | Gerencia |
| 28/10/2026 | Sprint 2: barra superior con Pizarra, buscador (`/` o Ctrl+K) y menú del usuario, que ahora tiene la zona horaria y la moneda base. El buscador usa `seg.fn_buscar` (migración 115), abre lo encontrado en el panel y muestra solo lo que el rol puede ver; nunca busca ni muestra documentos, RUT ni teléfonos. El panel empieza debajo de la barra. «Hoy» se suma en el Sprint 3. | Encontrar cualquier cosa escribiendo la patente, el número o el apellido | Gerencia |
| 28/10/2026 | Sprint 3: «Hoy» (`/hoy`, pantalla `inicio.hoy`) es la pantalla de inicio de todos menos el chofer. Junta Mis pendientes, las cargas observadas y las propias sin ticket (`seg.fn_lo_mio_de_hoy`, migración 116); cada renglón abre su ficha en el panel o su lista. Franja de altas (+ Carga, + Movimiento, + Operación, + Gasto) según el rol. «Hoy» con contador en la barra. Con la 116, `/inicio` y `/pendientes` redirigen a `/hoy`; «Mis pendientes» sale del menú. | Empezar el día con el trabajo propio en una lista, sin entrar y salir de pantallas | Gerencia |
| 29/10/2026 | Sprint 4: «Hoy» suma el trabajo de cada rol, leído con las funciones de sus pantallas (migración 117): Operaciones (sin confirmar, sin equipo, frío sin genset), RRHH (gastos por revisar, fondo bajo), Finanzas (por facturar, facturas vencidas, pagos que vencen, pendientes contables), Comercial (cotizaciones por vencer) y TI (cuentas sin vincular, equipos GPS sin camión, camiones sin señal). Si una lectura falla, un renglón «No se pudo leer…» muestra el mensaje de la base. Tarjetas de números en Hoy de Finanzas y Gerencia; tarjeta del tanque en Hoy de Base Mendoza. | Que cada rol empiece el día con su trabajo en una lista | Gerencia |
| 29/10/2026 | Sprint 5: la Pizarra pasa a `/pizarra` (`/flota/pizarra` redirige, temporal hasta el Sprint 8). Desde la fila se cambian el tractor y el chofer (con «asignar equipo» de Operaciones, solo si la unidad tiene operación) y el genset (instalar o retirar); el mensaje de la base se muestra tal cual. En la Pizarra, `/` es de su búsqueda y Ctrl+K del buscador. Sin migración. «Lo que sigue» por fila pasa al Sprint 6; la Pizarra filtrada por la base de la persona queda en espera porque los usuarios no tienen base cargada. | Cambiar el equipo sin salir de la Pizarra | Gerencia |
| 29/10/2026 | Sprint 6: columna «Lo que sigue» en la Pizarra (`ops.fn_pizarra_sigue`, migración 118, solo lectura): el paso que sigue de la operación (el mismo de Operaciones), «Más» con los otros pasos y volver, «Iniciar viaje» del chofer con la carga de salida en un globo, y «Continúa a…». Si la base pide un dato o no lo permite, el globo muestra su mensaje. Vista Mapa en la Pizarra (`?vista=mapa`, el mapa con el ranking de hoy). `/telemetria/mapa` y `/operacion/tractores` redirigen a la Pizarra (temporales hasta el Sprint 8); el menú pasa a «Viajes de chofer». Lo de cada tractor (iniciar viaje, chofer fijo) también queda en la ficha del camión. RRHH no ve la Pizarra: sigue viendo los viajes en «Viajes de chofer» y el chofer fijo en «Choferes de los tractores». «Asignar viaje» a un semi sin operación sigue en Logística hasta el Sprint 8. | Avanzar la operación e iniciar el viaje sin salir de la Pizarra; el mapa es la misma lista | Gerencia |
| 29/10/2026 | Sprint 7: el chofer tiene una sola pantalla, **Mi viaje** (`/mi-viaje`): tres botones (documento, gasto, foto del tablero), dos tarjetas (su fondo y lo que va a cobrar) y su carga; las secciones `?ver=gastos`, `?ver=liquidaciones` y `?ver=tablero` piden el permiso de antes. **Liquidaciones** (`/liquidaciones`) con pestañas Resumen para liquidar, Fondos de choferes (cierre del período), Tarifas y Datos legales. **Cotizaciones** (`/cotizaciones`) con pestañas Clientes y prospectos, Datos de los clientes y Tarifas; los datos de los clientes quedan como pestaña aparte (no se fusionan las dos listas) para que Operaciones los siga viendo. **Conciliación** (`/conciliacion`) reemplaza a Bancos y cajas. Las rutas viejas redirigen (temporales hasta el Sprint 8); las de imprimir, alta y edición no cambian. Sin migración. | Que el chofer use una sola pantalla y que los trabajos largos tengan su lugar fijo | Gerencia |
| 29/10/2026 | «Mapa de flota» vuelve a tener su propia dirección (`/pizarra/mapa`), su botón **Mapa** en la barra de arriba junto a Pizarra y su entrada en el menú (Viajes › Mapa de flota). Sigue siendo la vista Mapa de la Pizarra (botones Tabla \| Mapa). `/telemetria/mapa` y `/pizarra?vista=mapa` llevan ahí. | Darle al mapa la misma importancia que a la Pizarra Azul | Gerencia |
