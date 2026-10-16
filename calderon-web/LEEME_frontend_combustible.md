# Frontend Combustible — flujo operativo (Cargas → Mochilas → Viajes → Cierres)

No cambia el esquema SQL: usa lo que ya está en Supabase (migraciones 24 y 25).

## Cómo aplicarlo (paso a paso)

1. Descomprimí el zip. Adentro hay una carpeta `calderon-web/` con la misma estructura que tu proyecto.
2. Copiá su contenido encima de tu carpeta `calderon-web` (aceptá reemplazar archivos).
3. **Borrá a mano** estos 14 archivos viejos (el zip no puede borrar):
   - `src/app/(app)/combustible/cierres/[id]/editar/page.tsx`
   - `src/app/(app)/combustible/cierres/nuevo/page.tsx`
   - `src/modules/combustible/actions/cierre-viaje.actions.ts`
   - `src/modules/combustible/components/cierres/campos-manuales.tsx`
   - `src/modules/combustible/components/cierres/cierre-asistente.tsx`
   - `src/modules/combustible/components/cierres/cierre-editar.tsx`
   - `src/modules/combustible/components/cierres/cierre-planilla.tsx`
   - `src/modules/combustible/domain/cierre-viaje.calculo.ts`
   - `src/modules/combustible/domain/cierre-viaje.lista.ts`
   - `src/modules/combustible/domain/cierre-viaje.schemas.ts`
   - `src/modules/combustible/domain/cierre-viaje.types.ts`
   - `src/modules/combustible/repositories/cierre-viaje.repository.ts`
   - `src/modules/combustible/services/cierre-viaje.service.ts`
   - `tests/cierre-viaje.test.ts`

   Si te quedan carpetas vacías (`cierres/nuevo`, `cierres/[id]/editar`), borralas también.
4. En la terminal, dentro de `calderon-web`:
   ```
   npm run typecheck
   npm test
   npm run lint
   ```
   Las tres tienen que terminar sin errores.
5. Subí los cambios a GitHub (repositorio privado). Vercel despliega solo. No hace falta agregar variables nuevas.

## Archivos
Nuevos (41):
- src/app/(app)/combustible/cargas/[id]/page.tsx
- src/app/(app)/combustible/cargas/nueva/page.tsx
- src/app/(app)/combustible/cargas/page.tsx
- src/app/(app)/combustible/mochilas/[camionId]/page.tsx
- src/app/(app)/combustible/mochilas/page.tsx
- src/app/(app)/combustible/viajes/page.tsx
- src/modules/combustible/actions/carga.actions.ts
- src/modules/combustible/actions/cierre.actions.ts
- src/modules/combustible/actions/mochila.actions.ts
- src/modules/combustible/components/cargas/carga-ficha.tsx
- src/modules/combustible/components/cargas/carga-form.tsx
- src/modules/combustible/components/cargas/cargas-lista.tsx
- src/modules/combustible/components/cargas/chips-carga.tsx
- src/modules/combustible/components/cierres/borrador-form.tsx
- src/modules/combustible/components/comun/filtros.ts
- src/modules/combustible/components/comun/ui.tsx
- src/modules/combustible/components/mochilas/controles-mochila.tsx
- src/modules/combustible/components/mochilas/mochila-camion.tsx
- src/modules/combustible/components/mochilas/mochilas-lista.tsx
- src/modules/combustible/components/mochilas/puesta-en-marcha-form.tsx
- src/modules/combustible/components/mochilas/selector-parada.tsx
- src/modules/combustible/components/viajes/viajes-lista.tsx
- src/modules/combustible/domain/carga.lista.ts
- src/modules/combustible/domain/carga.schemas.ts
- src/modules/combustible/domain/carga.types.ts
- src/modules/combustible/domain/cierre.resultado.ts
- src/modules/combustible/domain/cierre.schemas.ts
- src/modules/combustible/domain/cierre.types.ts
- src/modules/combustible/domain/comun.ts
- src/modules/combustible/domain/mochila.schemas.ts
- src/modules/combustible/domain/mochila.types.ts
- src/modules/combustible/domain/viaje.types.ts
- src/modules/combustible/repositories/carga.repository.ts
- src/modules/combustible/repositories/catalogo-combustible.repository.ts
- src/modules/combustible/repositories/cierre.repository.ts
- src/modules/combustible/repositories/mochila.repository.ts
- src/modules/combustible/repositories/viaje.repository.ts
- src/modules/combustible/services/carga.service.ts
- src/modules/combustible/services/cierre.service.ts
- src/modules/combustible/services/mochila.service.ts
- tests/combustible.test.ts

Modificados (16):
- src/app/(app)/combustible/cierres/[id]/page.tsx
- src/app/(app)/combustible/cierres/page.tsx
- src/modules/combustible/components/cierres/cierre-ficha.tsx
- src/modules/combustible/components/cierres/cierres-lista.tsx
- src/modules/combustible/components/cierres/estado-cierre.tsx
- src/modules/combustible/queries/hooks.ts
- src/modules/combustible/queries/keys.ts
- src/modules/combustible/queries/precarga.ts
- src/modules/core/navigation/navigation.ts
- src/modules/core/permissions/matriz.ts
- src/server/errors/traducir.ts
- src/shared/lib/fechas.ts
- src/shared/types/database.generated.ts
- src/shared/types/dominio.ts
- tests/permisos.test.ts
- README.md

## Qué hay que saber

- **Poner en marcha una mochila y cerrar su vigencia lo hace solo TI**: la base exige el rol `tc_admin`.
  El resto (cargas, uso de mochila, controles, borradores) lo hace Adm. de combustible / Base Mendoza según la matriz.
- **Un cierre anulado libera su viaje**: en Viajes vuelve a decir "Sin cierre" y se puede crear un borrador nuevo.
- La **Verificación** no es un estado del cierre: es un resultado (Verificado / Con diferencias / Con avisos) que se repite con el botón "Verificar".
- Los mensajes de error que ves en pantalla son los de la base, sin cambios.
- Los parámetros (tolerancias 10/10/20 L, frecuencia 24 h, relevo 'avisar') siguen siendo **provisionales**.
