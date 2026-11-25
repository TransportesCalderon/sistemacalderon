-- Los tramos de la liquidación usan las líneas del viaje del chofer, como el cierre de viaje
--   · Si el viaje del chofer tiene las líneas de esa operación (por ejemplo, Op. 6240: ER-MZA y MZA-STGO) y van de punta a
--     punta del movimiento que registró Operaciones, se usan esas mismas líneas, con su bono y sus km (también los ajustados
--     en el viaje). Cada línea es una fila que se marca o ajusta por separado.
--   · Si no coinciden (por ejemplo, el viaje dice San Antonio → Buenos Aires pero Operaciones registró que el chofer llegó
--     hasta Mendoza y siguió otro), manda Operaciones: se busca la línea del recorrido o se arma con líneas con bono.
--   · El viaje no tiene que estar cerrado: alcanza con que exista.
-- Va después de la 20261125230000. No cambia web.version_base.

CREATE OR REPLACE FUNCTION fin.fn_tramos_liquidacion(p_liq bigint)
RETURNS TABLE (item_id bigint, viaje text, salida date, llegada date, linea text, recorrido text,
               km numeric, canon numeric, canon_moneda text, canon_base numeric, estado text, detalle text, ajustado boolean, motivo text,
               fuente_fecha text, viaje_salida date, viaje_llegada date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH l AS (
        SELECT lm.id, lm.chofer_id, ch.fecha_egreso FROM fin.liquidacion_mensual lm JOIN mae.chofer ch ON ch.id = lm.chofer_id WHERE lm.id = p_liq),
    mv AS (
        SELECT x.*, ln.codigo AS linea_op, ln.canon_chofer AS lcanon, ln.canon_moneda::text AS lmoneda, ln.distancia_km AS lkm,
               (a0.tramo_id IS NOT NULL) AS decidido_entero
          FROM l
          CROSS JOIN LATERAL fin.fn_movimientos_liquidacion(l.id) x
          LEFT JOIN mae.linea ln ON ln.id = x.linea_id
          LEFT JOIN fin.movimiento_liquidacion a0 ON a0.tramo_id = x.clave AND a0.chofer_id = l.chofer_id AND a0.parte = 0),
    -- 1 · Las líneas que quedaron en el viaje del chofer para esa operación (como en el cierre), si van de punta a punta
    --     del movimiento que registró Operaciones. Respeta el bono y los km ajustados en el viaje.
    vi AS (
        SELECT mv.clave, row_number() OVER (PARTITION BY mv.clave ORDER BY i.id)::int AS parte,
               count(*) OVER (PARTITION BY mv.clave)::int AS partes,
               ln.id AS linea_id, ln.codigo, uo.nombre AS origen, ud.nombre AS destino,
               coalesce(i.km, ln.distancia_km, 0) AS km,
               CASE WHEN i.canon IS NOT NULL THEN i.canon ELSE ln.canon_chofer END AS canon,
               CASE WHEN i.canon IS NOT NULL THEN i.canon_moneda::text ELSE ln.canon_moneda::text END AS canon_moneda,
               ln.lugar_retiro_id AS o, ln.lugar_entrega_id AS d, mv.origen_id AS mo, mv.destino_id AS md,
               i.motivo_ajuste
          FROM mv
          JOIN ops.viaje_chofer_item i ON i.servicio_id = mv.servicio_id AND i.eliminado_en IS NULL
          JOIN ops.viaje_chofer vc ON vc.id = i.viaje_id AND vc.chofer_id = (SELECT chofer_id FROM l) AND vc.estado <> 'anulado' AND vc.eliminado_en IS NULL
          JOIN mae.linea ln ON ln.id = i.linea_id
          LEFT JOIN mae.ubicacion uo ON uo.id = ln.lugar_retiro_id
          LEFT JOIN mae.ubicacion ud ON ud.id = ln.lugar_entrega_id
         WHERE mv.servicio_id IS NOT NULL AND mv.con_carga AND NOT mv.decidido_entero),
    vio AS (
        SELECT vi.*, coalesce(sum(vi.km) OVER (PARTITION BY vi.clave ORDER BY vi.parte ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS km_antes,
               sum(vi.km) OVER (PARTITION BY vi.clave) AS km_total,
               lag(vi.d) OVER (PARTITION BY vi.clave ORDER BY vi.parte) AS d_ant
          FROM vi),
    vok AS (   -- de punta a punta y seguidas
        SELECT clave FROM vio GROUP BY clave
        HAVING bool_and(d_ant IS NULL OR d_ant = o)
           AND max(o) FILTER (WHERE parte = 1) = max(mo) AND max(d) FILTER (WHERE parte = partes) = max(md)),
    -- 2 · Si no, y la línea no tiene bono (o no hay): las líneas con bono que arman el recorrido
    pt AS (
        SELECT vio.clave, vio.parte, vio.partes, vio.linea_id, vio.codigo, vio.origen, vio.destino, vio.km, vio.canon, vio.canon_moneda,
               vio.km_antes, vio.km_total, 'del viaje del chofer'::text AS de_donde, vio.motivo_ajuste
          FROM vio WHERE vio.clave IN (SELECT clave FROM vok)
        UNION ALL
        SELECT mv.clave, p.parte, p.partes, p.linea_id, p.codigo, p.origen, p.destino, p.km, p.canon, p.canon_moneda, p.km_antes, p.km_total,
               'armado con las líneas con bono', NULL
          FROM mv CROSS JOIN LATERAL fin.fn_lineas_camino_partes(mv.origen_id, mv.destino_id) p
         WHERE mv.con_carga AND (mv.linea_id IS NULL OR mv.lcanon IS NULL) AND NOT mv.decidido_entero
           AND mv.clave NOT IN (SELECT clave FROM vok)),
    u AS (
        -- movimientos enteros
        SELECT mv.clave AS clave_item, mv.clave, 0 AS parte, mv.tramos, mv.operacion, mv.tractor, mv.recorrido, mv.desde, mv.hasta,
               mv.con_carga, mv.linea_op AS linea, mv.lcanon AS canon_l, mv.lmoneda AS moneda_l, coalesce(mv.lkm, mv.km_movimiento) AS km_l,
               (mv.linea_id IS NOT NULL) AS con_linea, mv.linea_op, NULL::text AS armado
          FROM mv WHERE NOT EXISTS (SELECT 1 FROM pt WHERE pt.clave = mv.clave)
        UNION ALL
        -- una fila por línea que arma el recorrido
        SELECT -(pt.clave * 10 + pt.parte), pt.clave, pt.parte, mv.tramos, mv.operacion, mv.tractor, pt.origen || ' → ' || pt.destino,
               mv.desde + (mv.hasta - mv.desde) * (pt.km_antes / nullif(pt.km_total, 0))::float8,
               mv.desde + (mv.hasta - mv.desde) * ((pt.km_antes + pt.km) / nullif(pt.km_total, 0))::float8,
               mv.con_carga, pt.codigo, pt.canon, pt.canon_moneda, pt.km, true, mv.linea_op,
               CASE WHEN pt.partes = 1 THEN 'Línea ' || pt.de_donde ELSE format('Parte %s de %s de %s (%s)', pt.parte, pt.partes, mv.recorrido, pt.de_donde) END
               || coalesce(' · ajuste del viaje: ' || pt.motivo_ajuste, '')
          FROM pt JOIN mv ON mv.clave = pt.clave),
    m AS (
        SELECT u.*, a.liquidar, a.canon AS a_canon, a.canon_moneda::text AS a_moneda, a.km AS a_km, a.motivo,
               (a.liquidar IS TRUE AND (a.canon IS NOT NULL OR a.km IS NOT NULL)) AS ajustado,
               l.fecha_egreso,
               (SELECT lm2.numero || ' (' || to_char(lm2.periodo, 'MM/YYYY') || ')'
                  FROM fin.liquidacion_renglon r2 JOIN fin.liquidacion_mensual lm2 ON lm2.id = r2.liquidacion_id
                 WHERE r2.codigo = 'CANON' AND r2.eliminado_en IS NULL AND lm2.id <> l.id AND lm2.chofer_id = l.chofer_id
                   AND lm2.estado <> 'anulada' AND lm2.eliminado_en IS NULL
                   AND ((jsonb_typeof(r2.referencia -> 'tramos') = 'array'
                         AND EXISTS (SELECT 1 FROM unnest(u.tramos) x WHERE (r2.referencia -> 'tramos') @> to_jsonb(x)))
                        OR (jsonb_typeof(r2.referencia -> 'partes') = 'array'
                            AND (CASE WHEN u.parte = 0
                                      THEN EXISTS (SELECT 1 FROM jsonb_array_elements(r2.referencia -> 'partes') e WHERE (-(e #>> '{}')::bigint) / 10 = u.clave)
                                      ELSE (r2.referencia -> 'partes') @> to_jsonb(u.clave_item) END)))
                 LIMIT 1) AS en_otra
          FROM u CROSS JOIN l
          LEFT JOIN fin.movimiento_liquidacion a ON a.tramo_id = u.clave AND a.chofer_id = l.chofer_id AND a.parte = u.parte),
    v AS (
        SELECT m.*,
               (m.desde AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_desde,
               (m.hasta AT TIME ZONE 'America/Argentina/Mendoza')::date AS f_hasta,
               CASE WHEN m.ajustado AND m.a_km IS NOT NULL THEN m.a_km ELSE m.km_l END AS v_km,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_canon ELSE m.canon_l END AS v_canon,
               CASE WHEN m.ajustado AND m.a_canon IS NOT NULL THEN m.a_moneda ELSE m.moneda_l END AS v_moneda
          FROM m)
    SELECT v.clave_item, 'Op. ' || coalesce(v.operacion::text, '—') || coalesce(' · ' || v.tractor, ''),
           v.f_desde, v.f_hasta, v.linea, v.recorrido, v.v_km, v.v_canon, v.v_moneda,
           CASE WHEN v.v_canon IS NULL THEN NULL WHEN v.v_moneda = ref.fn_moneda_base() THEN v.v_canon
                ELSE ops.fn_a_moneda_base(v.v_canon, v.v_moneda, v.f_hasta) END,
           CASE WHEN v.liquidar IS FALSE THEN 'no_se_liquida'
                WHEN v.en_otra IS NOT NULL THEN 'en_otra'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'despues_baja'
                WHEN v.ajustado THEN 'incluido'
                WHEN NOT v.con_carga THEN 'vacio'
                WHEN NOT v.con_linea THEN 'sin_linea'
                ELSE 'incluido' END,
           CASE WHEN v.liquidar IS FALSE THEN v.motivo
                WHEN v.en_otra IS NOT NULL THEN 'Ya está en la liquidación ' || v.en_otra
                WHEN v.fecha_egreso IS NOT NULL AND v.f_desde > v.fecha_egreso THEN 'Empezó después de la baja del chofer (' || to_char(v.fecha_egreso, 'DD/MM/YYYY') || ')'
                WHEN v.ajustado THEN 'Ajustado: ' || v.motivo
                WHEN NOT v.con_carga THEN 'Vacío: no se paga'
                WHEN NOT v.con_linea THEN 'No hay una línea con este recorrido: si corresponde, poné el bono y los km'
                WHEN v.canon_l IS NULL THEN 'La línea ' || v.linea || ' no tiene bono y no hay líneas con bono que la armen: cargalo en la línea o ajustalo acá'
                WHEN v.fecha_egreso IS NOT NULL AND v.f_hasta > v.fecha_egreso THEN 'Terminó después de la baja: revisá que lo haya hecho él'
                ELSE v.armado END,
           coalesce(v.ajustado, false), v.motivo, CASE WHEN v.parte = 0 THEN 'operacion' ELSE 'estimada' END, v.f_desde, v.f_hasta
      FROM v
     ORDER BY v.desde, v.clave, v.parte
$f$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: los tramos usan las líneas del viaje del chofer cuando coinciden con Operaciones' AS resultado;
