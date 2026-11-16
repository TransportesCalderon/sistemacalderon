-- =============================================================================
-- IronTrack — 271 · Cambio 263 · Clientes: una sola puerta de alta (backlog A5)
-- -----------------------------------------------------------------------------
-- Un cliente nacía por tres caminos, cada uno con su propio INSERT: Comercial › Clientes (la
-- web escribía directo en la tabla), pasar un prospecto a cliente (ven.fn_hacer_cliente) y el
-- importador Redline (ops.fn_importar_redline, dos veces). Ninguno miraba si ya había un
-- cliente parecido.
-- Desde ahora hay una sola puerta: mae.fn_crear_cliente(datos, origen).
--   · Identificador fiscal: si ya hay un cliente del mismo país con el mismo número (sin
--     mirar puntos, guiones ni espacios), no deja. Siempre.
--   · Nombre: si ya hay un cliente con la misma razón social (sin mirar mayúsculas, acentos
--     ni signos), frena y dice cuál es. Se puede seguir marcando «es otro cliente»
--     (aceptar_parecidos). En la importación Redline el parecido avisa y NO frena.
--   · Devuelve el id y los avisos.
-- La función corre con los permisos de quien la llama: no le da a nadie un permiso que no
-- tuviera sobre mae.cliente. Se les da EXECUTE a los mismos roles que hoy pueden insertar.
-- No cambia tablas ni datos. web.version_base = 271.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 270 THEN
        RAISE EXCEPTION 'Falta la migración 270 (el cierre acepta la fuente «tablero»): aplicarla antes';
    END IF;
    IF to_regprocedure('mae.fn_crear_cliente(jsonb,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 271 (puerta única de alta de clientes) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · La puerta única
-- -----------------------------------------------------------------------------
CREATE FUNCTION mae.fn_crear_cliente(p_datos jsonb, p_origen text DEFAULT 'web')
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    d jsonb := coalesce(p_datos, '{}'::jsonb);
    v_codigo text := nullif(btrim(d ->> 'codigo'), '');
    v_razon text := nullif(btrim(d ->> 'razon_social'), '');
    v_fiscal text := nullif(btrim(d ->> 'identificador_fiscal'), '');
    v_pais text := upper(nullif(btrim(d ->> 'pais'), ''));
    v_moneda text := upper(nullif(btrim(d ->> 'moneda_facturacion'), ''));
    v_aceptar boolean := coalesce((d ->> 'aceptar_parecidos')::boolean, false);
    v_fantasia text := nullif(btrim(d ->> 'nombre_fantasia'), '');
    v_norm text; v_fnorm text; v_otro text; v_avisos text[] := '{}'; v_id bigint;
BEGIN
    IF p_origen IS NULL OR p_origen NOT IN ('web', 'prospecto', 'redline') THEN
        RAISE EXCEPTION 'Origen del alta desconocido: %', p_origen USING ERRCODE = '22023';
    END IF;
    IF v_codigo IS NULL THEN RAISE EXCEPTION 'Falta el código del cliente' USING ERRCODE = '23502'; END IF;
    IF v_razon IS NULL THEN RAISE EXCEPTION 'Falta la razón social del cliente' USING ERRCODE = '23502'; END IF;
    IF v_fiscal IS NULL THEN RAISE EXCEPTION 'Falta el CUIT, RUT o identificador fiscal del cliente' USING ERRCODE = '23502'; END IF;
    IF v_pais IS NULL THEN RAISE EXCEPTION 'Falta el país del cliente' USING ERRCODE = '23502'; END IF;
    IF v_moneda IS NULL THEN RAISE EXCEPTION 'Falta la moneda de facturación del cliente' USING ERRCODE = '23502'; END IF;

    SELECT c.razon_social INTO v_otro FROM mae.cliente c WHERE c.codigo = v_codigo AND c.eliminado_en IS NULL LIMIT 1;
    IF v_otro IS NOT NULL THEN
        RAISE EXCEPTION 'Ya hay un cliente con el código %: %', v_codigo, v_otro USING ERRCODE = '23505';
    END IF;

    -- Identificador fiscal: mismo país y mismo número sin mirar puntos, guiones ni espacios. Siempre frena.
    v_fnorm := regexp_replace(upper(v_fiscal), '[^A-Z0-9]', '', 'g');
    SELECT c.razon_social || ' (' || c.codigo || ')' INTO v_otro FROM mae.cliente c
     WHERE c.eliminado_en IS NULL AND c.pais = v_pais AND v_fnorm <> ''
       AND regexp_replace(upper(c.identificador_fiscal), '[^A-Z0-9]', '', 'g') = v_fnorm
     ORDER BY c.id LIMIT 1;
    IF v_otro IS NOT NULL THEN
        RAISE EXCEPTION 'Ya existe un cliente con ese identificador fiscal: %. No se da de alta de nuevo.', v_otro USING ERRCODE = '23505';
    END IF;

    -- Nombre: misma razón social sin mirar mayúsculas, acentos ni signos
    v_norm := regexp_replace(upper(translate(v_razon, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z0-9]+', '', 'g');
    SELECT string_agg(x.t, ', ') INTO v_otro FROM (
        SELECT c.razon_social || ' (' || c.codigo || ')' AS t FROM mae.cliente c
         WHERE c.eliminado_en IS NULL AND v_norm <> ''
           AND regexp_replace(upper(translate(c.razon_social, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z0-9]+', '', 'g') = v_norm
         ORDER BY c.id LIMIT 3) x;
    IF v_otro IS NOT NULL THEN
        IF p_origen = 'redline' OR v_aceptar THEN
            v_avisos := v_avisos || format('Ya había un cliente con ese nombre: %s', v_otro);
        ELSIF p_origen = 'prospecto' THEN
            RAISE EXCEPTION 'Ya hay un cliente con ese nombre: %. Si es el mismo, elegí «Ya es cliente» y vinculalo; si es otro, cambiale la razón social para distinguirlos.', v_otro
                USING ERRCODE = '23505';
        ELSE
            RAISE EXCEPTION 'Ya hay un cliente con ese nombre: %. Si es otro cliente, marcá «Es otro cliente» y guardá de nuevo.', v_otro
                USING ERRCODE = '23505';
        END IF;
    END IF;

    INSERT INTO mae.cliente (codigo, razon_social, identificador_fiscal, pais, moneda_facturacion, condicion_pago_dias, segmento, estado, nombre_fantasia)
    VALUES (v_codigo, v_razon, v_fiscal, v_pais, v_moneda,
            coalesce(nullif(d ->> 'condicion_pago_dias', '')::smallint, 0),
            nullif(btrim(d ->> 'segmento'), ''), coalesce(nullif(btrim(d ->> 'estado'), ''), 'activo'), v_fantasia)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'avisos', to_jsonb(v_avisos));
END $function$;

COMMENT ON FUNCTION mae.fn_crear_cliente(jsonb, text) IS
    'Migración 271: única puerta de alta de clientes (web, prospecto, Redline). Frena por identificador fiscal repetido y por nombre igual (en Redline solo avisa). Corre con los permisos de quien la llama.';

-- Permisos: los mismos roles que hoy pueden insertar en mae.cliente (ni uno más)
REVOKE ALL ON FUNCTION mae.fn_crear_cliente(jsonb, text) FROM PUBLIC;
DO $do$
DECLARE g text; n int := 0;
BEGIN
    FOR g IN SELECT DISTINCT quote_ident(pg_get_userbyid(x.grantee))
               FROM pg_class c, aclexplode(c.relacl) x
              WHERE c.oid = 'mae.cliente'::regclass AND x.privilege_type = 'INSERT' AND x.grantee <> 0 AND x.grantee <> c.relowner LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION mae.fn_crear_cliente(jsonb, text) TO %s', g);
        n := n + 1;
    END LOOP;
    -- Control (lección de ops.pizarra_espera): todo rol de la web que hoy inserta en mae.cliente tiene que poder usar la puerta
    SELECT string_agg(r.rolname, ', ') INTO g FROM pg_roles r
     WHERE (r.rolname = 'authenticated' OR r.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL))
       AND has_table_privilege(r.rolname, 'mae.cliente', 'INSERT')
       AND NOT has_function_privilege(r.rolname, 'mae.fn_crear_cliente(jsonb,text)', 'EXECUTE');
    IF g IS NOT NULL THEN
        RAISE EXCEPTION 'Estos roles insertan en mae.cliente y no quedaron con permiso sobre la puerta única: %: avisar antes de seguir', g;
    END IF;
    RAISE NOTICE 'EXECUTE de mae.fn_crear_cliente para % rol(es) que insertan en mae.cliente', n;
END $do$;

-- -----------------------------------------------------------------------------
-- 2 · Los otros dos caminos pasan por la puerta (se sacan sus INSERT)
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    v_def text; a int; b int; v_corte text; i int;
    -- función, marca de inicio, marca de fin, texto nuevo
    c text[][] := ARRAY[
      ['ven.fn_hacer_cliente',
       'INSERT INTO mae.cliente (codigo, razon_social, identificador_fiscal, pais, moneda_facturacion, condicion_pago_dias)',
       'RETURNING id INTO v_cli;',
       $n$-- Migración 271: el alta pasa por la puerta única (controla el fiscal y el nombre)
        v_cli := (mae.fn_crear_cliente(jsonb_build_object(
                     'codigo', coalesce(nullif(btrim(d ->> 'codigo'), ''), 'CL-' || lpad(e.id::text, 5, '0')),
                     'razon_social', coalesce(nullif(btrim(d ->> 'razon_social'), ''), e.nombre),
                     'identificador_fiscal', btrim(d ->> 'identificador_fiscal'), 'pais', coalesce(d ->> 'pais', e.pais),
                     'moneda_facturacion', 'USD', 'condicion_pago_dias', coalesce(nullif(d ->> 'condicion_pago_dias', '')::smallint, 30),
                     'aceptar_parecidos', d -> 'aceptar_parecidos'), 'prospecto') ->> 'id')::bigint;$n$],
      ['ops.fn_importar_redline',
       'INSERT INTO mae.cliente (codigo, razon_social, identificador_fiscal, pais, moneda_facturacion)',
       'RETURNING id INTO v_sin_cli;',
       $n$-- Migración 271: puerta única de alta
                        v_sin_cli := (mae.fn_crear_cliente(jsonb_build_object('codigo', 'RL-SIN-CLIENTE', 'razon_social', 'SIN CLIENTE (REDLINE)',
                                         'identificador_fiscal', 'REDLINE-SIN-CLIENTE', 'pais', 'AR', 'moneda_facturacion', v_moneda), 'redline') ->> 'id')::bigint;$n$],
      ['ops.fn_importar_redline',
       'INSERT INTO mae.cliente (codigo, razon_social, identificador_fiscal, pais, moneda_facturacion)',
       'RETURNING id INTO v_cli;',
       $n$-- Migración 271: puerta única de alta (en la importación el parecido avisa y no frena)
                        v_cli := (mae.fn_crear_cliente(jsonb_build_object('codigo', v_cod, 'razon_social', v_cli_nombre,
                                     'identificador_fiscal', 'REDLINE-' || coalesce(v_cli_cod, substr(md5(v_cli_nombre), 1, 8)),
                                     'pais', CASE WHEN v_cli_nombre ~ '(SPA|LTDA|LIMITADA)\M' THEN 'CL' WHEN v_cli_nombre ~ '\mPY\M' THEN 'PY' ELSE 'AR' END,
                                     'moneda_facturacion', v_moneda), 'redline') ->> 'id')::bigint;$n$]
    ];
BEGIN
    FOR i IN 1 .. array_length(c, 1) LOOP
        v_def := pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname || '.' || p.proname = c[i][1]));
        a := strpos(v_def, c[i][2]);
        IF a = 0 THEN RAISE EXCEPTION '% no es la esperada (no está el INSERT del cliente): avisar antes de seguir', c[i][1]; END IF;
        b := strpos(substr(v_def, a), c[i][3]);
        IF b = 0 THEN RAISE EXCEPTION '% no es la esperada (no se encuentra el final del INSERT): avisar antes de seguir', c[i][1]; END IF;
        v_corte := substr(v_def, a, b - 1 + length(c[i][3]));
        IF length(v_corte) > 700 OR v_corte NOT LIKE '%VALUES (%' OR (length(v_corte) - length(replace(v_corte, 'INSERT INTO', ''))) / 11 <> 1 OR v_corte LIKE '%;%;%' THEN
            RAISE EXCEPTION '%: el INSERT del cliente no es el esperado: avisar antes de seguir', c[i][1];
        END IF;
        EXECUTE left(v_def, a - 1) || c[i][4] || substr(v_def, a + length(v_corte));
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · Control: nadie más da de alta clientes por fuera de la puerta
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v_mal text;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_mal
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f' AND p.prosrc ~* 'insert\s+into\s+mae\.cliente\M' AND (n.nspname, p.proname) <> ('mae', 'fn_crear_cliente');
    IF v_mal IS NOT NULL THEN
        RAISE EXCEPTION 'Quedaron funciones dando de alta clientes por fuera de la puerta única: %: avisar antes de seguir', v_mal;
    END IF;
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE (n.nspname, p.proname) IN (('ven', 'fn_hacer_cliente'), ('ops', 'fn_importar_redline')) AND p.prosrc LIKE '%mae.fn_crear_cliente(%') <> 2 THEN
        RAISE EXCEPTION 'ven.fn_hacer_cliente u ops.fn_importar_redline no quedaron llamando a la puerta única: avisar antes de seguir';
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '271' WHERE codigo = 'web.version_base' AND valor::text::int < 271;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 271 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(pg_get_userbyid(x.grantee), ', ') FROM pg_proc p, aclexplode(p.proacl) x
         WHERE p.oid = 'mae.fn_crear_cliente(jsonb,text)'::regprocedure AND x.privilege_type = 'EXECUTE' AND x.grantee <> p.proowner) AS roles_que_pueden_usarla;
