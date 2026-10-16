# Proyecto completo calderon-web (18/10/2026 · migraciones 26 y 27)

Este zip trae el proyecto **entero**: Camiones, Choferes, Clientes y Combustible
(Cargas, Movimientos del camión, Viajes, Cierres con acta para firmar) y los Tanques del camión en Flota
(en el alta del camión, en Editar camión, en la ficha y la columna Capacidad de la lista).
No hace falta ningún zip anterior.

**Orden:** primero aplicar la migración 27 en Supabase (zip `migracion_27.zip`; la 26 ya la tenés) y después subir
este proyecto. Si se sube antes, la sección Tanques de la ficha del camión muestra un error hasta aplicar la migración.

El rol **TI** ahora puede hacer todo en las pantallas de negocio (salvo Auditoría). Después de subirlo, cerrá sesión
y volvé a entrar.

**Esta vez no hay que borrar nada**: solo se agregan archivos nuevos y se reemplazan algunos. La lista de abajo
es la de la vez anterior; si ya la borraste, saltá el paso 2.
No incluye claves: las variables siguen configuradas en Vercel como hasta ahora.

## Cómo subirlo a GitHub (desde la página web)

1. Descomprimí el zip en tu computadora. Queda una carpeta `calderon-web`.
2. En GitHub, en tu repositorio, **borrá estas carpetas viejas** si existen
   (entrá a cada archivo → ícono de los tres puntos o tachito → Delete file → Commit):
   - todo lo que esté dentro de `src/app/(app)/combustible/cierres/nuevo/`
   - todo lo que esté dentro de `src/app/(app)/combustible/cierres/[id]/editar/`
   - cualquier archivo cuyo nombre empiece con `cierre-viaje.` (dentro de `src/modules/combustible/` y `tests/`)
   - `src/modules/combustible/components/cierres/cierre-asistente.tsx`, `cierre-editar.tsx`,
     `cierre-planilla.tsx` y `campos-manuales.tsx`
   - **nuevo:** todo lo que esté dentro de `src/app/(app)/combustible/mochilas/` y de
     `src/modules/combustible/components/mochilas/`
   - **nuevo:** `src/modules/combustible/domain/mochila.types.ts`, `mochila.schemas.ts`,
     `src/modules/combustible/repositories/mochila.repository.ts`, `services/mochila.service.ts`,
     `actions/mochila.actions.ts`
   Si no existen, no pasa nada.
3. Volvé a la página principal del repositorio → **Add file → Upload files**.
4. Abrí la carpeta `calderon-web` del zip, **seleccioná todo lo que hay adentro**
   (`src`, `tests`, `package.json`, etc.; no la carpeta `calderon-web` en sí) y arrastralo a GitHub.
   Si tu repositorio tiene el proyecto dentro de una subcarpeta, entrá primero a esa subcarpeta en GitHub.
5. Abajo tocá **Commit changes**. Vercel despliega solo (2 a 3 minutos).

Nota: GitHub no sube archivos que empiezan con punto si los arrastrás desde algunas computadoras
(`.gitignore`, `.env.example`). No importa: ya los tenés en el repositorio.

## Qué NO hacer

- No subas ningún archivo `.env.local` ni claves.
- En Supabase solo hace falta la migración 27 (ver `migracion_27.zip`).
