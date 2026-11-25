-- Liquidación por tramo (no por viaje) y corte en la fecha de baja del chofer
--   · Cada renglón de un viaje del chofer (un tramo de una línea: SAI-MZA, MZA-STGO…) se liquida UNA vez.
--     Antes entraban todos los tramos de los viajes que llegaban en el período (el VC-000009 llegó el 07/11 y
--     traía a noviembre tres tramos ya liquidados en octubre).
--   · Entran los tramos de viajes cerrados que llegaron hasta el fin del período (y desde fin.liq_tramos_desde,
--     26/10/2026: lo anterior se liquidó por fuera del sistema), que no estén en otra liquidación.
--   · RRHH marca un tramo como «no se liquida acá» (ya se pagó por fuera, o no lo hizo) o lo ajusta para la
--     liquidación (bono y km: por ejemplo, el chofer hizo solo San Antonio → Mendoza de un San Antonio → Buenos Aires).
--     No toca el viaje ni la operación.
--   · Fecha de baja del chofer: no entran viajes que salieron después de la baja, ni días de viático después
--     de la baja. Si un viaje terminó después de la baja, avisa para revisar sus tramos.
-- Va después de la 20261125120000 (liquidación en 3 pasos). No cambia web.version_base.

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'fin.liq_tramos_desde', '"2026-10-26"'::jsonb,
       'Liquidación por tramo: solo entran tramos de viajes que llegaron desde esta fecha (lo anterior se liquidó por fuera del sistema).'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fin.liq_tramos_desde');

CREATE TABLE IF NOT EXISTS fin.tramo_liquidacion (
    item_id      bigint PRIMARY KEY REFERENCES ops.viaje_chofer_item (id),
    liquidar     boolean NOT NULL,
    canon        numeric(14,2) CHECK (canon IS NULL OR canon >= 0),
    canon_moneda char(3) REFERENCES ref.moneda (codigo),
    km           numeric(10,1) CHECK (km IS NULL OR km >= 0),
    motivo       text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 300),
    creado_en    timestamptz NOT NULL DEFAULT now(),
    creado_por   bigint REFERENCES seg.usuario (id),
    CHECK ((canon IS NULL) = (canon_moneda IS NULL))
);
COMMENT ON TABLE fin.tramo_liquidacion IS 'Liquidación por tramo: lo que RRHH decide de un tramo para liquidarlo (no se liquida acá, o bono y km ajustados). Solo por funciones.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fin.tramo_liquidacion FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fin.tramo_liquidacion'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fin.tramo_liquidacion FROM %I', r.rolname);
    END LOOP;
END $r$;

-- Los tramos que mira una liquidación y qué pasa con cada uno
CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, lm.hasta, ch.fecha_egreso,
               (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-26'))::date AS piso
          FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id
         WHERE lm.id = p_liq),
    t AS (
        SELECT i.id, x.numero, (x.salida_ts AT TIME ZONE 'America/Argentina/Mendoza')::date AS salida,
               (x.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza')::date AS llegada,
               ln.codigo AS linea, ur.nombre || ' → ' || ue.nombre AS recorrido,
               CASE WHEN a.liquidar AND a.km IS NOT NULL THEN a.km ELSE i.km END AS km,
               CASE WHEN a.liquidar AND a.canon IS NOT NULL THEN a.canon ELSE i.canon END AS canon,
               CASE WHEN a.liquidar AND a.canon IS NOT NULL THEN a.canon_moneda::text ELSE i.canon_moneda::text END AS moneda,
               a.liquidar, a.motivo, (a.item_id IS NOT NULL AND a.liquidar AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso, l.id AS liq,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND jsonb_typeof(r2.referencia -> 'items') = 'array' AND (r2.referencia -> 'items') @> to_jsonb(i.id)
                 LIMIT 1) AS en_otra
          FROM l
          JOIN ops.viaje_chofer x ON x.chofer_id = l.chofer_id AND x.estado = 'cerrado' AND x.eliminado_en IS NULL
           AND x.llegada_ts < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND x.llegada_ts >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
          JOIN ops.viaje_chofer_item i ON i.viaje_id = x.id AND i.eliminado_en IS NULL
          LEFT JOIN mae.linea ln ON ln.id = i.linea_id
          LEFT JOIN mae.ubicacion ur ON ur.id = ln.lugar_retiro_id
          LEFT JOIN mae.ubicacion ue ON ue.id = ln.lugar_entrega_id
          LEFT JOIN fin.tramo_liquidacion a ON a.item_id = i.id)
    SELECT t.id, t.numero, t.salida, t.llegada, t.linea, t.recorrido, t.km, t.canon, t.moneda,
           CASE WHEN t.canon IS NULL THEN NULL WHEN t.moneda = ref.fn_moneda_base() THEN t.canon ELSE ops.fn_a_moneda_base(t.canon, t.moneda, t.llegada) END,
           CASE WHEN t.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN t.en_otra IS NOT NULL THEN 'en_otra'
                WHEN t.fecha_egreso IS NOT NULL AND t.salida > t.fecha_egreso THEN 'despues_baja'
                ELSE 'incluido' END,
           CASE WHEN t.liquidar IS FALSE THEN t.motivo
                WHEN t.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || t.en_otra
                WHEN t.fecha_egreso IS NOT NULL AND t.salida > t.fecha_egreso THEN 'El viaje salió después de la baja del chofer (' || to_char(t.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN t.ajustado THEN 'Ajustado: ' || t.motivo
                WHEN t.fecha_egreso IS NOT NULL AND t.llegada > t.fecha_egreso THEN 'El viaje terminó después de la baja: revisá que el tramo lo haya hecho él' END,
           coalesce(t.ajustado, false), t.motivo
      FROM t
     ORDER BY t.salida, t.numero, t.id
$f$;

-- Rehace los renglones del bono por tramo (CANON) y del adicional por km (KM) de un borrador
CREATE OR REPLACE FUNCTION fin.fn_liq_tramos(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; t record; v record; v_av jsonb; v_egreso date; v_tarde text;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    SELECT fecha_egreso INTO v_egreso FROM mae.chofer WHERE id = l.chofer_id;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo IN ('CANON', 'KM') AND eliminado_en IS NULL;

    SELECT count(*)::int AS tramos, count(DISTINCT x.viaje)::int AS viajes, sum(x.km) AS km, sum(x.canon_base) AS canon,
           count(*) FILTER (WHERE x.canon IS NOT NULL AND x.canon_base IS NULL)::int AS sin_cot,
           coalesce(jsonb_agg(x.item_id ORDER BY x.item_id), '[]') AS items,
           coalesce(jsonb_agg(DISTINCT x.viaje), '[]') AS numeros
      INTO v
      FROM fin.fn_tramos_liquidacion(p_liq) x WHERE x.estado = 'incluido';
    SELECT * INTO t FROM fin.fn_tarifa_en(l.chofer_id, l.hasta);

    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'CANON', format('Bono por tramo (%s tramo%s)', v.tramos, CASE WHEN v.tramos = 1 THEN '' ELSE 's' END),
                               fin.fn_liq_tipo_param('fin.liq_canon_tipo'), v.tramos, NULL, coalesce(v.canon, 0),
                               jsonb_build_object('items', v.items, 'viajes', v.numeros), 20);
    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'KM', format('Km de línea (%s km × %s)', round(coalesce(v.km, 0)), coalesce(t.precio_km, 0)),
                               fin.fn_liq_tipo_param('fin.liq_km_tipo'), v.km, t.precio_km, coalesce(v.km, 0) * coalesce(t.precio_km, 0),
                               jsonb_build_object('items', v.items), 30);

    -- Avisos: se sacan los de la cuenta por viaje y se ponen los de esta
    SELECT coalesce(jsonb_agg(a ORDER BY i), '[]') INTO v_av
      FROM jsonb_array_elements(l.avisos) WITH ORDINALITY q(a, i)
     WHERE (a #>> '{}') NOT LIKE '%canon(es) en otra moneda%' AND (a #>> '{}') <> 'Hay km de línea pero no precio por km'
       AND (a #>> '{}') NOT LIKE 'Tramo%' AND (a #>> '{}') NOT LIKE 'El viaje % terminó después de la baja%';
    IF v.sin_cot > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s bono(s) en otra moneda sin cotización del día: no se sumaron (cargala en Tipos de cambio)', v.sin_cot));
    END IF;
    IF coalesce(v.km, 0) > 0 AND t.precio_km IS NULL THEN
        v_av := v_av || to_jsonb('Hay km de línea pero no precio por km'::text);
    END IF;
    IF v_egreso IS NOT NULL THEN
        SELECT string_agg(DISTINCT x.viaje, ', ') INTO v_tarde FROM fin.fn_tramos_liquidacion(p_liq) x
         WHERE x.estado = 'incluido' AND x.llegada > v_egreso AND NOT x.ajustado;
        IF v_tarde IS NOT NULL THEN
            v_av := v_av || to_jsonb(format('El viaje %s terminó después de la baja del chofer (%s): revisá que los tramos sean solo los que hizo él (Ajustar o «No se liquida»)',
                                            v_tarde, to_char(v_egreso, 'DD/MM/YYYY')));
        END IF;
    END IF;
    UPDATE fin.liquidacion_mensual SET avisos = v_av WHERE id = p_liq;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

-- RRHH decide un tramo: p_liquidar NULL = vuelve a lo del viaje; false = no se liquida; true con bono/km = ajustado
CREATE OR REPLACE FUNCTION fin.fn_guardar_tramo_liquidacion(p_item bigint, p_liquidar boolean, p_canon numeric, p_moneda text, p_km numeric, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; v_chofer bigint; v_liq bigint; v_mon text := upper(nullif(btrim(p_moneda), ''));
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'Los tramos de la liquidación los deciden RRHH o TI');
    SELECT x.chofer_id INTO v_chofer FROM ops.viaje_chofer_item i JOIN ops.viaje_chofer x ON x.id = i.viaje_id
     WHERE i.id = p_item AND i.eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El tramo no existe' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_renglon r JOIN fin.liquidacion_mensual lm ON lm.id = r.liquidacion_id
                WHERE r.codigo = 'CANON' AND r.eliminado_en IS NULL AND lm.estado IN ('aprobada','pagada') AND lm.eliminado_en IS NULL
                  AND jsonb_typeof(r.referencia -> 'items') = 'array' AND (r.referencia -> 'items') @> to_jsonb(p_item)) THEN
        RAISE EXCEPTION 'Ese tramo ya está en una liquidación aprobada: para cambiarlo, reabrila' USING ERRCODE = '55000';
    END IF;
    IF p_liquidar IS NULL THEN
        DELETE FROM fin.tramo_liquidacion WHERE item_id = p_item;
    ELSE
        IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
            RAISE EXCEPTION 'Escribí por qué (por ejemplo: liquidado en octubre por fuera del sistema, renunció en Mendoza)' USING ERRCODE = '22023';
        END IF;
        IF p_liquidar AND p_canon IS NULL AND p_km IS NULL THEN
            RAISE EXCEPTION 'Escribí el bono o los km que corresponden' USING ERRCODE = '22023';
        END IF;
        IF p_canon IS NOT NULL AND (p_canon < 0 OR v_mon IS NULL OR NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = v_mon)) THEN
            RAISE EXCEPTION 'Revisá el bono y su moneda' USING ERRCODE = '22023';
        END IF;
        IF p_km IS NOT NULL AND (p_km < 0 OR p_km > 20000) THEN
            RAISE EXCEPTION 'Revisá los km' USING ERRCODE = '22023';
        END IF;
        INSERT INTO fin.tramo_liquidacion (item_id, liquidar, canon, canon_moneda, km, motivo, creado_por)
        VALUES (p_item, p_liquidar, CASE WHEN p_liquidar THEN p_canon END, CASE WHEN p_liquidar AND p_canon IS NOT NULL THEN v_mon END,
                CASE WHEN p_liquidar THEN p_km END, left(btrim(p_motivo), 300), v_usr)
        ON CONFLICT (item_id) DO UPDATE SET liquidar = EXCLUDED.liquidar, canon = EXCLUDED.canon, canon_moneda = EXCLUDED.canon_moneda,
               km = EXCLUDED.km, motivo = EXCLUDED.motivo, creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    -- Los borradores del chofer se rehacen solos
    FOR v_liq IN SELECT id FROM fin.liquidacion_mensual WHERE chofer_id = v_chofer AND estado = 'borrador' AND eliminado_en IS NULL LOOP
        PERFORM fin.fn_liq_tramos(v_liq);
    END LOOP;
END $f$;

-- Días trabajados: nada después de la baja del chofer
CREATE OR REPLACE FUNCTION fin.fn_dias_chofer(p_chofer bigint, p_desde date, p_hasta date)
RETURNS TABLE (fecha date, trabajado boolean, propuesto boolean, fuente text, detalle text, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH ch AS (SELECT fecha_egreso FROM mae.chofer WHERE id = p_chofer),
    d AS (SELECT g::date AS fecha FROM generate_series(p_desde, p_hasta, interval '1 day') g),
    via AS (
        SELECT g::date AS fecha, string_agg(DISTINCT v.numero, ', ') AS numeros
          FROM ops.viaje_chofer v
         CROSS JOIN LATERAL generate_series((v.salida_ts AT TIME ZONE 'America/Argentina/Mendoza')::date,
                                            (coalesce(v.llegada_ts, now()) AT TIME ZONE 'America/Argentina/Mendoza')::date, interval '1 day') g
         WHERE v.chofer_id = p_chofer AND v.estado <> 'anulado' AND v.eliminado_en IS NULL
           AND v.salida_ts < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND coalesce(v.llegada_ts, now()) >= p_desde::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
         GROUP BY 1),
    ope AS (
        SELECT g::date AS fecha, count(DISTINCT t.tramo_id) AS tramos
          FROM ops.tramo_chofer t
         CROSS JOIN LATERAL generate_series((t.desde_ts AT TIME ZONE 'America/Argentina/Mendoza')::date,
                                            (coalesce(t.hasta_ts, t.desde_ts) AT TIME ZONE 'America/Argentina/Mendoza')::date, interval '1 day') g
         WHERE t.chofer_id = p_chofer AND t.eliminado_en IS NULL AND t.desde_ts IS NOT NULL
           AND t.desde_ts < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND coalesce(t.hasta_ts, t.desde_ts) >= p_desde::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
         GROUP BY 1),
    gps AS (
        SELECT c.fecha, sum(c.km) AS km FROM tel.conduccion_diaria c
         WHERE c.chofer_id = p_chofer AND c.fecha BETWEEN p_desde AND p_hasta
         GROUP BY 1 HAVING sum(c.km) >= ref.fn_parametro_num('fin.viatico_km_minimo', 5))
    SELECT d.fecha,
           CASE WHEN ch.fecha_egreso IS NOT NULL AND d.fecha > ch.fecha_egreso THEN false
                ELSE coalesce(a.trabajado, via.fecha IS NOT NULL OR ope.fecha IS NOT NULL OR gps.fecha IS NOT NULL) END,
           (ch.fecha_egreso IS NULL OR d.fecha <= ch.fecha_egreso) AND (via.fecha IS NOT NULL OR ope.fecha IS NOT NULL OR gps.fecha IS NOT NULL),
           CASE WHEN ch.fecha_egreso IS NOT NULL AND d.fecha > ch.fecha_egreso THEN NULL
                WHEN via.fecha IS NOT NULL THEN 'viaje' WHEN ope.fecha IS NOT NULL THEN 'operacion' WHEN gps.fecha IS NOT NULL THEN 'gps' END,
           CASE WHEN ch.fecha_egreso IS NOT NULL AND d.fecha > ch.fecha_egreso THEN 'Después de la baja del chofer (' || to_char(ch.fecha_egreso, 'DD/MM') || ')'
                ELSE concat_ws(' · ', CASE WHEN via.fecha IS NOT NULL THEN 'Viaje ' || via.numeros END,
                               CASE WHEN ope.fecha IS NOT NULL THEN ope.tramos || ' movimiento(s) asignado(s)' END,
                               CASE WHEN gps.fecha IS NOT NULL THEN 'Manejó ' || round(gps.km) || ' km' END) END,
           a.motivo
      FROM d CROSS JOIN ch
      LEFT JOIN via ON via.fecha = d.fecha
      LEFT JOIN ope ON ope.fecha = d.fecha
      LEFT JOIN gps ON gps.fecha = d.fecha
      LEFT JOIN fin.dia_trabajado_ajuste a ON a.chofer_id = p_chofer AND a.fecha = d.fecha
     ORDER BY d.fecha
$f$;

-- Preparar: bono por tramo, viáticos y bono por desempeño
CREATE OR REPLACE FUNCTION fin.fn_preparar_liquidacion(p_chofer bigint, p_periodo date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_liq bigint;
BEGIN
    v_liq := fin.fn_preparar_liquidacion_sin_pasos(p_chofer, p_periodo);
    PERFORM fin.fn_liq_tramos(v_liq);
    PERFORM fin.fn_liq_viatico(v_liq);
    PERFORM fin.fn_liq_bono(v_liq);
    RETURN v_liq;
END $f$;

-- La planilla (papeles) muestra los tramos liquidados, no los viajes enteros
DO $m$
BEGIN
    IF to_regprocedure('fin.fn_planilla_detalle_sin_tramos(bigint)') IS NULL THEN
        ALTER FUNCTION fin.fn_planilla_detalle(bigint) RENAME TO fn_planilla_detalle_sin_tramos;
    END IF;
END $m$;

CREATE OR REPLACE FUNCTION fin.fn_planilla_detalle(p_liq bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_planilla_detalle_sin_tramos(p_liq) || jsonb_build_object('viajes',
        coalesce((SELECT jsonb_agg(jsonb_build_object('numero', x.viaje || coalesce(' · ' || x.linea, ''), 'salida', x.salida, 'llegada', x.llegada,
                                                      'recorrido', x.recorrido, 'km', x.km, 'canon', x.canon_base) ORDER BY x.salida, x.viaje, x.item_id)
                    FROM fin.fn_tramos_liquidacion(p_liq) x WHERE x.estado = 'incluido'), '[]'::jsonb))
$f$;

-- La liquidación para la pantalla: suma los tramos con su estado
CREATE OR REPLACE FUNCTION fin.fn_liquidacion_json(p_liq bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_liquidacion_json_sin_pasos(p_liq) || jsonb_build_object(
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias_trabajados', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                                        'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                                       FROM fin.liquidacion_mensual l CROSS JOIN LATERAL fin.fn_dias_chofer(l.chofer_id, l.desde, l.hasta) x
                                      WHERE l.id = p_liq), '[]'::jsonb),
        'bono_desempeno', fin.fn_bono_propuesta(p_liq),
        'colaboradores', (SELECT jsonb_build_object('imponible', g.col_imponible, 'no_imponible', g.col_no_imponible, 'gratificacion', g.col_gratificacion,
                                                    'afp', g.col_afp, 'salud', g.col_salud, 'cesantia', g.col_cesantia, 'impuesto', g.col_impuesto,
                                                    'otros_descuentos', g.col_otros_descuentos, 'liquido', g.col_liquido,
                                                    'aporte_empleador', g.col_aporte_empleador, 'pdf_ruta', g.col_pdf_ruta, 'cargado_en', g.col_cargado_en)
                            FROM fin.liquidacion_legal g WHERE g.liquidacion_id = p_liq AND g.eliminado_en IS NULL AND g.col_liquido IS NOT NULL),
        'baja_chofer', (SELECT ch.fecha_egreso FROM fin.liquidacion_mensual l JOIN mae.chofer ch ON ch.id = l.chofer_id WHERE l.id = p_liq),
        'tramos', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', x.item_id, 'viaje', x.viaje, 'salida', x.salida, 'llegada', x.llegada,
                                                               'linea', x.linea, 'recorrido', x.recorrido, 'km', x.km, 'canon', x.canon,
                                                               'canon_moneda', x.canon_moneda, 'canon_base', x.canon_base, 'estado', x.estado,
                                                               'detalle', x.detalle, 'ajustado', x.ajustado, 'motivo', x.motivo)
                                             ORDER BY x.salida, x.viaje, x.item_id)
                              FROM fin.fn_tramos_liquidacion(p_liq) x), '[]'::jsonb))
$f$;

-- Permisos
DO $g$
DECLARE g record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_tramos_liquidacion(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_liq_tramos(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_guardar_tramo_liquidacion(bigint, boolean, numeric, text, numeric, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_planilla_detalle(bigint) FROM PUBLIC;
    -- la planilla y su lista de tramos: los mismos que leían la planilla (incluye al chofer: sus papeles)
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_planilla_detalle_sin_tramos' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_planilla_detalle(bigint) TO %I', g.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_tramos_liquidacion(bigint) TO %I', g.grantee);
    END LOOP;
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_aprobar_liquidacion' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_tramo_liquidacion(bigint, boolean, numeric, text, numeric, text) TO %I', g.grantee);
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: liquidación por tramo y corte en la baja del chofer' AS resultado;
