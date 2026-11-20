-- =============================================================================
-- IronTrack — 288 · Usuario de cliente: ve en el mapa solo los camiones que llevan su carga
-- -----------------------------------------------------------------------------
-- Pedido del usuario (20/11/2026): un usuario especial para los clientes que necesitan revisar el seguimiento satelital
-- de nuestros camiones. Solo el mapa, con las unidades que llevan su carga, y con información estrictamente limitada.
-- Decisiones del usuario:
--   · Un usuario = un cliente (TI lo elige al crear el usuario).
--   · Ve la posición (con la hora del último dato del GPS), el chofer, el tractor, el semirremolque y, además, el
--     contenedor y su referencia, para saber qué carga lleva cada camión.
--   · El camión aparece solo cuando su carga está retirada (Operaciones la marcó «Retirado» o cualquier paso posterior) y
--     desaparece cuando está entregada (o cancelada). Todo sale de ops.fn_operaciones: el mismo estado que muestra la
--     pantalla de Operaciones.
--   · Relevo: si la carga quedó en una base o en la aduana esperando otro tractor, ve el semirremolque en ese lugar, sin
--     chofer ni tractor, hasta que lo engancha el próximo.
--   · Las operaciones de transportistas externos no aparecen (no tenemos su GPS).
-- Qué hace:
--   1. Rol de base tc_cliente: no lee ninguna tabla y solo entra al esquema public, donde ejecuta sus tres funciones:
--      public.fn_mapa_cliente() y lo de la contraseña provisoria (public.fn_cliente_debo_cambiar_clave(),
--      public.fn_cliente_clave_cambiada()). Pueden pasar a él los mismos que pasan a tc_chofer (authenticator).
--      seg.fn_pre_request lo acepta.
--   2. Rol de la aplicación «cliente» (rol de base tc_cliente, prioridad 0) y seg.usuario.cliente_id.
--      Regla (al confirmar): el rol Cliente va solo y con su cliente elegido.
--   3. TI lo crea o lo edita en Ajustes › Usuarios: seg.fn_guardar_usuario_cliente(...); qué cliente tiene cada usuario:
--      seg.fn_usuarios_clientes(); los clientes para elegir: seg.fn_clientes_para_usuario().
--   4. ops.fn_mapa_de_cliente(cliente): lo que ve ese cliente (sin permisos: la usa public.fn_mapa_cliente() y la
--      verificación 332).
--   5. Archivos (Storage): Storage entra a la base como «authenticated» sin pasar por seg.fn_pre_request, así que se
--      agrega una regla restrictiva en storage.objects: con rol de base tc_cliente en el token no lee ni sube ningún
--      archivo. A los demás usuarios no les cambia nada. Si el editor de SQL no puede crearla, sigue y la 332 avisa.
-- Toca seg.fn_pre_request (solo agrega tc_cliente a la lista de roles de base) y la regla de seg.rol_aplicacion.rol_bd.
-- web.version_base = 288.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 287 THEN
        RAISE EXCEPTION 'Falta la migración 287 (llegada a la estación): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'seg' AND table_name = 'usuario' AND column_name = 'cliente_id') THEN
        RAISE EXCEPTION 'La migración 288 (usuario de cliente) ya está aplicada';
    END IF;
    IF to_regprocedure('ops.fn_operaciones(date,date)') IS NULL OR to_regprocedure('seg.fn_pre_request()') IS NULL
       OR to_regprocedure('seg.fn_crear_usuario(text,text,text[],boolean,bigint,text)') IS NULL
       OR to_regprocedure('seg.fn_guardar_usuario(text,text,text[],boolean,bigint)') IS NULL
       OR to_regprocedure('seg.fn_usuarios()') IS NULL OR to_regprocedure('seg.fn_exigir_ti()') IS NULL
       OR to_regprocedure('seg.fn_debo_cambiar_clave()') IS NULL OR to_regprocedure('seg.fn_clave_cambiada()') IS NULL
       OR to_regprocedure('aud.fn_usuario_actual()') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones que esta migración necesita (operaciones, usuarios o contraseña provisoria)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mae' AND table_name = 'cliente' AND column_name = 'nombre_fantasia') THEN
        RAISE EXCEPTION 'Falta mae.cliente.nombre_fantasia (migración de la ficha del cliente): aplicarla antes';
    END IF;
    -- Las columnas de ops.fn_operaciones que usa el mapa del cliente
    IF EXISTS (SELECT 1 FROM unnest(ARRAY['servicio_id','cliente_id','estado_logistica','tramo_id','tramo_estado','paso','camion_id',
                                          'tractor','semi','chofer_id','contenedor','referencia_cliente','hitos']) c
                WHERE c <> ALL ((SELECT proargnames FROM pg_proc WHERE oid = 'ops.fn_operaciones(date,date)'::regprocedure)::text[])) THEN
        RAISE EXCEPTION 'ops.fn_operaciones cambió (le faltan columnas que usa el mapa del cliente): no se aplicó nada';
    END IF;
END $do$;

-- Copia los permisos de ejecución de una función a otra
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
               FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = p_de AND x.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_a, g);
    END LOOP;
    IF (SELECT proacl FROM pg_proc WHERE oid = p_de) IS NULL THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', p_a);
    END IF;
END $fn$;

-- 1 · Rol de base tc_cliente -----------------------------------------------------------
DO $do$
DECLARE r record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_cliente') THEN
        CREATE ROLE tc_cliente NOLOGIN;
    END IF;
    -- Los que pueden pasar a tc_chofer (en Supabase, authenticator) también pueden pasar a tc_cliente
    FOR r IN SELECT m.rolname FROM pg_auth_members am JOIN pg_roles g ON g.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
              WHERE g.rolname = 'tc_chofer' AND m.rolname <> 'tc_cliente' LOOP
        EXECUTE format('GRANT tc_cliente TO %I', r.rolname);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        EXECUTE 'GRANT tc_cliente TO authenticator';
    END IF;
END $do$;
COMMENT ON ROLE tc_cliente IS 'Migración 288: usuario de un cliente. No lee tablas; solo ejecuta sus tres funciones de public (mapa y contraseña).';
-- Solo el esquema public: ahí están sus tres funciones y nada más que pueda usar
GRANT USAGE ON SCHEMA public TO tc_cliente;

-- seg.fn_pre_request: tc_cliente pasa a la lista de roles de base permitidos (no se toca nada más)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('seg.fn_pre_request()'::regprocedure);
    v_patron text := $p$IN\s*\(\s*'tc_admin'\s*,\s*'tc_app'\s*,\s*'tc_lectura'\s*,\s*'tc_auditor'\s*,\s*'tc_chofer'\s*\)$p$;
    v_n integer;
BEGIN
    IF v_def ~ '''tc_cliente''' THEN RETURN; END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_patron, 'g');
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'seg.fn_pre_request cambió: la lista de roles de base aparece % veces (se esperaba 1). No se aplicó nada', v_n;
    END IF;
    EXECUTE regexp_replace(v_def, v_patron, $r$IN ('tc_admin','tc_app','tc_lectura','tc_auditor','tc_chofer','tc_cliente')$r$);
END $do$;

-- 2 · Rol de la aplicación «cliente» y de qué cliente es cada usuario ---------------------------
DO $do$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'seg.rol_aplicacion'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~ 'tc_chofer' LOOP
        EXECUTE format('ALTER TABLE seg.rol_aplicacion DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $do$;
ALTER TABLE seg.rol_aplicacion ADD CONSTRAINT ck_rol_app_rol_bd
    CHECK (rol_bd IS NULL OR rol_bd = ANY (ARRAY['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor', 'tc_chofer', 'tc_cliente']));
INSERT INTO seg.rol_aplicacion (codigo, nombre, rol_bd, prioridad, descripcion)
VALUES ('cliente', 'Cliente', 'tc_cliente', 0, 'Migración 288: usuario de un cliente. Solo ve en el mapa los camiones que llevan su carga.');

ALTER TABLE seg.usuario ADD COLUMN cliente_id bigint REFERENCES mae.cliente (id);
CREATE INDEX ix_usuario_cliente ON seg.usuario (cliente_id) WHERE cliente_id IS NOT NULL;
COMMENT ON COLUMN seg.usuario.cliente_id IS 'Migración 288: con el rol Cliente, de qué cliente es (ve en el mapa los camiones con su carga).';

-- Regla, al confirmar: el rol Cliente va solo y con su cliente elegido
CREATE FUNCTION seg.fn_regla_usuario_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $f$
BEGIN
    IF EXISTS (SELECT 1 FROM seg.usuario_rol r WHERE r.usuario_id = NEW.usuario_id AND r.rol_codigo = 'cliente') THEN
        IF EXISTS (SELECT 1 FROM seg.usuario_rol r WHERE r.usuario_id = NEW.usuario_id AND r.rol_codigo <> 'cliente') THEN
            RAISE EXCEPTION 'El rol Cliente va solo: un usuario de cliente no puede tener otros roles' USING ERRCODE = '23514';
        END IF;
        IF (SELECT u.cliente_id FROM seg.usuario u WHERE u.id = NEW.usuario_id) IS NULL THEN
            RAISE EXCEPTION 'Elegí de qué cliente es el usuario (marcá «Es un usuario de un cliente»)' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION seg.fn_regla_usuario_cliente() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER tg_80_usuario_cliente
    AFTER INSERT OR UPDATE ON seg.usuario_rol
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION seg.fn_regla_usuario_cliente();

-- 3 · Alta y edición (solo TI) ---------------------------------------------------------------
CREATE FUNCTION seg.fn_guardar_usuario_cliente(p_email text, p_nombre text, p_cliente bigint, p_activo boolean DEFAULT true,
                                               p_nuevo boolean DEFAULT false, p_clave text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_id bigint;
BEGIN
    PERFORM seg.fn_exigir_ti();
    IF p_cliente IS NULL THEN RAISE EXCEPTION 'Elegí de qué cliente es el usuario' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM mae.cliente c WHERE c.id = p_cliente AND c.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El cliente elegido no existe' USING ERRCODE = 'P0002';
    END IF;
    -- Las funciones de siempre crean la cuenta, controlan el email y dejan solo el rol Cliente
    IF coalesce(p_nuevo, false) THEN
        v_id := seg.fn_crear_usuario(p_email, p_nombre, ARRAY['cliente'], coalesce(p_activo, true), NULL, p_clave);
    ELSE
        v_id := seg.fn_guardar_usuario(p_email, p_nombre, ARRAY['cliente'], coalesce(p_activo, true), NULL);
    END IF;
    UPDATE seg.usuario SET cliente_id = p_cliente WHERE id = v_id AND cliente_id IS DISTINCT FROM p_cliente;
    RETURN v_id;
END $f$;
COMMENT ON FUNCTION seg.fn_guardar_usuario_cliente(text, text, bigint, boolean, boolean, text) IS
    'Migración 288: crea (p_nuevo) o guarda un usuario de cliente: solo el rol Cliente y de qué cliente es. Solo TI.';
SELECT pg_temp.fn_copiar_permisos('seg.fn_crear_usuario(text,text,text[],boolean,bigint,text)',
                                  'seg.fn_guardar_usuario_cliente(text,text,bigint,boolean,boolean,text)');

CREATE FUNCTION seg.fn_usuarios_clientes()
RETURNS TABLE (usuario_id bigint, cliente_id bigint, cliente text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $f$
BEGIN
    PERFORM seg.fn_exigir_ti();
    RETURN QUERY
        SELECT u.id, u.cliente_id, coalesce(nullif(btrim(c.nombre_fantasia), ''), c.razon_social)
          FROM seg.usuario u JOIN mae.cliente c ON c.id = u.cliente_id
         WHERE EXISTS (SELECT 1 FROM seg.usuario_rol r WHERE r.usuario_id = u.id AND r.rol_codigo = 'cliente')
         ORDER BY u.id;
END $f$;
COMMENT ON FUNCTION seg.fn_usuarios_clientes() IS 'Migración 288: de qué cliente es cada usuario con el rol Cliente. Solo TI.';
SELECT pg_temp.fn_copiar_permisos('seg.fn_usuarios()', 'seg.fn_usuarios_clientes()');

CREATE FUNCTION seg.fn_clientes_para_usuario()
RETURNS TABLE (id bigint, nombre text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $f$
BEGIN
    PERFORM seg.fn_exigir_ti();
    RETURN QUERY
        SELECT c.id, coalesce(nullif(btrim(c.nombre_fantasia), ''), c.razon_social)
          FROM mae.cliente c
         WHERE c.eliminado_en IS NULL
         ORDER BY 2;
END $f$;
COMMENT ON FUNCTION seg.fn_clientes_para_usuario() IS 'Migración 288: los clientes que se pueden elegir para un usuario de cliente. Solo TI.';
SELECT pg_temp.fn_copiar_permisos('seg.fn_usuarios()', 'seg.fn_clientes_para_usuario()');

-- 4 · Lo que ve el cliente ----------------------------------------------------------------
-- Una fila por operación del cliente con la carga retirada y sin entregar, hecha con camión propio (con tramo).
-- Retirada = el estado de Operaciones es «Retirado» o un paso posterior; una demora cuenta solo si ya hubo retiro o carga.
-- Con el tramo cerrado (relevo en una base o en la aduana): el semi en ese lugar, sin tractor ni chofer.
CREATE FUNCTION ops.fn_mapa_de_cliente(p_cliente bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH o AS (
        SELECT o.servicio_id, o.tramo_id, o.tramo_estado, o.camion_id, o.tractor, o.semi, o.chofer_id, o.contenedor, o.referencia_cliente
          FROM ops.fn_operaciones(DATE '2999-12-31', NULL) o
         WHERE o.cliente_id = p_cliente
           AND o.tramo_id IS NOT NULL AND o.camion_id IS NOT NULL
           AND (o.estado_logistica IN ('retirado', 'posicionado', 'aduana', 'frontera', 'en_transito', 'hacia_puerto', 'descargando', 'en_base')
                OR (o.estado_logistica = 'demorado'
                    AND (o.paso IN ('cargando', 'en_viaje', 'descargando')
                         OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.hitos) h
                                     WHERE h ->> 'tipo' IN ('retiro_contenedor', 'carga', 'entrada_aduana', 'liberacion_aduana',
                                                            'ingreso_frontera', 'liberacion_frontera')))))
    ), u AS (
        SELECT o.*, o.tramo_estado = 'cerrado' AS en_base, b.latitud AS b_lat, b.longitud AS b_lng, b.nombre AS b_nombre, b.ts AS b_ts
          FROM o
          LEFT JOIN LATERAL (
              SELECT coalesce(ub.latitud, ud.latitud) AS latitud, coalesce(ub.longitud, ud.longitud) AS longitud,
                     coalesce(ub.nombre, ud.nombre) AS nombre, coalesce(rr.ts, t.fin_real) AS ts
                FROM ops.tramo_operativo t
                LEFT JOIN ops.relevo_tractor rr ON rr.tramo_anterior_id = t.id AND rr.eliminado_en IS NULL
                LEFT JOIN mae.ubicacion ub ON ub.id = rr.base_id
                LEFT JOIN mae.ubicacion ud ON ud.id = t.destino_id
               WHERE t.id = o.tramo_id
               LIMIT 1) b ON o.tramo_estado = 'cerrado'
    )
    SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'tractor' NULLS LAST, x ->> 'semi'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
                   'id', u.servicio_id,
                   'tractor', CASE WHEN u.en_base THEN NULL ELSE u.tractor END,
                   'semi', u.semi,
                   'chofer', CASE WHEN u.en_base THEN NULL
                                  ELSE (SELECT btrim(ch.nombre || ' ' || ch.apellido) FROM mae.chofer ch WHERE ch.id = u.chofer_id) END,
                   'contenedor', u.contenedor,
                   'referencia', u.referencia_cliente,
                   'en_base', u.en_base,
                   'lugar', CASE WHEN u.en_base THEN u.b_nombre END,
                   'lat', CASE WHEN u.en_base THEN u.b_lat ELSE p.latitud END,
                   'lng', CASE WHEN u.en_base THEN u.b_lng ELSE p.longitud END,
                   'ts', CASE WHEN u.en_base THEN u.b_ts ELSE p.ts END) AS x
          FROM u
          LEFT JOIN LATERAL (
              SELECT l.latitud, l.longitud, l.ts FROM tel.lectura l
               WHERE l.camion_id = u.camion_id AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL AND coalesce(l.calidad, 1) > 0
               ORDER BY l.ts DESC LIMIT 1) p ON NOT u.en_base
      ) s
$f$;
COMMENT ON FUNCTION ops.fn_mapa_de_cliente(bigint) IS
    'Migración 288: lo que ve un cliente en su mapa (camiones con su carga retirada y sin entregar). Sin permisos: la usan public.fn_mapa_cliente() y la verificación 332.';
REVOKE ALL ON FUNCTION ops.fn_mapa_de_cliente(bigint) FROM PUBLIC;

-- La que llama la web del cliente: el cliente sale del usuario, nunca de un parámetro
CREATE FUNCTION public.fn_mapa_cliente()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_cli bigint; v_nombre text;
BEGIN
    SELECT u.cliente_id INTO v_cli
      FROM seg.usuario u
     WHERE u.id = aud.fn_usuario_actual() AND u.activo
       AND EXISTS (SELECT 1 FROM seg.usuario_rol r WHERE r.usuario_id = u.id AND r.rol_codigo = 'cliente');
    IF v_cli IS NULL THEN
        RAISE EXCEPTION 'Tu usuario no tiene un cliente asignado: avisale a quien te dio el acceso' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(nullif(btrim(c.nombre_fantasia), ''), c.razon_social) INTO v_nombre FROM mae.cliente c WHERE c.id = v_cli;
    RETURN jsonb_build_object('cliente', v_nombre, 'consultado', now(), 'unidades', ops.fn_mapa_de_cliente(v_cli));
END $f$;
COMMENT ON FUNCTION public.fn_mapa_cliente() IS 'Migración 288: el mapa del usuario de cliente (solo tc_cliente).';
REVOKE ALL ON FUNCTION public.fn_mapa_cliente() FROM PUBLIC;
DO $do$
BEGIN
    -- En Supabase lo nuevo de public queda con permiso para anon y authenticated: se saca
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.fn_mapa_cliente() FROM anon';
        EXECUTE 'REVOKE ALL ON FUNCTION ops.fn_mapa_de_cliente(bigint) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.fn_mapa_cliente() FROM authenticated';
        EXECUTE 'REVOKE ALL ON FUNCTION ops.fn_mapa_de_cliente(bigint) FROM authenticated';
    END IF;
END $do$;
GRANT EXECUTE ON FUNCTION public.fn_mapa_cliente() TO tc_cliente;

-- La contraseña provisoria del cliente (las mismas de siempre, sin abrirle el esquema seg)
CREATE FUNCTION public.fn_cliente_debo_cambiar_clave()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT seg.fn_debo_cambiar_clave() $f$;
CREATE FUNCTION public.fn_cliente_clave_cambiada()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT seg.fn_clave_cambiada() $f$;
COMMENT ON FUNCTION public.fn_cliente_debo_cambiar_clave() IS 'Migración 288: si el usuario de cliente tiene que elegir su contraseña (seg.fn_debo_cambiar_clave).';
COMMENT ON FUNCTION public.fn_cliente_clave_cambiada() IS 'Migración 288: el usuario de cliente ya eligió su contraseña (seg.fn_clave_cambiada).';
DO $do$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public.fn_cliente_debo_cambiar_clave()', 'public.fn_cliente_clave_cambiada()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f); END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f); END IF;
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO tc_cliente', f);
    END LOOP;
END $do$;

-- 5 · Archivos (Storage): el usuario de un cliente no lee ni sube nada ----------------------------------------
DO $do$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RAISE NOTICE 'Sin storage.objects: se saltea la regla de archivos';
        RETURN;
    END IF;
    EXECUTE $p$CREATE POLICY "288 sin archivos para usuarios de clientes" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
                USING (coalesce((SELECT auth.jwt()) ->> 'rol_bd', '') <> 'tc_cliente')
                WITH CHECK (coalesce((SELECT auth.jwt()) ->> 'rol_bd', '') <> 'tc_cliente')$p$;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No se pudo crear la regla de archivos para usuarios de clientes (permisos): la verificación 332 lo marca';
END $do$;

UPDATE ref.parametro SET valor = '288' WHERE codigo = 'web.version_base' AND valor::text::int < 288;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 288 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
