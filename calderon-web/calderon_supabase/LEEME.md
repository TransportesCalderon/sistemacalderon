# Transportes Calderón — paquete para Supabase

Esquema completo (DDL definitivo) adaptado a Supabase, sin datos de prueba, más la conexión de la API
y del inicio de sesión de Supabase con el modelo.

| Archivo | Qué hace |
| --- | --- |
| `sql_editor/01_esquema_completo.sql` | Crea los 8 esquemas, 169 tablas, triggers, roles `tc_*`, particiones y catálogos de referencia |
| `sql_editor/02_conexion_api.sql` | Vincula Supabase Auth con el modelo: usuarios, roles de aplicación, hook del token y pre-request |
| `sql_editor/03_cierre_viaje.sql` | Combustible > Cierre de viaje (modelo inicial; lo reemplaza la migración 24) |
| `sql_editor/04_depositos_combustible.sql` | Combustible > Depósitos: mochila y tanque de base con saldo, libro de movimientos y controles (solo estructura, sin datos) |
| `sql_editor/05_correccion_avisos_cierre.sql` | Corrección: el cálculo del cierre ya no falla cuando tiene que mostrar avisos (viaje sin telemetría, sin km) |
| `sql_editor/06_cierre_viaje_depositos.sql` | Migración 24: cierre de viaje con depósitos (rediseño de las secciones 15 a 20). Solo estructura y parámetros provisionales |
| `sql_editor/07_ajuste_saldo_deposito.sql` | Ajuste menor de la 24 (vista de saldos y descripciones de parámetros provisionales). Sin datos; se puede ejecutar más de una vez |
| `supabase/migrations/` | Lo mismo en 18 migraciones, para la CLI de Supabase (`supabase db push`) |

## Instalación desde el panel

1. **SQL Editor** → ejecutar `01_esquema_completo.sql`.
2. **SQL Editor** → ejecutar `02_conexion_api.sql`. Si aparece el aviso
   `No se pudo configurar pgrst.db_pre_request`, ejecutar en una consulta aparte:
   `ALTER ROLE authenticator SET pgrst.db_pre_request = 'seg.fn_pre_request'; NOTIFY pgrst, 'reload config';`
3. **SQL Editor** → ejecutar `03_cierre_viaje.sql` y **después** volver a ejecutar `05_correccion_avisos_cierre.sql` (la 03 trae la versión del cálculo con el error de avisos).
3b. **SQL Editor** → ejecutar `04_depositos_combustible.sql`.
3c. **SQL Editor** → ejecutar `05_correccion_avisos_cierre.sql`.
3d. **SQL Editor** → ejecutar `06_cierre_viaje_depositos.sql` (una sola vez). Si encuentra cierres, depósitos, controles o movimientos, se cancela sin cambiar nada.
3e. **SQL Editor** → ejecutar `07_ajuste_saldo_deposito.sql`.
4. **Project Settings → Data API → Exposed schemas**: agregar `ref, mae, ops, fue, tel, ana, fin, aud, seg`.
5. **Authentication → Hooks → Customize Access Token (JWT) Claims**: elegir la función `seg.fn_custom_access_token`.
6. **Authentication → Users → Add user**: crear el usuario (email y contraseña).
7. **SQL Editor**: `SELECT seg.fn_vincular_usuario('email@empresa.com', 'Nombre', ARRAY['ti']);`
   Roles: gerencia, operaciones, base_mendoza, adm_combustible, analista_control, auditor, rrhh, finanzas, ti
   (chofer existe pero todavía no tiene acceso a datos).
8. Definir la moneda base: `UPDATE ref.moneda SET es_base = true WHERE codigo = 'USD';`
9. Mantenimiento de particiones (requiere la extensión pg_cron activa):
   `SELECT cron.schedule('particiones', '15 3 * * *', 'SELECT aud.fn_mantener_particiones()');`

## Verificaciones

```sql
-- Migración 24: tablas nuevas (vacías) y parámetros provisionales
SELECT to_regclass('fue.uso_mochila') AS uso_mochila, to_regclass('fue.solicitud_correccion') AS solicitudes,
       (SELECT count(*) FROM fue.cierre_viaje) AS cierres,
       (SELECT count(*) FROM ref.parametro WHERE codigo LIKE 'fue.cierre_%' OR codigo LIKE 'fue.base_%') AS parametros;
-- Depósitos: 3 tablas nuevas, vacías
SELECT (SELECT count(*) FROM fue.deposito_combustible) AS depositos,
       (SELECT count(*) FROM fue.movimiento_combustible) AS movimientos,
       (SELECT count(*) FROM fue.control_saldo_deposito) AS controles;
-- 169 tablas del modelo
SELECT count(*) FROM pg_tables WHERE schemaname IN ('ref','mae','ops','fue','tel','ana','fin','aud');
-- pre-request configurado
SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';
-- lo que verá el token de un usuario (reemplazar el email)
SELECT seg.fn_custom_access_token(jsonb_build_object('user_id', id, 'claims', '{"role":"authenticated"}'::jsonb)) -> 'claims'
  FROM auth.users WHERE email = 'email@empresa.com';
```

## Tener en cuenta

- No activar RLS desde el aviso del SQL Editor: los permisos van por los roles `tc_*`.
- Un cambio de roles se aplica cuando el usuario vuelve a iniciar sesión (el token dura 1 h).
- Las extensiones quedan en el esquema `extensions`; las particiones arrancan en 2025-01.
