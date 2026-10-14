# Transportes Calderón — frontend (Next.js 15)

Proyecto base: autenticación con Supabase, sesión, permisos por rol, menú lateral dinámico y barra superior.
Módulos de negocio implementados: **Flota > Camiones**, **Flota > Choferes** y **Comercial > Clientes**. El resto de las entradas del menú muestran
"Módulo en construcción" (con la verificación de permisos ya aplicada).

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

## Módulo Flota > Camiones

Sobre la tabla `mae.camion` (lista desde la vista `mae.v_camion`). Ver con el permiso `flota.camiones:ver`;
alta y edición con `flota.camiones:editar` (Operaciones y TI).

| Ruta | Pantalla |
| --- | --- |
| `/flota/camiones` | Lista con búsqueda, filtros (estado, propietario, país, combustible, eliminados), orden y paginación en la URL |
| `/flota/camiones/nuevo` | Alta (F-MAE-01) |
| `/flota/camiones/[id]` | Ficha, pestaña Datos (las demás pestañas llegan con sus módulos) |
| `/flota/camiones/[id]/editar` | Edición con control de versión; incluye la baja operativa (estado Inactivo + fecha de baja) |

```text
src/modules/flota/
├─ domain/          camion.types.ts (dominio y CHECK), camion.schemas.ts (Zod), camion.lista.ts (filtros ⇄ URL)
├─ repositories/    camion.repository.ts, catalogo-flota.repository.ts (ref.tipo_combustible, ref.pais)
├─ services/        camion.service.ts (crear, editar)
├─ actions/         camion.actions.ts (crearCamion, editarCamion)
├─ queries/         keys.ts, hooks.ts (useCamiones, useCamion, useCrearCamion, useEditarCamion), precarga.ts
└─ components/      camiones/ lista, ficha, formulario, chip de estado
```

## Módulo Flota > Choferes

Sobre la tabla `mae.chofer`. Ver con `flota.choferes:ver`; alta y edición con `flota.choferes:editar`
(Operaciones, RR. HH. y TI). La lista lee la tabla con `eliminado_en IS NULL` (Gerencia no tiene permiso sobre `v_chofer`).

| Ruta | Pantalla |
| --- | --- |
| `/flota/choferes` | Lista sin documento: búsqueda por legajo, nombre y apellido; filtros por estado, país y base |
| `/flota/choferes/nuevo` | Alta (F-MAE-03); el documento es obligatorio |
| `/flota/choferes/[id]` | Ficha, pestaña Datos; documento enmascarado con "Mostrar documento" |
| `/flota/choferes/[id]/editar` | Edición con control de versión; baja = estado Baja + fecha de egreso |

Documento (dato personal):
- Nunca se lee en listas ni fichas. "Mostrar documento" (`flota.documento_chofer:ver`) registra el acceso con
  `aud.fn_registrar_acceso_sensible` y recién entonces lo lee; se oculta a los 60 s y no se guarda en caché.
- Cambiarlo en la edición requiere `flota.documento_chofer:editar` (RR. HH.); se escribe sin leer el anterior.
- Se normaliza (sin puntos ni espacios) y se valida el dígito verificador de CUIL y RUT.

## Módulo Comercial > Clientes

Sobre la tabla `mae.cliente` (lista desde `mae.v_cliente`). Ver con `comercial.clientes:ver`; alta y edición con
`comercial.clientes:editar` (Operaciones y Finanzas).

| Ruta | Pantalla |
| --- | --- |
| `/comercial/clientes` | Lista: búsqueda por código, razón social o CUIT/RUT; filtros por estado, país, moneda y segmento |
| `/comercial/clientes/nuevo` | Alta (P-CLI-01); avisa clientes con nombre parecido mientras se escribe la razón social |
| `/comercial/clientes/[id]` | Ficha, pestaña Datos (Servicios, Ingresos, Rentabilidad y Auditoría llegan con sus módulos) |
| `/comercial/clientes/[id]/editar` | Edición con control de versión; inactivar o bloquear es un cambio de estado |

- Identificador fiscal único por país: CUIT (AR) o RUT (CL), normalizado y con dígito verificador.
- La moneda de facturación se propone según el país (`ref.pais.moneda_defecto`).
- Un cliente bloqueado no se ofrecerá al crear servicios comerciales (módulo Operación).

```text
src/modules/comercial/
├─ domain/          cliente.types.ts, cliente.schemas.ts, cliente.lista.ts, identificador-fiscal.ts
├─ repositories/    cliente.repository.ts, catalogo-comercial.repository.ts (ref.pais, ref.moneda)
├─ services/        cliente.service.ts
├─ actions/         cliente.actions.ts
├─ queries/         keys.ts, hooks.ts, precarga.ts
└─ components/      clientes/ lista, ficha, formulario, chip de estado
```

## Pendiente para próximas etapas

- Módulos de negocio, dashboard con indicadores, buscador global y notificaciones (hoy deshabilitados).
- Acceso del rol chofer (requiere la migración de RLS por chofer) y app móvil.
- MFA obligatorio para TI, Auditor, Finanzas y RR. HH. (se activa en Supabase Auth).
