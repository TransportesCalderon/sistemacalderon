# Proyecto completo calderon-web (16/10/2026)

Este zip trae el proyecto **entero**: Camiones, Choferes, Clientes y Combustible
(Cargas, Mochilas y controles, Viajes, Cierres). No hace falta ningún zip anterior.
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
- No hace falta ejecutar nada en Supabase: las migraciones 24 y 25 ya están aplicadas.
