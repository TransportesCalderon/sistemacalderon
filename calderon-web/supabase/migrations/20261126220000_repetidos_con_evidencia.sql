-- =====================================================================================
-- Migración 370 · Comprobante repetido: se decide por evidencia, no por un solo número
-- =====================================================================================
-- Caso (26/11/2026): un chofer cargó un gasto de ARS 7.400,41 del 26/11 (comprobante 0477, operación 5700) y el sistema
-- lo bloqueó como repetido de un gasto de OTRO chofer del 20/11 con el mismo importe y la misma «operación 5700».
-- Fecha distinta y chofer distinto: claramente no era el mismo papel. Pasaba seguido.
--
-- Cómo se piensa ahora: un repetido es EL MISMO PAPEL cargado dos veces. Se bloquea solo si:
--   1 · es la misma foto (el mismo archivo o la misma imagen), o
--   2 · coincide un número (operación o comprobante) Y nada contradice que sea el mismo papel:
--       · mismo importe (±1 %) y misma moneda;
--       · misma fecha del comprobante (±1 día), si las dos se conocen;
--       · si los dos tienen número de comprobante, es el mismo; ídem número de operación; ídem RUT/CUIT del emisor;
--     y además la coincidencia identifica el papel: un número largo (6 caracteres o más), o dos datos que lo
--     identifican (los dos números, o un número y el RUT/CUIT del emisor). La fecha y el importe no identifican: solo
--     descartan. Un número corto solo (como «5700») ya no alcanza, aunque coincidan fecha e importe: lo repiten las
--     cajas, terminales y peajes (y un chofer puede pasar dos veces por el mismo peaje el mismo día).
--
--   · fin.fn_gasto_repetido recibe además la fecha del comprobante (opcional). Las tres funciones que la usan se
--     actualizan para mandarla (reemplazo de texto con control: si alguna no coincide, avisa y sigue sin la fecha,
--     que es más estricto).
--   · Los avisos sin revisar que con esta regla no son repetidos quedan revisados solos, con una nota.
-- No cambia web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DROP FUNCTION IF EXISTS fin.fn_gasto_repetido(bigint, text, text, text, text, numeric, text[]);
DROP FUNCTION IF EXISTS fin.fn_gasto_repetido(bigint, text, text, text, text, numeric, text[], date);

CREATE FUNCTION fin.fn_gasto_repetido(p_excluir bigint, p_clave_comp text, p_clave_op text, p_fiscal text, p_moneda text,
    p_importe numeric, p_hashes text[], p_fecha date DEFAULT NULL, OUT gasto_id bigint, OUT regla text)
RETURNS record
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_fiscal text := nullif(regexp_replace(coalesce(p_fiscal, ''), '[^0-9kK]', '', 'g'), '');
        v_hashes text[] := array_remove(ARRAY(SELECT lower(h) FROM unnest(p_hashes) h WHERE nullif(h, '') IS NOT NULL), NULL);
        v_fecha date := p_fecha;
        r record;
BEGIN
    -- Si se revisa un gasto ya cargado, su fecha
    IF v_fecha IS NULL AND p_excluir IS NOT NULL THEN
        SELECT fecha INTO v_fecha FROM fin.movimiento_fondo_chofer WHERE id = p_excluir;
    END IF;

    -- 1 · La misma foto
    IF cardinality(v_hashes) > 0 THEN
        SELECT o.id INTO gasto_id FROM fin.movimiento_fondo_chofer o
         WHERE o.tipo = 'gasto' AND o.estado <> 'anulado' AND o.eliminado_en IS NULL AND o.id IS DISTINCT FROM p_excluir
           AND (o.hash_comprobante = ANY (v_hashes) OR o.hash_imagen_ia = ANY (v_hashes))
         ORDER BY o.id LIMIT 1;
        IF gasto_id IS NOT NULL THEN regla := 'la misma foto'; RETURN; END IF;
    END IF;

    IF p_clave_op IS NULL AND p_clave_comp IS NULL THEN RETURN; END IF;

    -- 2 · Un número que coincide, sin nada que lo contradiga y con evidencia suficiente
    FOR r IN
        SELECT o.id,
               (p_clave_op IS NOT NULL AND o.clave_operacion = p_clave_op) AS op_igual,
               (p_clave_comp IS NOT NULL AND o.clave_comprobante = p_clave_comp) AS comp_igual,
               (v_fiscal IS NOT NULL AND regexp_replace(coalesce(o.emisor_fiscal, ''), '[^0-9kK]', '', 'g') = v_fiscal) AS fiscal_igual,
               (v_fecha IS NOT NULL AND o.fecha IS NOT NULL AND abs(o.fecha - v_fecha) <= 1) AS fecha_igual
          FROM fin.movimiento_fondo_chofer o
         WHERE o.tipo = 'gasto' AND o.estado <> 'anulado' AND o.eliminado_en IS NULL AND o.id IS DISTINCT FROM p_excluir
           AND ((p_clave_op IS NOT NULL AND o.clave_operacion = p_clave_op) OR (p_clave_comp IS NOT NULL AND o.clave_comprobante = p_clave_comp))
           -- lo que tiene que ser igual
           AND o.moneda = p_moneda
           AND abs(o.importe - p_importe) <= greatest(o.importe * 0.01, 1)
           -- lo que no puede contradecir
           AND (v_fecha IS NULL OR o.fecha IS NULL OR abs(o.fecha - v_fecha) <= 1)
           AND (p_clave_comp IS NULL OR o.clave_comprobante IS NULL OR o.clave_comprobante = p_clave_comp)
           AND (p_clave_op IS NULL OR o.clave_operacion IS NULL OR o.clave_operacion = p_clave_op)
           AND (v_fiscal IS NULL OR nullif(regexp_replace(coalesce(o.emisor_fiscal, ''), '[^0-9kK]', '', 'g'), '') IS NULL
                OR regexp_replace(o.emisor_fiscal, '[^0-9kK]', '', 'g') = v_fiscal)
         ORDER BY o.id
    LOOP
        -- evidencia suficiente: un número largo, o dos datos que identifican el papel (los dos números, o un número
        -- y el RUT/CUIT del emisor). La fecha y el importe no identifican: solo descartan.
        IF (r.op_igual AND length(p_clave_op) >= 6) OR (r.comp_igual AND length(p_clave_comp) >= 6)
           OR ((r.op_igual::int + r.comp_igual::int + r.fiscal_igual::int) >= 2) THEN
            gasto_id := r.id;
            regla := array_to_string(ARRAY[
                         CASE WHEN r.op_igual AND r.comp_igual THEN 'el mismo número de comprobante y de operación'
                              WHEN r.op_igual THEN 'el mismo número de operación'
                              ELSE 'el mismo número de comprobante' END,
                         CASE WHEN r.fiscal_igual THEN 'el mismo emisor' END,
                         CASE WHEN r.fecha_igual THEN 'la misma fecha' END], ', ') || ' y el mismo importe';
            RETURN;
        END IF;
    END LOOP;
END $function$;
REVOKE ALL ON FUNCTION fin.fn_gasto_repetido(bigint, text, text, text, text, numeric, text[], date) FROM PUBLIC;

-- Las funciones que la usan le mandan la fecha del comprobante
DO $p$
DECLARE
    f record; v_def text; v_nuevo text; v_n int := 0;
BEGIN
    FOR f IN SELECT * FROM (VALUES
                ('fin.fn_subir_gasto_verificado_sin_moneda', 'ARRAY[p_hash, l.hash_imagen]);', 'ARRAY[p_hash, l.hash_imagen], p_fecha);'),
                ('fin.fn_gastos_por_revisar', 'ARRAY[m.hash_comprobante, m.hash_imagen_ia])', 'ARRAY[m.hash_comprobante, m.hash_imagen_ia], m.fecha)'),
                ('fin.fn_revisar_gasto', 'ARRAY[m.hash_comprobante, m.hash_imagen_ia])', 'ARRAY[m.hash_comprobante, m.hash_imagen_ia], m.fecha)')) x(fn, de, a)
    LOOP
        IF to_regproc(f.fn) IS NULL THEN RAISE NOTICE '% no existe: se saltea', f.fn; CONTINUE; END IF;
        SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname || '.' || p.proname = f.fn LIMIT 1;
        IF position(f.a IN v_def) > 0 THEN CONTINUE; END IF;   -- ya estaba
        IF (length(v_def) - length(replace(v_def, f.de, ''))) / length(f.de) <> 1 THEN
            RAISE NOTICE '% no tiene el texto esperado: sigue sin mandar la fecha (más estricto)', f.fn;
            CONTINUE;
        END IF;
        v_nuevo := replace(v_def, f.de, f.a);
        EXECUTE v_nuevo;
        v_n := v_n + 1;
    END LOOP;
    RAISE NOTICE 'Funciones que ahora mandan la fecha: %', v_n;
END $p$;

-- Permisos: los mismos que tenía la función (la usan solo las funciones de la base, SECURITY DEFINER)
DO $g$
DECLARE r record;
BEGIN
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'fin' AND a.routine_name = 'fn_gastos_por_revisar' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_gasto_repetido(bigint, text, text, text, text, numeric, text[], date) TO %I', r.grantee);
    END LOOP;
END $g$;

-- Los avisos sin revisar que con la regla nueva no son repetidos: revisados solos
DO $i$
DECLARE i record; x record; n int := 0;
BEGIN
    FOR i IN SELECT ig.* FROM fin.intento_gasto_repetido ig WHERE ig.revisado_en IS NULL AND ig.regla <> 'la misma foto' LOOP
        SELECT * INTO x FROM fin.fn_gasto_repetido(NULL, fin.fn_clave_nro(i.comprobante_nro), fin.fn_clave_nro(i.operacion_nro),
                                                   (SELECT l.propuesta ->> 'cuit_rut' FROM ia.lectura l WHERE l.id = i.ia_lectura_id),
                                                   i.moneda, i.importe, '{}'::text[], i.fecha);
        IF x.gasto_id IS DISTINCT FROM i.original_id THEN
            UPDATE fin.intento_gasto_repetido
               SET revisado_en = now(), nota = left(coalesce(nota || ' · ', '') || 'Con la regla nueva (migración 370) no es el mismo comprobante: lo puede volver a cargar', 500)
             WHERE id = i.id;
            n := n + 1;
        END IF;
    END LOOP;
    RAISE NOTICE 'Avisos que no eran repetidos, marcados revisados: %', n;
END $i$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: un repetido se decide por evidencia (misma foto, o número + importe + fecha sin contradicciones)' AS resultado;
