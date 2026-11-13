-- =============================================================================
-- IronTrack — 262 · Cambio 252 · Un solo aviso al teléfono (backlog B4)
-- -----------------------------------------------------------------------------
-- Había dos funciones iguales para dejar un aviso al teléfono (la de los pedidos de FF y la
-- de las solicitudes de carga) y un tercer lugar que lo escribía a mano (comprobante repetido).
-- Desde ahora hay una sola: ops.fn_avisar(usuarios, clave, título, cuerpo, dirección, urgente).
--   · Avisa a los usuarios activos de la lista que tengan un teléfono activo.
--   · No le avisa al que hizo la acción.
--   · No repite un aviso con la misma clave para el mismo usuario.
--   · Si el cuerpo viene vacío, usa el título. Corta el cuerpo en 300 caracteres.
-- Las siete funciones que avisaban pasan a usarla. Las dos anteriores quedan como envoltorio
-- de una línea (se borran en un cambio posterior). No se toca ops.fn_push_generar (los avisos
-- que se buscan cada tanto) ni ops.fn_enviar_push (el envío).
-- No cambia tablas ni pantallas. Lo único distinto para el usuario: el aviso de comprobante
-- repetido ya no le llega al que lo estaba cargando, si además es de Administración o Finanzas.
-- web.version_base = 262.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 261 THEN
        RAISE EXCEPTION 'Falta la migración 261 (cambio 251): aplicarla antes';
    END IF;
    IF to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 262 (un solo aviso al teléfono) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · La función única
-- -----------------------------------------------------------------------------
CREATE FUNCTION ops.fn_avisar(p_usuarios bigint[], p_clave text, p_titulo text, p_cuerpo text,
                              p_url text DEFAULT '/hoy', p_urgente boolean DEFAULT false)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    INSERT INTO ops.push_saliente (usuario_id, clave, titulo, cuerpo, url, urgente)
    SELECT DISTINCT s.usuario_id, p_clave, p_titulo, left(coalesce(nullif(p_cuerpo, ''), p_titulo), 300),
           coalesce(p_url, '/hoy'), coalesce(p_urgente, false)
      FROM ops.push_suscripcion s JOIN seg.usuario u ON u.id = s.usuario_id AND u.activo
     WHERE s.activa AND s.usuario_id = ANY (p_usuarios) AND s.usuario_id IS DISTINCT FROM aud.fn_usuario_actual()
    ON CONFLICT (usuario_id, clave) DO NOTHING
$function$;

COMMENT ON FUNCTION ops.fn_avisar(bigint[], text, text, text, text, boolean) IS
    'Migración 262: única función para dejar un aviso al teléfono. No avisa al que hace la acción ni repite la clave.';

-- Los mismos permisos que tenía la función de las solicitudes de carga
REVOKE ALL ON FUNCTION ops.fn_avisar(bigint[], text, text, text, text, boolean) FROM PUBLIC;
DO $do$
DECLARE g text; v_acl aclitem[];
BEGIN
    SELECT proacl INTO v_acl FROM pg_proc WHERE oid = 'tel.fn_avisar_pedido_carga(bigint[],text,text,text,text,boolean)'::regprocedure;
    IF v_acl IS NULL THEN
        GRANT EXECUTE ON FUNCTION ops.fn_avisar(bigint[], text, text, text, text, boolean) TO PUBLIC;
    ELSE
        FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
                   FROM aclexplode(v_acl) x WHERE x.privilege_type = 'EXECUTE' LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_avisar(bigint[], text, text, text, text, boolean) TO %s', g);
        END LOOP;
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 2 · Las funciones que avisaban pasan a la única. Se toma la versión que está en la base y
--     se cambia solo la llamada; si un texto no aparece la cantidad de veces esperada, frena.
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.fn_parchar_262(p_f regprocedure, p_anclas text[], p_nuevos text[], p_veces int[]) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE v_def text := pg_get_functiondef(p_f); i int; n int;
BEGIN
    FOR i IN 1 .. array_length(p_anclas, 1) LOOP
        n := (length(v_def) - length(replace(v_def, p_anclas[i], ''))) / length(p_anclas[i]);
        IF n <> p_veces[i] THEN
            RAISE EXCEPTION '%: se esperaba % vez/veces el texto «%» y aparece %: avisar antes de seguir', p_f, p_veces[i], p_anclas[i], n;
        END IF;
        v_def := replace(v_def, p_anclas[i], p_nuevos[i]);
    END LOOP;
    EXECUTE v_def;
END $fn$;

DO $do$
DECLARE
    v_fondo constant text := ', ''/liquidaciones/fondos?vista=pedidos'', false);';
    f regprocedure;
BEGIN
    -- Solicitudes de carga: misma firma, cambia solo el nombre
    FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE (n.nspname, p.proname) IN (('tel', 'fn_pedir_carga'), ('fue', 'fn_aprobar_solicitud_carga'), ('fue', 'fn_rechazar_solicitud_carga')) LOOP
        PERFORM pg_temp.fn_parchar_262(f, ARRAY['PERFORM tel.fn_avisar_pedido_carga('], ARRAY['PERFORM ops.fn_avisar('], ARRAY[1]);
    END LOOP;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE (n.nspname, p.proname) IN (('tel', 'fn_pedir_carga'), ('fue', 'fn_aprobar_solicitud_carga'), ('fue', 'fn_rechazar_solicitud_carga'))) <> 3 THEN
        RAISE EXCEPTION 'No se encontraron las tres funciones de las solicitudes de carga (una sola versión de cada una): avisar antes de seguir';
    END IF;

    -- Pedidos de FF: se agrega la dirección, que antes estaba fija dentro de la función vieja
    SELECT p.oid::regprocedure INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'fin' AND p.proname = 'fn_pedir_fondo';
    PERFORM pg_temp.fn_parchar_262(f,
        ARRAY['PERFORM fin.fn_avisar_fondo(', '''Pedido de FF Chofer para aprobar'', fin.fn_texto_pedido(p));'],
        ARRAY['PERFORM ops.fn_avisar(',       '''Pedido de FF Chofer para aprobar'', fin.fn_texto_pedido(p)' || v_fondo], ARRAY[1, 1]);

    SELECT p.oid::regprocedure INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'fin' AND p.proname = 'fn_resolver_pedido_fondo';
    PERFORM pg_temp.fn_parchar_262(f,
        ARRAY['PERFORM fin.fn_avisar_fondo(', '''FF Chofer aprobado: depositar'', fin.fn_texto_pedido(p));', 'fin.fn_texto_pedido(p) || '' · '' || p.motivo);'],
        ARRAY['PERFORM ops.fn_avisar(',       '''FF Chofer aprobado: depositar'', fin.fn_texto_pedido(p)' || v_fondo, 'fin.fn_texto_pedido(p) || '' · '' || p.motivo' || v_fondo],
        ARRAY[2, 1, 1]);

    SELECT p.oid::regprocedure INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'fin' AND p.proname = 'fn_depositar_pedido_fondo';
    PERFORM pg_temp.fn_parchar_262(f,
        ARRAY['PERFORM fin.fn_avisar_fondo(', '''FF Chofer depositado'', fin.fn_texto_pedido(p));'],
        ARRAY['PERFORM ops.fn_avisar(',       '''FF Chofer depositado'', fin.fn_texto_pedido(p)' || v_fondo], ARRAY[1, 1]);
END $do$;

-- Comprobante repetido: el aviso escrito a mano pasa a la función única
DO $do$
DECLARE
    f regprocedure; v_def text; a int; b int;
    v_ini constant text := 'INSERT INTO ops.push_saliente (usuario_id, clave, titulo, cuerpo, url, urgente)';
    v_fin constant text := 'ON CONFLICT (usuario_id, clave) DO NOTHING;';
    v_nuevo constant text :=
           E'-- Migración 262: aviso por la función única\n'
        || E'        PERFORM ops.fn_avisar(\n'
        || E'            ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur WHERE ur.rol_codigo IN (''rrhh'', ''finanzas'')),\n'
        || E'            ''gasto_repetido:'' || v_int, ''Comprobante repetido'',\n'
        || E'            ops.fn_nombre_chofer(v_chofer) || '' quiso cargar un comprobante que ya está en el gasto '' || o.numero\n'
        || E'                || CASE WHEN o.chofer_id <> v_chofer THEN '' de '' || ops.fn_nombre_chofer(o.chofer_id) ELSE '''' END\n'
        || E'                || '' ('' || r.regla || '')'',\n'
        || E'            ''/liquidaciones/fondos'', true);';
    v_bloque text;
BEGIN
    SELECT p.oid::regprocedure INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'fin' AND p.proname = 'fn_subir_gasto_verificado';
    v_def := pg_get_functiondef(f);
    IF (length(v_def) - length(replace(v_def, v_ini, ''))) / length(v_ini) <> 1
       OR (length(v_def) - length(replace(v_def, v_fin, ''))) / length(v_fin) <> 1 THEN
        RAISE EXCEPTION 'fin.fn_subir_gasto_verificado cambió (no tiene un solo aviso escrito a mano): avisar antes de seguir';
    END IF;
    a := position(v_ini IN v_def); b := position(v_fin IN v_def) + length(v_fin);
    v_bloque := substr(v_def, a, b - a);
    IF b <= a OR length(v_bloque) > 1200
       OR position('''gasto_repetido:'' || v_int' IN v_bloque) = 0 OR position('''/liquidaciones/fondos'', true' IN v_bloque) = 0
       OR position('rol_codigo IN (''rrhh'', ''finanzas'')' IN v_bloque) = 0
       OR position('|| '' ('' || r.regla || '')''' IN v_bloque) = 0 THEN
        RAISE EXCEPTION 'fin.fn_subir_gasto_verificado: el aviso de comprobante repetido no es el esperado: avisar antes de seguir';
    END IF;
    EXECUTE substr(v_def, 1, a - 1) || v_nuevo || substr(v_def, b);
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · Las dos funciones anteriores quedan como envoltorio (misma firma y mismos permisos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_avisar_fondo(p_usuarios bigint[], p_clave text, p_titulo text, p_cuerpo text)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 262: envoltorio de ops.fn_avisar (se borra cuando nada la nombre)
    SELECT ops.fn_avisar(p_usuarios, p_clave, p_titulo, p_cuerpo, '/liquidaciones/fondos?vista=pedidos', false)
$function$;

CREATE OR REPLACE FUNCTION tel.fn_avisar_pedido_carga(p_usuarios bigint[], p_clave text, p_titulo text, p_cuerpo text, p_url text, p_urgente boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    -- Migración 262: envoltorio de ops.fn_avisar (se borra cuando nada la nombre)
    SELECT ops.fn_avisar(p_usuarios, p_clave, p_titulo, p_cuerpo, p_url, p_urgente)
$function$;

-- -----------------------------------------------------------------------------
-- 4 · Control: nadie más llama a las anteriores ni escribe el aviso a mano
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_mal text;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_mal
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f' AND n.nspname IN ('ops', 'fin', 'fue', 'tel', 'mae', 'seg', 'ven', 'ana', 'ia', 'ref', 'aud')
       AND (   (p.prosrc LIKE '%fn_avisar_fondo(%' OR p.prosrc LIKE '%fn_avisar_pedido_carga(%')
            OR (p.prosrc LIKE '%INSERT INTO ops.push_saliente%'
                AND (n.nspname, p.proname) NOT IN (('ops', 'fn_avisar'), ('ops', 'fn_push_generar'), ('ops', 'fn_push_probar'), ('ops', 'fn_push_suscribir'))));
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'Quedaron funciones avisando por fuera de ops.fn_avisar: %: avisar antes de seguir', v_mal;
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '262' WHERE codigo = 'web.version_base' AND valor::text::int < 262;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 262 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
