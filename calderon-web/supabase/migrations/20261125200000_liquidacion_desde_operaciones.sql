-- La liquidación sale de los movimientos que registra Operaciones (historial del chofer), no de los viajes del cierre
--   · Fuente: ops.fn_segmentos_chofer (tramos operativos de cada operación con su chofer; con relevo, la parte de cada uno).
--     Es lo mismo que muestra el historial del chofer.
--   · Entran los movimientos TERMINADOS (tramo cerrado, con fecha de fin) entre fin.liq_tramos_desde y el fin del período,
--     que no estén en otra liquidación. Un movimiento que empezó después de la baja del chofer no entra.
--   · Bono y km: la línea con el mismo origen y destino. Si no hay, se juntan los movimientos seguidos del mismo chofer
--     en la misma operación (por ejemplo, San Antonio → Aduana Global → Buenos Aires) y se busca la línea de punta a punta.
--     Si hay varias líneas iguales, manda la de la operación.
--   · Vacíos (sin carga): no se pagan. Cargados sin línea: no se pagan solos; RRHH los ajusta (bono y km) si corresponde.
--   · Línea sin bono cargado: se avisa (cargarlo en la línea).
--   · RRHH decide por movimiento: «No se liquida acá» o ajustar bono y km (tabla fin.movimiento_liquidacion).
--   · Viáticos: los días con movimientos de Operaciones también cuentan (antes solo los relevos).
-- Mantiene las funciones de la 346/348 (mismas columnas), así la pantalla, los papeles y el bono por tramo siguen igual.
-- Va después de la 20261125180000. No cambia web.version_base.

CREATE TABLE IF NOT EXISTS fin.movimiento_liquidacion (
    tramo_id     bigint NOT NULL REFERENCES ops.tramo_operativo (id),
    chofer_id    bigint NOT NULL REFERENCES mae.chofer (id),
    liquidar     boolean NOT NULL,
    canon        numeric(14,2) CHECK (canon IS NULL OR canon >= 0),
    canon_moneda char(3) REFERENCES ref.moneda (codigo),
    km           numeric(10,1) CHECK (km IS NULL OR km >= 0),
    motivo       text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 300),
    creado_en    timestamptz NOT NULL DEFAULT now(),
    creado_por   bigint REFERENCES seg.usuario (id),
    PRIMARY KEY (tramo_id, chofer_id),
    CHECK ((canon IS NULL) = (canon_moneda IS NULL))
);
COMMENT ON TABLE fin.movimiento_liquidacion IS 'Liquidación desde Operaciones: lo que RRHH decide de un movimiento del chofer (no se liquida acá, o bono y km ajustados). La clave es el primer tramo del movimiento. Solo por funciones.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fin.movimiento_liquidacion FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fin.movimiento_liquidacion'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fin.movimiento_liquidacion FROM %I', r.rolname);
    END LOOP;
END $r$;

-- La línea de un recorrido (si hay varias, la de la operación; después las activas con bono)
CREATE OR REPLACE FUNCTION fin.fn_linea_de(p_origen bigint, p_destino bigint, p_servicio bigint)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT ln.id FROM mae.linea ln
     WHERE ln.lugar_retiro_id = p_origen AND ln.lugar_entrega_id = p_destino AND ln.eliminado_en IS NULL AND p_origen <> p_destino
     ORDER BY (ln.id = (SELECT s.linea_id FROM ops.servicio_comercial s WHERE s.id = p_servicio)) DESC NULLS LAST,
              ln.activa DESC, (ln.canon_chofer IS NOT NULL) DESC, ln.id
     LIMIT 1
$f$;
REVOKE ALL ON FUNCTION fin.fn_linea_de(bigint, bigint, bigint) FROM PUBLIC;

-- Los movimientos del chofer que mira una liquidación (agrupados cuando hace falta para encontrar la línea)
CREATE OR REPLACE FUNCTION fin.fn_movimientos_liquidacion(p_liq bigint)
RETURNS TABLE (clave bigint, tramos bigint[], servicio_id bigint, operacion bigint, tractor text, recorrido text,
               desde timestamptz, hasta timestamptz, con_carga boolean, linea_id bigint, km_movimiento numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    l record; s record; i int; j int; n int; v_lin bigint; v_srv bigint;
    seg_t bigint[]; seg_o bigint[]; seg_d bigint[]; seg_on text[]; seg_dn text[]; seg_desde timestamptz[]; seg_hasta timestamptz[];
    seg_carga boolean[]; seg_km numeric[]; seg_op bigint[]; seg_tr text[];
BEGIN
    SELECT lm.chofer_id, lm.hasta, (ref.fn_parametro_texto('fin.liq_tramos_desde', '2026-10-27'))::date AS piso
      INTO l FROM fin.liquidacion_mensual lm WHERE lm.id = p_liq;
    IF NOT FOUND THEN RETURN; END IF;
    FOR v_srv IN
        SELECT DISTINCT coalesce(x.servicio_id, -x.tramo_id)
          FROM ops.fn_segmentos_chofer((l.piso - 60)::timestamp AT TIME ZONE 'America/Argentina/Mendoza',
                                       (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', l.chofer_id, NULL) x
         WHERE x.estado = 'cerrado' AND x.hasta IS NOT NULL
           AND x.hasta >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND x.hasta < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
    LOOP
        seg_t := '{}'; seg_o := '{}'; seg_d := '{}'; seg_on := '{}'; seg_dn := '{}'; seg_desde := '{}'; seg_hasta := '{}';
        seg_carga := '{}'; seg_km := '{}'; seg_op := '{}'; seg_tr := '{}';
        FOR s IN
            SELECT x.*, coalesce(t.km_recorridos, t.km_recorridos_telemetria) AS km
              FROM ops.fn_segmentos_chofer((l.piso - 60)::timestamp AT TIME ZONE 'America/Argentina/Mendoza',
                                           (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', l.chofer_id, NULL) x
              JOIN ops.tramo_operativo t ON t.id = x.tramo_id
             WHERE coalesce(x.servicio_id, -x.tramo_id) = v_srv AND x.estado = 'cerrado' AND x.hasta IS NOT NULL
               AND x.hasta >= l.piso::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
               AND x.hasta < (l.hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
             ORDER BY x.desde, x.tramo_id
        LOOP
            seg_t := seg_t || s.tramo_id; seg_o := seg_o || s.origen_id; seg_d := seg_d || s.destino_id;
            seg_on := seg_on || s.origen; seg_dn := seg_dn || s.destino; seg_desde := seg_desde || s.desde; seg_hasta := seg_hasta || s.hasta;
            seg_carga := seg_carga || coalesce(s.con_carga, true); seg_km := seg_km || s.km; seg_op := seg_op || s.numero_operacion;
            seg_tr := seg_tr || s.tractor;
        END LOOP;
        n := coalesce(array_length(seg_t, 1), 0);
        i := 1;
        WHILE i <= n LOOP
            -- el tramo más largo (seguido, mismo chofer, misma operación) que tenga línea de punta a punta
            v_lin := NULL; j := n;
            WHILE j >= i LOOP
                IF j = i OR NOT EXISTS (SELECT 1 FROM generate_series(i, j - 1) k WHERE seg_d[k] IS DISTINCT FROM seg_o[k + 1]) THEN
                    v_lin := fin.fn_linea_de(seg_o[i], seg_d[j], CASE WHEN v_srv > 0 THEN v_srv END);
                    EXIT WHEN v_lin IS NOT NULL;
                END IF;
                j := j - 1;
            END LOOP;
            IF v_lin IS NULL THEN j := i; END IF;
            clave := seg_t[i]; tramos := seg_t[i:j]; servicio_id := CASE WHEN v_srv > 0 THEN v_srv END; operacion := seg_op[i];
            tractor := seg_tr[i]; recorrido := seg_on[i] || ' → ' || seg_dn[j];
            IF j > i THEN recorrido := recorrido || ' (' || (j - i + 1) || ' movimientos)'; END IF;
            desde := seg_desde[i]; hasta := seg_hasta[j];
            con_carga := EXISTS (SELECT 1 FROM generate_series(i, j) k WHERE seg_carga[k]);
            linea_id := v_lin;
            km_movimiento := (SELECT sum(seg_km[k]) FROM generate_series(i, j) k);
            RETURN NEXT;
            i := j + 1;
        END LOOP;
    END LOOP;
END $f$;
REVOKE ALL ON FUNCTION fin.fn_movimientos_liquidacion(bigint) FROM PUBLIC;

-- Mismas columnas que antes: item_id = clave del movimiento (su primer tramo), viaje = la operación
CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text,
               fuente_fecha text, viaje_salida date, viaje_llegada date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, ch.fecha_egreso FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id WHERE lm.id = p_liq),
    m AS (
        SELECT mv.*, ln.codigo AS linea, ln.canon_chofer, ln.canon_moneda::text AS lmoneda, ln.distancia_km,
               a.liquidar, a.canon AS a_canon, a.canon_moneda::text AS a_moneda, a.km AS a_km, a.motivo,
               (a.liquidar IS TRUE AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso, l.id AS liq, l.chofer_id,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.chofer_id = l.chofer_id
                   AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND jsonb_typeof(r2.referencia -> 'tramos') = 'array'
                   AND EXISTS (SELECT 1 FROM unnest(mv.tramos) x WHERE (r2.referencia -> 'tramos') @> to_jsonb(x))
                 LIMIT 1) AS en_otra
          FROM l
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(l.id) mv
          LEFT JOIN mae.linea ln ON ln.id = mv.linea_id
          LEFT JOIN fin.movimiento_liquidacion a ON a.tramo_id = mv.clave AND a.chofer_id = l.chofer_id),
    v AS (
        SELECT m.*,
               (m.desde AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_desde,
               (m.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_hasta,
               CASE WHEN m.ajustado AND m.a_km IS NOT NULL THEN m.a_km ELSE coalesce(m.distancia_km, m.km_movimiento) END AS v_km,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_canon ELSE m.canon_chofer END AS v_canon,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_moneda ELSE m.lmoneda END AS v_moneda
          FROM m)
    SELECT v.clave, 'Op. ' || coalesce(v.operacion::text, '—') || coalesce(' · ' || v.tractor, ''),
           v.f_desde, v.f_hasta, v.linea, v.recorrido, v.v_km, v.v_canon, v.v_moneda,
           CASE WHEN v.v_canon IS NULL THEN NULL WHEN v.v_moneda = ref.fn_moneda_base() THEN v.v_canon
                ELSE ops.fn_a_moneda_base(v.v_canon, v.v_moneda, v.f_hasta) END,
           CASE WHEN v.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN v.en_otra IS NOT NULL THEN 'en_otra'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'despues_baja'
                WHEN v.ajustado THEN 'incluido'
                WHEN NOT v.con_carga THEN 'vacio'
                WHEN v.linea_id IS NULL THEN 'sin_linea'
                ELSE 'incluido' END,
           CASE WHEN v.liquidar IS FALSE THEN v.motivo
                WHEN v.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || v.en_otra
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'Empezó después de la baja del chofer (' || to_char(v.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN v.ajustado THEN 'Ajustado: ' || v.motivo
                WHEN NOT v.con_carga THEN 'Vacío: no se paga'
                WHEN v.linea_id IS NULL THEN 'No hay una línea con este recorrido: si corresponde, poné el bono y los km'
                WHEN v.canon_chofer IS NULL THEN 'La línea ' || v.linea || ' no tiene bono cargado: cargalo en la línea o ajustalo acá'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_hasta > v.fecha_egreso THEN 'Terminó después de la baja: revisá que lo haya hecho él' END,
           coalesce(v.ajustado, false), v.motivo, 'operacion', v.f_desde, v.f_hasta
      FROM v
     ORDER BY v.desde, v.clave
$f$;

-- Rehace el bono (CANON) y el adicional por km (KM) con los movimientos que se liquidan
CREATE OR REPLACE FUNCTION fin.fn_liq_tramos(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; t record; v record; v_av jsonb; v_egreso date; v_tarde text; v_sinbono int; v_sinlinea int;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    SELECT fecha_egreso INTO v_egreso FROM mae.chofer WHERE id = l.chofer_id;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo IN ('CANON', 'KM') AND eliminado_en IS NULL;

    SELECT count(*)::int AS n, sum(x.km) AS km, sum(x.canon_base) AS canon,
           count(*) FILTER (WHERE x.canon IS NOT NULL AND x.canon_base IS NULL)::int AS sin_cot,
           count(*) FILTER (WHERE x.canon IS NULL)::int AS sin_bono,
           coalesce((SELECT jsonb_agg(DISTINCT u) FROM fin.fn_movimientos_liquidacion(p_liq) mv, unnest(mv.tramos) u
                      WHERE mv.clave IN (SELECT y.item_id FROM fin.fn_tramos_liquidacion(p_liq) y WHERE y.estado = 'incluido')), '[]') AS tramos,
           coalesce(jsonb_agg(x.viaje), '[]') AS operaciones
      INTO v
      FROM fin.fn_tramos_liquidacion(p_liq) x WHERE x.estado = 'incluido';
    SELECT * INTO t FROM fin.fn_tarifa_en(l.chofer_id, l.hasta);

    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'CANON', format('Bono por tramo (%s tramo%s)', v.n, CASE WHEN v.n = 1 THEN '' ELSE 's' END),
                               fin.fn_liq_tipo_param('fin.liq_canon_tipo'), v.n, NULL, coalesce(v.canon, 0),
                               jsonb_build_object('tramos', v.tramos, 'operaciones', v.operaciones), 20);
    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'KM', format('Km de línea (%s km × %s)', round(coalesce(v.km, 0)), coalesce(t.precio_km, 0)),
                               fin.fn_liq_tipo_param('fin.liq_km_tipo'), v.km, t.precio_km, coalesce(v.km, 0) * coalesce(t.precio_km, 0),
                               jsonb_build_object('tramos', v.tramos), 30);

    SELECT count(*) FILTER (WHERE x.estado = 'sin_linea')::int INTO v_sinlinea FROM fin.fn_tramos_liquidacion(p_liq) x;
    SELECT coalesce(jsonb_agg(a ORDER BY i), '[]') INTO v_av
      FROM jsonb_array_elements(l.avisos) WITH ORDINALITY q(a, i)
     WHERE (a #>> '{}') NOT LIKE '%canon(es) en otra moneda%' AND (a #>> '{}') <> 'Hay km de línea pero no precio por km'
       AND (a #>> '{}') NOT LIKE 'Tramo%' AND (a #>> '{}') NOT LIKE 'El viaje % terminó después de la baja%'
       AND (a #>> '{}') NOT LIKE 'Movimiento%';
    IF v.sin_cot > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s bono(s) en otra moneda sin cotización del día: no se sumaron (cargala en Tipos de cambio)', v.sin_cot));
    END IF;
    IF v.sin_bono > 0 THEN
        v_av := v_av || to_jsonb(format('Tramos: %s tramo(s) con una línea sin bono cargado: cargalo en la línea o ajustalo en el tramo', v.sin_bono));
    END IF;
    IF v_sinlinea > 0 THEN
        v_av := v_av || to_jsonb(format('Movimientos: %s cargado(s) sin una línea igual: no se pagan hasta que pongas el bono y los km', v_sinlinea));
    END IF;
    IF coalesce(v.km, 0) > 0 AND t.precio_km IS NULL THEN
        v_av := v_av || to_jsonb('Hay km de línea pero no precio por km'::text);
    END IF;
    IF v_egreso IS NOT NULL THEN
        SELECT string_agg(DISTINCT x.viaje, ', ') INTO v_tarde FROM fin.fn_tramos_liquidacion(p_liq) x
         WHERE x.estado = 'incluido' AND x.llegada > v_egreso AND NOT x.ajustado;
        IF v_tarde IS NOT NULL THEN
            v_av := v_av || to_jsonb(format('Tramos: %s terminó después de la baja del chofer (%s): revisá que lo haya hecho él', v_tarde, to_char(v_egreso, 'DD/MM/YYYY')));
        END IF;
    END IF;
    UPDATE fin.liquidacion_mensual SET avisos = v_av WHERE id = p_liq;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

-- RRHH decide un movimiento (p_item = clave del movimiento: su primer tramo operativo)
CREATE OR REPLACE FUNCTION fin.fn_guardar_tramo_liquidacion(p_item bigint, p_liquidar boolean, p_canon numeric, p_moneda text, p_km numeric, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; v_chofer bigint; v_liq bigint; v_mon text := upper(nullif(btrim(p_moneda), ''));
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'Los tramos de la liquidación los deciden RRHH o TI');
    -- el chofer de la liquidación en borrador que tiene ese movimiento (con relevo, un tramo tiene varios choferes)
    SELECT lm.chofer_id INTO v_chofer FROM fin.liquidacion_mensual lm
     WHERE lm.estado = 'borrador' AND lm.eliminado_en IS NULL
       AND EXISTS (SELECT 1 FROM fin.fn_movimientos_liquidacion(lm.id) mv WHERE mv.clave = p_item)
     ORDER BY lm.periodo DESC LIMIT 1;
    IF v_chofer IS NULL THEN RAISE EXCEPTION 'El movimiento no existe' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_renglon r JOIN fin.liquidacion_mensual lm ON lm.id = r.liquidacion_id
                WHERE r.codigo = 'CANON' AND r.eliminado_en IS NULL AND lm.estado IN ('aprobada','pagada') AND lm.eliminado_en IS NULL
                  AND lm.chofer_id = v_chofer AND jsonb_typeof(r.referencia -> 'tramos') = 'array' AND (r.referencia -> 'tramos') @> to_jsonb(p_item)) THEN
        RAISE EXCEPTION 'Ese movimiento ya está en una liquidación aprobada: para cambiarlo, reabrila' USING ERRCODE = '55000';
    END IF;
    IF p_liquidar IS NULL THEN
        DELETE FROM fin.movimiento_liquidacion WHERE tramo_id = p_item AND chofer_id = v_chofer;
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
        INSERT INTO fin.movimiento_liquidacion (tramo_id, chofer_id, liquidar, canon, canon_moneda, km, motivo, creado_por)
        VALUES (p_item, v_chofer, p_liquidar, CASE WHEN p_liquidar THEN p_canon END, CASE WHEN p_liquidar AND p_canon IS NOT NULL THEN v_mon END,
                CASE WHEN p_liquidar THEN p_km END, left(btrim(p_motivo), 300), v_usr)
        ON CONFLICT (tramo_id, chofer_id) DO UPDATE SET liquidar = EXCLUDED.liquidar, canon = EXCLUDED.canon, canon_moneda = EXCLUDED.canon_moneda,
               km = EXCLUDED.km, motivo = EXCLUDED.motivo, creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    FOR v_liq IN SELECT id FROM fin.liquidacion_mensual WHERE chofer_id = v_chofer AND estado = 'borrador' AND eliminado_en IS NULL LOOP
        PERFORM fin.fn_liq_tramos(v_liq);
    END LOOP;
END $f$;

-- Viáticos: también los días con movimientos de Operaciones (no solo relevos)
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
        SELECT g::date AS fecha, string_agg(DISTINCT 'Op. ' || coalesce(s.numero_operacion::text, '?'), ', ') AS ops
          FROM ops.fn_segmentos_chofer(p_desde::timestamp AT TIME ZONE 'America/Argentina/Mendoza',
                                       (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza', p_chofer, NULL) s
         CROSS JOIN LATERAL generate_series((s.desde AT TIME ZONE 'America/Argentina/Mendoza')::date,
                                            (least(coalesce(s.hasta, now()), now()) AT TIME ZONE 'America/Argentina/Mendoza')::date, interval '1 day') g
         WHERE s.desde IS NOT NULL AND s.estado <> 'planificado'
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
                WHEN ope.fecha IS NOT NULL THEN 'operacion' WHEN via.fecha IS NOT NULL THEN 'viaje' WHEN gps.fecha IS NOT NULL THEN 'gps' END,
           CASE WHEN ch.fecha_egreso IS NOT NULL AND d.fecha > ch.fecha_egreso THEN 'Después de la baja del chofer (' || to_char(ch.fecha_egreso, 'DD/MM') || ')'
                ELSE concat_ws(' · ', CASE WHEN ope.fecha IS NOT NULL THEN ope.ops END,
                               CASE WHEN via.fecha IS NOT NULL AND ope.fecha IS NULL THEN 'Viaje ' || via.numeros END,
                               CASE WHEN gps.fecha IS NOT NULL THEN 'Manejó ' || round(gps.km) || ' km' END) END,
           a.motivo
      FROM d CROSS JOIN ch
      LEFT JOIN via ON via.fecha = d.fecha
      LEFT JOIN ope ON ope.fecha = d.fecha
      LEFT JOIN gps ON gps.fecha = d.fecha
      LEFT JOIN fin.dia_trabajado_ajuste a ON a.chofer_id = p_chofer AND a.fecha = d.fecha
     ORDER BY d.fecha
$f$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: la liquidación sale de los movimientos de Operaciones' AS resultado;
