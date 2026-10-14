# Transportes Calderón — frontend (Next.js 15)

Proyecto base: autenticación con Supabase, sesión, permisos por rol, menú lateral dinámico y barra superior.
Todavía no incluye módulos de negocio: las 58 entradas del menú muestran "Módulo en construcción"
(con la verificación de permisos ya aplicada).

## Requisitos

- Node.js 20.18 o superior.
- La base de datos instalada en Supabase con los dos scripts (`01_esquema_completo.sql` y `02_conexion_api.sql`),
  los esquemas expuestos en Data API, el hook `seg.fn_custom_access_token` activo y al menos un usuario vinculado
  con `seg.fn_vincular_usuario`.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # completar URL y anon key (Project Settings → API)
npm run dev                     # http://localhost:3000
```

En Supabase → **Authentication → URL Configuration**, agregar `http://localhost:3000/auth/callback`
(y la URL de producción) en **Redirect URLs**, para que funcione la recuperación de contraseña.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run lint` | ESLint (incluye la regla que impide usar service_role desde módulos y páginas) |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Pruebas de la matriz de permisos, navegación y claims |
| `npm run gen:types` | Regenera `database.generated.ts` desde el proyecto Supabase (requiere `npx supabase login`) |

## Estructura

```text
src/
├─ middleware.ts                       # refresco de sesión + guardia ruta → pantalla (capa 1)
├─ app/
│  ├─ layout.tsx                       # <html>, QueryProvider
│  ├─ page.tsx                         # redirige a la primera pantalla del rol
│  ├─ (auth)/                          # login, recuperar, sin-acceso, auth/callback
│  ├─ (app)/layout.tsx                 # sesión → SessionProvider → AppShell (Sidebar + Topbar)
│  ├─ (app)/inicio/                    # dashboard (marcador)
│  ├─ (app)/perfil/                    # cambiar contraseña
│  ├─ (app)/[...ruta]/                 # marcador de módulos pendientes, con permiso verificado
│  └─ api/health/
├─ modules/core/
│  ├─ auth/                            # claims del JWT, sesión (React.cache), guards, server actions, Zod
│  ├─ permissions/                     # roles, matriz §16, resolver, <Can>, useCan
│  ├─ navigation/                      # menú §3 (11 grupos, 58 entradas), filtro por permisos
│  ├─ session/                         # SessionProvider (datos serializables, sin tokens)
│  └─ layout/                          # AppShell, Sidebar, Topbar, aviso de moneda base
├─ server/
│  ├─ supabase/                        # clientes server, middleware y admin (solo scripts)
│  ├─ actions/                         # ActionResult y createAction (permiso + Zod + errores)
│  └─ errors/                          # traducción de SQLSTATE a mensajes de negocio
└─ shared/
   ├─ supabase/browser.ts              # cliente del navegador (React Query)
   ├─ query/                           # QueryClient, provider, tiempos de frescura
   ├─ types/                           # tipos de la base (regenerables)
   ├─ ui/campo.tsx                     # campo de formulario accesible
   └─ lib/                             # env, cn
```

## Cómo funcionan los permisos

1. Al iniciar sesión, el hook de Supabase agrega al token `usuario_id`, `roles_app` y `rol_bd`.
2. `permisosDe(roles)` traduce la matriz de la especificación (§16) en un mapa por pantalla:
   `ver`, `editar` y `transicionar`, cada uno con alcance `todo` o `propio` (chofer).
3. El permiso se controla en cuatro lugares con la misma matriz: middleware (URL), layout (menú),
   `createAction` (server actions) y `<Can>` / `useCan` (botones). La base de datos aplica la quinta barrera.
4. Para agregar un módulo: crear su carpeta en `src/app/(app)/<grupo>/<pantalla>` (reemplaza al marcador)
   y llamar `requirePermiso('<pantalla>:ver')` al principio de la página.

## Pendiente para próximas etapas

- Módulos de negocio, dashboard con indicadores, buscador global y notificaciones (hoy deshabilitados).
- Acceso del rol chofer (requiere la migración de RLS por chofer) y app móvil.
- MFA obligatorio para TI, Auditor, Finanzas y RR. HH. (se activa en Supabase Auth).
