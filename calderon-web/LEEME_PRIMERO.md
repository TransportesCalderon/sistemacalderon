# Proyecto completo calderon-web (16/10/2026 · migración 26)

Este zip trae el proyecto **entero**: Camiones, Choferes, Clientes y Combustible
(Cargas, Movimientos del camión, Viajes, Cierres). No hace falta ningún zip anterior.

**Orden:** primero aplicar la migración 26 en Supabase (zip `migracion_26.zip`) y después subir este proyecto.
Si se sube el proyecto antes, las pantallas de Combustible muestran errores hasta que se aplique la migración.
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
- En Supabase solo hace falta la migración 26 (ver `migracion_26.zip`).
