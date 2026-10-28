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
