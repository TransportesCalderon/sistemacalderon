# Transportes Calderón — frontend (Next.js 15)

Proyecto base: autenticación con Supabase, sesión, permisos por rol, menú lateral dinámico y barra superior.
Módulos de negocio implementados: **Flota > Camiones**, **Flota > Choferes**, **Comercial > Clientes** y el flujo operativo de **Combustible** (Cargas → Mochilas y controles → Viajes → Cierres de viaje). El resto de las entradas del menú muestran
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
│  ├─ navigation/                      # menú §3 (11 grupos, 59 entradas), filtro por permisos
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

## Módulo Combustible: flujo operativo

Cargas → Fronteras → Controles de mochila → Viajes → Cierres. Permite llegar a un cierre aprobado sin escribir SQL.
Fuente de verdad: migraciones 22 a 25 (en particular `24_cierre_viaje_depositos.sql` y `25_ajuste_saldo_deposito.sql`).

**Reglas del frontend**

- Toda validación vive en la base. El navegador solo valida la forma (campo vacío, número mal escrito).
- Los errores de la base (`P0001`, `55000`, `42501`, `23514`, `55P03`, `P0002`…) se muestran tal cual (`<ErrorBase>`), sin reinterpretar.
- El navegador no calcula litros, diferencias, tolerancias ni límites de viaje: los lee de `fue.v_viaje`,
  `fue.v_saldo_deposito`, `fue.fn_resultado_cierre` (borrador, en vivo) y las columnas congeladas (aprobado).
- Después de cualquier escritura se vuelve a leer todo `['combustible']` (viajes, saldos y resultados dependen de los hechos).

| Ruta | Pantalla | Permiso |
| --- | --- | --- |
| `/combustible/cargas` | Lista: fecha, camión, destino, frontera (inicia / termina viaje según `v_viaje`), situación normal / anulación pendiente / anulada | `combustible.cargas` |
| `/combustible/cargas/nueva` | Alta: tractor (tanque lleno, frontera) o mochila (parada, mismo ticket). `?camion=` y `?reemplaza=` | `cargas:editar` |
| `/combustible/cargas/[id]` | Ficha: parada, carga suelta (confirmar aparte), solicitar / aprobar / rechazar / retirar anulación | ver / editar / transicionar |
| `/combustible/mochilas` | Camiones con uso de mochila, mochila vigente, saldo de libro y último control | `combustible.depositos` |
| `/combustible/mochilas/[camionId]` | Uso de mochila, historial de vigencias, puesta en marcha y cierre de vigencia (TI), controles (inicial / de frontera / intermedio) con alta y reemplazo | ver / editar / transicionar |
| `/combustible/viajes` | `fue.v_viaje` directo: camión, frontera inicial y final, situación; "Crear borrador" o abrir el cierre | `combustible.cierre_viaje` |
| `/combustible/cierres` | Lista de cierres (número, camión, responsable, fechas, diferencias, imputable, estado) | `combustible.cierre_viaje` |
| `/combustible/cierres/[id]` | Identificación, Tractor, Mochila, Resultado, Verificación; Guardar borrador, Actualizar límites, Aprobar, Anular | ver / editar / transicionar |

**Arquitectura** (`src/modules/combustible/`)

```
domain/        comun.ts, carga.*, mochila.*, viaje.types.ts, cierre.types.ts, cierre.resultado.ts (solo lectura de JSON), cierre.schemas.ts
repositories/  carga, mochila, viaje, cierre, catalogo-combustible  (PostgREST: tablas, vistas y fue.fn_*)
services/      carga, mochila (puesta en marcha reanudable), cierre
actions/       server actions con createAction (permiso + esquema + revalidación)
queries/       keys.ts (combustibleQueries), hooks.ts (lecturas y useEscritura), precarga.ts (servidor)
components/    comun/ (Chip, ErrorBase, AccionConMotivo, Paginador…), cargas/, mochilas/, viajes/, cierres/
```

**Notas**

- La puesta en marcha y el cierre de vigencia de una mochila requieren `tc_admin` en la base (solo TI). Son tres
  escrituras (uso, mochila, control inicial) que PostgREST no agrupa: si una falla, repetir continúa donde quedó.
- `fue.v_viaje` no considera los cierres anulados: el viaje de un cierre anulado vuelve a figurar "Sin cierre"
  y se puede crear un borrador nuevo (desde Viajes o desde la ficha del cierre anulado).
- La verificación (`fue.fn_verificar_cierre`) no es un estado: se muestra como Verificado / Con diferencias / Con avisos
  y se repite con el botón "Verificar".
- El test de alcohol es dato sensible: solo lo ven quienes editan o aprueban cierres.
- Parámetros de `fue.parametro` (traspaso, frecuencia 24 h, relevo 'avisar', tolerancias 10/10/20 L): **provisionales**,
  pendientes de confirmación de Operaciones.

**Plan por etapas**

1. Cargas: alta, frontera, parada, anulación con aprobación. ✔
2. Mochilas y controles: uso, puesta en marcha, vigencias, controles y reemplazos. ✔
3. Viajes desde `fue.v_viaje`. ✔
4. Cierres: borrador, resultado en vivo, aprobación, anulación, verificación. ✔
5. Base Mendoza (solo plan): pantalla del tanque de la base (`deposito_combustible` tipo base) con sus controles de rol
   `base`, entradas (descargas de mochila, compras) y salidas a tractores; tolerancia de base (20 L provisional).
   Reutiliza `ControlesMochila` generalizado a depósito, `v_saldo_deposito` y la fila de permisos `combustible.depositos`
   (Base Mendoza ya tiene "editar"). Sin cambios de esquema: requiere confirmar con Operaciones la frecuencia de medición del tanque.

## Pendiente para próximas etapas

- Módulos de negocio, dashboard con indicadores, buscador global y notificaciones (hoy deshabilitados).
- Acceso del rol chofer (requiere la migración de RLS por chofer) y app móvil.
- MFA obligatorio para TI, Auditor, Finanzas y RR. HH. (se activa en Supabase Auth).
