-- =====================================================================================
-- Migración 296 · Gastos de choferes: moneda por RUT o CUIT, y falsos «comprobante repetido»
-- =====================================================================================
-- Casos (20/11/2026):
--   1) Un comprobante se marcó repetido solo porque tenía el mismo «número de operación» que otro gasto, con otro importe
--      y otro número de comprobante. Iris había tomado un código que se repite en todos los tickets del lugar (terminal,
--      caja, comercio). Ahora el número de operación solo cuenta si además el importe es el mismo (±1 %) y los números de
--      comprobante no son distintos.
--   2) Un peaje de Chile (MOP - Vialidad) se cargó en ARS. Ahora:
--      · Iris tiene la regla: RUT → CLP; CUIT → ARS.
--      · La base lo controla con el dígito verificador: si el comprobante tiene un RUT o CUIT válido, propone esa moneda
--        y no deja cargar el gasto en otra.
--      · En «Gastos por revisar» se puede cambiar la moneda de un gasto pendiente (el sistema lo reemplaza por uno nuevo
--        con la moneda correcta, porque la moneda de un gasto no se edita). Si Iris leyó un RUT o CUIT que no coincide,
--        lo sugiere.
-- No toca web.version_base: la pantalla nueva aparece con la 296 (la web pregunta si existe la función nueva).
-- =====================================================================================
BEGIN;

-- ---------------------------------------------------------------------------------
-- 1 · Moneda según el identificador fiscal (con dígito verificador)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ia.fn_moneda_por_fiscal(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v text := upper(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')); v_cuerpo text; v_dv text; s int := 0; m int := 2; i int; r int;
BEGIN
    IF v = '' THEN RETURN NULL; END IF;
    -- CUIT / CUIL argentino: 11 dígitos, prefijo conocido, verificador módulo 11 (pesos 5432765432)
    IF v ~ '^(20|23|24|25|26|27|30|33|34)\d{9}$' THEN
        FOR i IN 1..10 LOOP
            s := s + substr(v, i, 1)::int * substr('5432765432', i, 1)::int;
        END LOOP;
        r := 11 - s % 11;
        IF r = 11 THEN r := 0; END IF;
        IF r <> 10 AND r = substr(v, 11, 1)::int THEN RETURN 'ARS'; END IF;
    END IF;
    -- RUT chileno: 7 u 8 dígitos + verificador (0-9 o K), escrito con guion antes del verificador
    IF p ~ '\d[\s.]*-\s*[0-9kK]\s*$' AND v ~ '^\d{7,8}[0-9K]$' THEN
        v_cuerpo := left(v, length(v) - 1); v_dv := right(v, 1); s := 0;
        FOR i IN REVERSE length(v_cuerpo)..1 LOOP
            s := s + substr(v_cuerpo, i, 1)::int * m;
            m := CASE WHEN m = 7 THEN 2 ELSE m + 1 END;
        END LOOP;
        r := 11 - s % 11;
        IF (CASE r WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE r::text END) = v_dv THEN RETURN 'CLP'; END IF;
    END IF;
    RETURN NULL;
END $f$;
GRANT EXECUTE ON FUNCTION ia.fn_moneda_por_fiscal(text) TO PUBLIC;

-- ---------------------------------------------------------------------------------
-- 2 · Lo que se le pide a Iris (comprobantes de gasto y tickets de combustible)
-- ---------------------------------------------------------------------------------
DO $m$
DECLARE d text := pg_get_functiondef('ia.fn_instrucciones(text)'::regprocedure); n int;
    a1 text := '"moneda" (ARS, CLP, USD, BRL o PYG), "lugar"';
    b1 text := '"moneda" (ARS, CLP, USD, BRL o PYG; para decidirla mirá PRIMERO el identificador fiscal del emisor: si es un RUT de Chile '
            || '(7 u 8 dígitos, guion y un dígito o K, por ejemplo 61.202.000-0) es CLP; si es un CUIT de Argentina (11 dígitos, por ejemplo '
            || '30-71234567-1) es ARS; si no figura, guiate por el país, el símbolo, la razón social (MOP, Dirección de Vialidad, Ruta, '
            || 'Concesionaria de Chile = CLP; Vialidad Nacional, AFIP, ARCA = ARS) y la localidad; en el paso Cristo Redentor y en los demás '
            || 'pasos de frontera hay comprobantes de los dos países: no supongas), "lugar"';
    a2 text := 'es distinto del número de comprobante)';
    b2 text := 'es distinto del número de comprobante; tiene que ser propio de ESTE pago: NO pongas el número de terminal, de comercio, '
            || 'de caja, de cajero, de lote ni ningún código que se repita en todos los tickets del mismo lugar; si dudás, null)';
    a3 text := '"moneda" (ARS, CLP, USD, BRL o PYG, según el país, el símbolo o la razón social)';
    b3 text := '"moneda" (ARS, CLP, USD, BRL o PYG: si el emisor tiene RUT de Chile es CLP, si tiene CUIT de Argentina es ARS; si no, '
            || 'según el país, el símbolo o la razón social)';
BEGIN
    IF position('RUT de Chile' IN d) > 0 THEN RAISE NOTICE 'Las instrucciones de Iris ya estaban actualizadas'; RETURN; END IF;
    n := (length(d) - length(replace(d, a1, ''))) / length(a1);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré la moneda del comprobante de gasto en las instrucciones de Iris (%)', n; END IF;
    n := (length(d) - length(replace(d, a2, ''))) / length(a2);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré el número de operación en las instrucciones de Iris (%)', n; END IF;
    n := (length(d) - length(replace(d, a3, ''))) / length(a3);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré la moneda del ticket de combustible en las instrucciones de Iris (%)', n; END IF;
    EXECUTE replace(replace(replace(d, a1, b1), a2, b2), a3, b3);
END $m$;

-- ---------------------------------------------------------------------------------
-- 3 · Al leer: si hay un RUT o CUIT válido, manda la moneda de ese país
-- ---------------------------------------------------------------------------------
DO $r$
BEGIN
    IF to_regprocedure('ia.fn_normalizar_sin_moneda_fiscal(text, jsonb)') IS NULL THEN
        ALTER FUNCTION ia.fn_normalizar(text, jsonb) RENAME TO fn_normalizar_sin_moneda_fiscal;
    END IF;
END $r$;

CREATE OR REPLACE FUNCTION ia.fn_normalizar(p_tipo text, p_crudo jsonb, OUT propuesta jsonb, OUT avisos jsonb)
RETURNS record
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_mon text; v_fiscal text;
BEGIN
    SELECT x.propuesta, x.avisos INTO propuesta, avisos FROM ia.fn_normalizar_sin_moneda_fiscal(p_tipo, p_crudo) x;
    IF p_tipo IN ('comprobante_gasto', 'ticket_combustible') THEN
        v_fiscal := ia.fn_texto(p_crudo -> 'cuit_rut', 30);
        v_mon := ia.fn_moneda_por_fiscal(v_fiscal);
        IF v_mon IS NOT NULL AND (propuesta ->> 'moneda') IS DISTINCT FROM v_mon THEN
            IF (propuesta ->> 'moneda') IS NOT NULL THEN
                avisos := coalesce(avisos, '[]'::jsonb) || to_jsonb(format('Iris leyó %s, pero el comprobante tiene %s %s: se tomó %s',
                    propuesta ->> 'moneda', CASE v_mon WHEN 'CLP' THEN 'RUT de Chile' ELSE 'CUIT de Argentina' END, v_fiscal, v_mon));
            END IF;
            propuesta := coalesce(propuesta, '{}'::jsonb) || jsonb_build_object('moneda', v_mon);
        END IF;
    END IF;
END $f$;
REVOKE ALL ON FUNCTION ia.fn_normalizar(text, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------------
-- 4 · Al cargar el gasto: no se acepta otra moneda que la del RUT o CUIT del comprobante
-- ---------------------------------------------------------------------------------
DO $r$
BEGIN
    IF to_regprocedure('fin.fn_subir_gasto_verificado_sin_moneda(text, text, numeric, date, text, text, text, text, text, numeric, numeric, bigint)') IS NULL THEN
        ALTER FUNCTION fin.fn_subir_gasto_verificado(text, text, numeric, date, text, text, text, text, text, numeric, numeric, bigint)
            RENAME TO fn_subir_gasto_verificado_sin_moneda;
    END IF;
END $r$;

CREATE OR REPLACE FUNCTION fin.fn_subir_gasto_verificado(p_categoria text, p_moneda text, p_importe numeric, p_fecha date, p_comprobante text,
    p_hash text, p_nombre_archivo text, p_detalle text, p_lugar text, p_latitud numeric, p_longitud numeric, p_lectura bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_fiscal text; v_mon text;
BEGIN
    IF p_lectura IS NOT NULL THEN
        SELECT nullif(btrim(l.propuesta ->> 'cuit_rut'), '') INTO v_fiscal FROM ia.lectura l WHERE l.id = p_lectura AND l.estado = 'lista';
        v_mon := ia.fn_moneda_por_fiscal(v_fiscal);
        IF v_mon IS NOT NULL AND upper(coalesce(p_moneda, '')) <> v_mon THEN
            RAISE EXCEPTION 'El comprobante es de %: tiene % %. El gasto va en %, no en %. Cambiá la moneda y volvé a cargarlo',
                CASE v_mon WHEN 'CLP' THEN 'Chile' ELSE 'Argentina' END, CASE v_mon WHEN 'CLP' THEN 'RUT' ELSE 'CUIT' END, v_fiscal,
                v_mon, coalesce(p_moneda, '?') USING ERRCODE = '22023';
        END IF;
    END IF;
    RETURN fin.fn_subir_gasto_verificado_sin_moneda(p_categoria, p_moneda, p_importe, p_fecha, p_comprobante, p_hash, p_nombre_archivo,
                                                    p_detalle, p_lugar, p_latitud, p_longitud, p_lectura);
END $f$;
REVOKE ALL ON FUNCTION fin.fn_subir_gasto_verificado(text, text, numeric, date, text, text, text, text, text, numeric, numeric, bigint) FROM PUBLIC;
DO $g$
DECLARE r record;
BEGIN
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_subir_gasto_verificado_sin_moneda' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_subir_gasto_verificado(text, text, numeric, date, text, text, text, text, text, numeric, numeric, bigint) TO %I', r.grantee);
    END LOOP;
END $g$;

-- ---------------------------------------------------------------------------------
-- 5 · Comprobante repetido: el número de operación solo cuenta con el mismo importe y sin otro número de comprobante
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_gasto_repetido(p_excluir bigint, p_clave_comp text, p_clave_op text, p_fiscal text, p_moneda text,
    p_importe numeric, p_hashes text[], OUT gasto_id bigint, OUT regla text)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_fiscal text := nullif(regexp_replace(coalesce(p_fiscal, ''), '[^0-9kK]', '', 'g'), '');
        v_hashes text[] := array_remove(ARRAY(SELECT lower(h) FROM unnest(p_hashes) h WHERE nullif(h, '') IS NOT NULL), NULL);
BEGIN
    IF cardinality(v_hashes) > 0 THEN
        SELECT o.id INTO gasto_id FROM fin.movimiento_fondo_chofer o
         WHERE o.tipo = 'gasto' AND o.estado <> 'anulado' AND o.eliminado_en IS NULL AND o.id IS DISTINCT FROM p_excluir
           AND (o.hash_comprobante = ANY (v_hashes) OR o.hash_imagen_ia = ANY (v_hashes))
         ORDER BY o.id LIMIT 1;
        IF gasto_id IS NOT NULL THEN regla := 'la misma foto'; RETURN; END IF;
    END IF;
    IF p_clave_op IS NOT NULL THEN
        -- Migración 296: con el mismo importe y sin números de comprobante ni emisores distintos (si no, es un código del lugar)
        SELECT o.id INTO gasto_id FROM fin.movimiento_fondo_chofer o
         WHERE o.tipo = 'gasto' AND o.estado <> 'anulado' AND o.eliminado_en IS NULL AND o.id IS DISTINCT FROM p_excluir
           AND o.clave_operacion = p_clave_op AND o.moneda = p_moneda
           AND abs(o.importe - p_importe) <= greatest(o.importe * 0.01, 1)
           AND (p_clave_comp IS NULL OR o.clave_comprobante IS NULL OR o.clave_comprobante = p_clave_comp)
           AND (v_fiscal IS NULL OR nullif(regexp_replace(coalesce(o.emisor_fiscal, ''), '[^0-9kK]', '', 'g'), '') IS NULL
                OR regexp_replace(o.emisor_fiscal, '[^0-9kK]', '', 'g') = v_fiscal)
         ORDER BY o.id LIMIT 1;
        IF gasto_id IS NOT NULL THEN regla := 'el mismo número de operación'; RETURN; END IF;
    END IF;
    IF p_clave_comp IS NOT NULL THEN
        SELECT o.id INTO gasto_id FROM fin.movimiento_fondo_chofer o
         WHERE o.tipo = 'gasto' AND o.estado <> 'anulado' AND o.eliminado_en IS NULL AND o.id IS DISTINCT FROM p_excluir
           AND o.clave_comprobante = p_clave_comp AND o.moneda = p_moneda
           AND ((v_fiscal IS NOT NULL AND regexp_replace(coalesce(o.emisor_fiscal, ''), '[^0-9kK]', '', 'g') = v_fiscal)
                OR abs(o.importe - p_importe) <= greatest(o.importe * 0.01, 1))
         ORDER BY o.id LIMIT 1;
        IF gasto_id IS NOT NULL THEN regla := 'el mismo número de comprobante'; RETURN; END IF;
    END IF;
END $function$;

-- Los avisos de «repetido» que ya no lo son con la regla nueva quedan revisados solos
DO $i$
DECLARE n int;
BEGIN
    IF to_regclass('fin.intento_gasto_repetido') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'intento_gasto_repetido' AND column_name = 'revisado_en') THEN
        EXECUTE $q$
            UPDATE fin.intento_gasto_repetido i SET revisado_en = now()
              FROM fin.movimiento_fondo_chofer o
             WHERE o.id = i.original_id AND i.revisado_en IS NULL AND i.regla = 'el mismo número de operación'
               AND (abs(o.importe - i.importe) > greatest(o.importe * 0.01, 1)
                    OR (fin.fn_clave_nro(i.comprobante_nro) IS NOT NULL AND o.clave_comprobante IS NOT NULL
                        AND o.clave_comprobante <> fin.fn_clave_nro(i.comprobante_nro)))$q$;
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE NOTICE 'Avisos de repetido que no lo eran, marcados revisados: %', n;
    END IF;
END $i$;

-- ---------------------------------------------------------------------------------
-- 6 · Cambiar la moneda de un gasto pendiente (lo reemplaza: la moneda de un gasto no se edita)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_cambiar_moneda_gasto(p_gasto bigint, p_moneda text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_fondos(); m fin.movimiento_fondo_chofer%ROWTYPE; v_mon text := upper(btrim(coalesce(p_moneda, '')));
        v_id bigint; v_num text;
BEGIN
    SELECT * INTO m FROM fin.movimiento_fondo_chofer WHERE id = p_gasto AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND OR m.tipo <> 'gasto' THEN RAISE EXCEPTION 'El gasto no existe' USING ERRCODE = 'P0002'; END IF;
    IF m.estado NOT IN ('por_revisar', 'apelado') THEN
        RAISE EXCEPTION 'Solo se cambia la moneda de un gasto que todavía no se revisó' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = v_mon) THEN RAISE EXCEPTION 'Moneda desconocida: %', p_moneda USING ERRCODE = '22023'; END IF;
    IF v_mon = m.moneda THEN RAISE EXCEPTION 'El gasto ya está en %', v_mon USING ERRCODE = '22023'; END IF;

    -- El anterior queda anulado (suelta la lectura de Iris para pasarla al nuevo)
    PERFORM set_config('fin.fondo_fn', '1', true);
    UPDATE fin.movimiento_fondo_chofer
       SET estado = 'anulado', motivo = format('Se cargó en %s y era en %s: reemplazado', m.moneda, v_mon), ia_lectura_id = NULL,
           revisado_por = v_usr, revisado_en = now()
     WHERE id = m.id;

    PERFORM set_config('fin.fondo_fn', '1', true);
    INSERT INTO fin.movimiento_fondo_chofer (chofer_id, tipo, fecha, periodo, moneda, importe, estado, categoria_id, detalle, lugar,
        comprobante_uri, hash_comprobante, nombre_archivo, servicio_id, viaje_chofer_id, camion_id, latitud, longitud, cargado_por_chofer,
        apelacion, apelado_en, motivo_rechazo, ia_lectura_id, verificacion, comprobante_nro, operacion_nro, emisor, emisor_fiscal,
        clave_comprobante, clave_operacion, hash_imagen_ia)
    VALUES (m.chofer_id, m.tipo, m.fecha, m.periodo, v_mon, m.importe, m.estado, m.categoria_id, m.detalle, m.lugar,
        m.comprobante_uri, m.hash_comprobante, m.nombre_archivo, m.servicio_id, m.viaje_chofer_id, m.camion_id, m.latitud, m.longitud,
        m.cargado_por_chofer, m.apelacion, m.apelado_en, m.motivo_rechazo, m.ia_lectura_id, m.verificacion, m.comprobante_nro,
        m.operacion_nro, m.emisor, m.emisor_fiscal, m.clave_comprobante, m.clave_operacion, m.hash_imagen_ia)
    RETURNING id, numero INTO v_id, v_num;

    PERFORM set_config('fin.fondo_fn', '1', true);
    UPDATE fin.movimiento_fondo_chofer SET motivo = format('Se cargó en %s y era en %s: reemplazado por %s', m.moneda, v_mon, v_num)
     WHERE id = m.id;

    RETURN jsonb_build_object('id', v_id, 'numero', v_num, 'anterior', m.numero, 'moneda', v_mon);
END $f$;
REVOKE ALL ON FUNCTION fin.fn_cambiar_moneda_gasto(bigint, text) FROM PUBLIC;
DO $g$
DECLARE r record;
BEGIN
    FOR r IN SELECT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_revisar_gasto' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cambiar_moneda_gasto(bigint, text) TO %I', r.grantee);
    END LOOP;
END $g$;

-- ---------------------------------------------------------------------------------
-- 7 · «Gastos por revisar»: la moneda que corresponde según el RUT o CUIT que leyó Iris
-- ---------------------------------------------------------------------------------
DO $m$
DECLARE d text := pg_get_functiondef('fin.fn_gastos_por_revisar()'::regprocedure); n int;
    a text := '''emisor'', m.emisor,';
    b text := '''emisor'', m.emisor, ''emisor_fiscal'', m.emisor_fiscal, '
           || '''moneda_sugerida'', nullif(ia.fn_moneda_por_fiscal(m.emisor_fiscal), m.moneda),';
BEGIN
    IF position('moneda_sugerida' IN d) > 0 THEN RETURN; END IF;
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré dónde agregar la moneda sugerida en fin.fn_gastos_por_revisar (%)', n; END IF;
    EXECUTE replace(d, a, b);
END $m$;

COMMIT;

-- Resultado
SELECT 'migración 296 aplicada' AS que,
       ia.fn_moneda_por_fiscal('61.202.000-0') AS rut_mop_vialidad,
       ia.fn_moneda_por_fiscal('30-71234567-1') AS cuit_ejemplo,
       (SELECT count(*) FROM fin.movimiento_fondo_chofer m
         WHERE m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'apelado') AND m.eliminado_en IS NULL
           AND ia.fn_moneda_por_fiscal(m.emisor_fiscal) IS DISTINCT FROM NULL
           AND ia.fn_moneda_por_fiscal(m.emisor_fiscal) <> m.moneda) AS pendientes_con_moneda_distinta_al_rut_o_cuit;
