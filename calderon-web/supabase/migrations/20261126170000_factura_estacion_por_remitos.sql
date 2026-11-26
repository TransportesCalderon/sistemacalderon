-- =====================================================================================
-- Migración 365 · Factura de la estación por remitos (QA Gestión y cualquier estación con remitos)
-- =====================================================================================
-- Pedido (26/11/2026): nosotros registramos cada carga con su remito; la estación después emite la factura eligiendo
-- algunos remitos y manda el «Listado de facturación de remitos». Al cargar esa factura hay que marcar las cargas de
-- esos remitos sin buscarlas a mano, y ver las diferencias.
--
--   · fin.fn_cruzar_remitos(gasto, remitos): recibe los renglones del listado (número de remito, fecha, litros, precio,
--     total; la web los lee del PDF) y busca la carga de cada remito entre las del proveedor de la factura:
--       1 · por número: el remito que llegó por mail (fue.remito_estacion, si existe) o el documento de la carga
--           (fue.documento_carga). Se compara sin ceros ni letras (REM-0001-00025374 = 0001-00025374 = 25374).
--       2 · si no, misma fecha y los mismos litros (±0,05 L);
--       3 · si no, misma fecha y el mismo importe (±2).
--     Los renglones con el mismo número de remito se suman (un remito puede traer varios renglones).
--     Devuelve cada remito con su carga, la diferencia de litros e importe, y si la carga ya está en otra factura;
--     además las cargas sin factura de esas fechas que el listado no trae.
--   · No guarda nada: la persona revisa y guarda con «Guardar las cargas de la factura» (fin.fn_vincular_cargas).
-- No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

-- Número de remito o documento normalizado: punto de venta y número, sin ceros a la izquierda ni letras
CREATE OR REPLACE FUNCTION fin.fn_numero_remito(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT CASE
        WHEN p IS NULL OR p !~ '\d' THEN NULL
        WHEN p ~ '\d+\D+\d+\s*$' THEN
            coalesce(nullif(ltrim((regexp_match(p, '(\d+)\D+(\d+)\s*$'))[1], '0'), ''), '0') || '-' ||
            coalesce(nullif(ltrim((regexp_match(p, '(\d+)\D+(\d+)\s*$'))[2], '0'), ''), '0')
        ELSE coalesce(nullif(ltrim((regexp_match(p, '(\d+)\s*$'))[1], '0'), ''), '0') END
$function$;

CREATE OR REPLACE FUNCTION fin.fn_cruzar_remitos(p_gasto bigint, p_remitos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    g fin.gasto%ROWTYPE; r record; v_carga bigint; v_como text; v_usadas bigint[] := '{}'; v_out jsonb := '[]'; v_desde date; v_hasta date;
    v_hay_mail boolean := to_regclass('fue.remito_estacion') IS NOT NULL;
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    SELECT * INTO g FROM fin.gasto WHERE id = p_gasto AND eliminado_en IS NULL;
    IF NOT FOUND OR g.estado = 'anulado' THEN RAISE EXCEPTION 'La factura no existe o está anulada' USING ERRCODE = 'P0002'; END IF;
    IF g.proveedor_id IS NULL THEN RAISE EXCEPTION 'La factura no tiene proveedor: elegilo primero' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_remitos) <> 'array' OR jsonb_array_length(p_remitos) = 0 THEN
        RAISE EXCEPTION 'No llegó ningún remito del listado' USING ERRCODE = '22023';
    END IF;

    -- Las cargas del proveedor (sin factura, en esta o en otra)
    CREATE TEMP TABLE IF NOT EXISTS _cr_cargas (id bigint, fecha date, patente text, litros numeric, importe numeric, otra text, numeros text[]) ON COMMIT DROP;
    TRUNCATE _cr_cargas;
    INSERT INTO _cr_cargas
    SELECT c.id, (c.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date, cm.patente, c.litros, c.importe_original,
           (SELECT g2.numero || coalesce(' ' || g2.numero_documento, '') FROM fin.gasto_carga gc JOIN fin.gasto g2 ON g2.id = gc.gasto_id
             WHERE gc.carga_id = c.id AND gc.gasto_id <> p_gasto),
           ARRAY(SELECT fin.fn_numero_remito(dc.numero_documento) FROM fue.documento_carga dc
                  WHERE dc.carga_id = c.id AND dc.eliminado_en IS NULL AND dc.numero_documento IS NOT NULL)
      FROM fue.carga_combustible c JOIN mae.estacion_servicio e ON e.id = c.estacion_id LEFT JOIN mae.camion cm ON cm.id = c.camion_id
     WHERE fin.fn_proveedor_de_carga(e.id, c.medio_pago) = g.proveedor_id AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
       AND c.moneda = g.moneda
       AND (fin.fn_medio_de_carga(c.medio_pago, fin.fn_proveedor_de_carga(e.id, c.medio_pago))).tipo = 'factura_posterior';
    IF v_hay_mail THEN
        EXECUTE $q$UPDATE _cr_cargas x SET numeros = x.numeros || ARRAY(SELECT fin.fn_numero_remito(re.numero) FROM fue.remito_estacion re
                                                                   WHERE re.carga_id = x.id AND re.descartada_en IS NULL AND re.numero IS NOT NULL)$q$;
    END IF;

    -- También el número solo (sin punto de venta), por si la carga lo tiene anotado así
    UPDATE _cr_cargas SET numeros = numeros || ARRAY(SELECT regexp_replace(n, '^\d+-', '') FROM unnest(numeros) n WHERE n ~ '-');

    -- Los remitos del listado, sumando los renglones del mismo número
    FOR r IN SELECT fin.fn_numero_remito(x ->> 'numero') AS clave, min(x ->> 'numero') AS numero, min((x ->> 'fecha')::date) AS fecha,
                    sum((x ->> 'litros')::numeric) AS litros, sum((x ->> 'total')::numeric) AS total, count(*) AS renglones
               FROM jsonb_array_elements(p_remitos) x
              WHERE nullif(x ->> 'numero', '') IS NOT NULL
              GROUP BY 1 ORDER BY 3, 1 LOOP
        v_carga := NULL; v_como := NULL;
        -- 1 · por número
        SELECT id INTO v_carga FROM _cr_cargas WHERE (r.clave = ANY (numeros) OR regexp_replace(r.clave, '^\d+-', '') = ANY (numeros)) AND id <> ALL (v_usadas) ORDER BY abs(litros - r.litros) LIMIT 1;
        IF v_carga IS NOT NULL THEN v_como := 'numero'; END IF;
        -- 2 · misma fecha y litros
        IF v_carga IS NULL THEN
            SELECT id INTO v_carga FROM _cr_cargas WHERE fecha = r.fecha AND abs(litros - r.litros) <= 0.05 AND id <> ALL (v_usadas)
             ORDER BY (otra IS NULL) DESC, abs(litros - r.litros), abs(importe - r.total) LIMIT 1;
            IF v_carga IS NOT NULL THEN v_como := 'litros'; END IF;
        END IF;
        -- 3 · misma fecha e importe
        IF v_carga IS NULL THEN
            SELECT id INTO v_carga FROM _cr_cargas WHERE fecha = r.fecha AND abs(importe - r.total) <= 2 AND id <> ALL (v_usadas)
             ORDER BY (otra IS NULL) DESC, abs(importe - r.total) LIMIT 1;
            IF v_carga IS NOT NULL THEN v_como := 'importe'; END IF;
        END IF;
        IF v_carga IS NOT NULL THEN v_usadas := v_usadas || v_carga; END IF;
        v_out := v_out || (SELECT jsonb_build_object(
                     'numero', r.numero, 'fecha', r.fecha, 'renglones', r.renglones, 'litros', r.litros, 'total', r.total,
                     'carga_id', c.id, 'como', v_como, 'carga_fecha', c.fecha, 'patente', c.patente, 'carga_litros', c.litros,
                     'carga_importe', c.importe, 'otra_factura', c.otra,
                     'dif_litros', round(r.litros - c.litros, 2), 'dif_importe', round(r.total - c.importe, 2))
                            FROM (SELECT 1) z LEFT JOIN _cr_cargas c ON c.id = v_carga);
    END LOOP;

    SELECT min((x ->> 'fecha')::date), max((x ->> 'fecha')::date) INTO v_desde, v_hasta FROM jsonb_array_elements(p_remitos) x;
    RETURN jsonb_build_object(
        'gasto_id', g.id, 'numero_documento', g.numero_documento, 'total', g.total, 'moneda', g.moneda,
        'remitos', v_out,
        -- Cargas sin factura de esas fechas que el listado no trae
        'sin_remito', coalesce((SELECT jsonb_agg(jsonb_build_object('carga_id', c.id, 'fecha', c.fecha, 'patente', c.patente, 'litros', c.litros,
                                                                   'importe', c.importe) ORDER BY c.fecha, c.id)
                                  FROM _cr_cargas c
                                 WHERE c.otra IS NULL AND c.id <> ALL (v_usadas) AND c.fecha BETWEEN v_desde AND v_hasta), '[]'));
END $function$;

-- Permisos: los mismos que fin.fn_cargas_por_facturar (leer las cargas por facturar)
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_cruzar_remitos(bigint, jsonb) FROM PUBLIC;
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fin.fn_cargas_por_facturar(bigint,bigint)'::regprocedure AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cruzar_remitos(bigint, jsonb) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;
GRANT EXECUTE ON FUNCTION fin.fn_numero_remito(text) TO PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: la factura de la estación se cruza con las cargas por remito' AS resultado;
