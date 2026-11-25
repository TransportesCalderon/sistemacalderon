-- La liquidación es mensual: básico proporcional y viáticos por mes calendario
--   · Las novedades de tramos (bono por tramo y km) siguen del 27 al 26 (corte de Operaciones).
--   · Viáticos: los días trabajados del mes calendario (noviembre = del 1 al 30), cortados en la baja del chofer.
--   · Básico: proporcional a los días del mes en que el chofer estuvo en la empresa (desde el ingreso, hasta la baja):
--     básico × días / días del mes. Ejemplo: baja el 10/11 → 10 de 30 días.
-- Va después de la 20261126090000. No cambia web.version_base.

-- Básico proporcional a los días del mes en la empresa
CREATE OR REPLACE FUNCTION fin.fn_liq_basico(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; ch mae.chofer%ROWTYPE; r fin.liquidacion_renglon%ROWTYPE;
        v_ini date; v_fin date; v_mes int; v_dias int;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    SELECT * INTO ch FROM mae.chofer WHERE id = l.chofer_id;
    SELECT * INTO r FROM fin.liquidacion_renglon
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo = 'SUELDO_FIJO' AND eliminado_en IS NULL LIMIT 1;
    IF NOT FOUND OR coalesce(r.unitario, 0) <= 0 THEN RETURN; END IF;
    v_ini := greatest(l.periodo, coalesce(ch.fecha_ingreso, l.periodo));
    v_fin := least((l.periodo + interval '1 month - 1 day')::date, coalesce(ch.fecha_egreso, '9999-12-31'));
    v_mes := extract(day FROM (l.periodo + interval '1 month - 1 day'))::int;
    v_dias := greatest(v_fin - v_ini + 1, 0);
    IF v_dias >= v_mes THEN RETURN; END IF;   -- mes completo: queda el básico entero
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now() WHERE id = r.id;
    PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'SUELDO_FIJO', format('Sueldo fijo (%s de %s días)', v_dias, v_mes), r.tipo,
                               v_dias, r.unitario, round(r.unitario * v_dias / v_mes),
                               coalesce(r.referencia, '{}'::jsonb) || jsonb_build_object('dias', v_dias, 'dias_mes', v_mes, 'desde', v_ini, 'hasta', v_fin), 10);
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;
REVOKE ALL ON FUNCTION fin.fn_liq_basico(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_preparar_liquidacion(p_chofer bigint, p_periodo date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_liq bigint;
BEGIN
    v_liq := fin.fn_preparar_liquidacion_sin_pasos(p_chofer, p_periodo);
    PERFORM fin.fn_liq_basico(v_liq);
    PERFORM fin.fn_liq_tramos(v_liq);
    PERFORM fin.fn_liq_viatico(v_liq);
    PERFORM fin.fn_liq_bono(v_liq);
    RETURN v_liq;
END $f$;

-- Viáticos: días trabajados del mes calendario
CREATE OR REPLACE FUNCTION fin.fn_liq_viatico(p_liq bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE l fin.liquidacion_mensual%ROWTYPE; v_dia numeric := ref.fn_parametro_num('fin.viatico_por_dia', 10000); v_n integer; v_fechas jsonb;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo = 'VIATICO' AND eliminado_en IS NULL;
    SELECT count(*), coalesce(jsonb_agg(x.fecha ORDER BY x.fecha), '[]') INTO v_n, v_fechas
      FROM fin.fn_dias_chofer(l.chofer_id, l.periodo, (l.periodo + interval '1 month - 1 day')::date) x WHERE x.trabajado;
    IF coalesce(v_dia, 0) > 0 THEN
        PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'VIATICO', format('Viáticos (%s día%s × %s)', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END,
                                   translate(to_char(v_dia, 'FM999G999G999'), ',', '.')),
                                   'no_remunerativo', v_n, v_dia, v_n * v_dia, jsonb_build_object('dias', v_fechas), 35);
    END IF;
    PERFORM fin.fn_liq_totales(p_liq);
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_dias_trabajados(p_chofer bigint, p_desde date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r record;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti','operaciones','gerencia','finanzas'], 'Los días trabajados los ven RRHH, Operaciones, Gerencia, Finanzas o TI');
    IF p_hasta IS NULL AND p_desde IS NOT NULL THEN
        -- Los viáticos se pagan por mes calendario (del 1 al último día)
        RETURN fin.fn_dias_trabajados(p_chofer, date_trunc('month', p_desde)::date, (date_trunc('month', p_desde) + interval '1 month - 1 day')::date)
               || jsonb_build_object('periodo', date_trunc('month', p_desde)::date);
    END IF;
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 62 THEN
        RAISE EXCEPTION 'Rango de fechas inválido' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
        'desde', p_desde, 'hasta', p_hasta,
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                             'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                            FROM fin.fn_dias_chofer(p_chofer, p_desde, p_hasta) x), '[]'::jsonb),
        'bloqueado', EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = p_chofer AND l.estado IN ('aprobada','pagada')
                               AND l.eliminado_en IS NULL AND l.periodo <= p_hasta AND (l.periodo + interval '1 month - 1 day')::date >= p_desde));
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_guardar_dia_trabajado(p_chofer bigint, p_fecha date, p_trabajado boolean, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint; v_liq bigint;
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti','operaciones'], 'Los días trabajados los corrigen RRHH, Operaciones o TI');
    IF NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = p_chofer AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El chofer no existe' USING ERRCODE = 'P0002';
    END IF;
    IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Argentina/Mendoza')::date THEN
        RAISE EXCEPTION 'Elegí un día que ya pasó' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = p_chofer AND l.estado IN ('aprobada','pagada')
                 AND l.eliminado_en IS NULL AND l.periodo = date_trunc('month', p_fecha)::date) THEN
        RAISE EXCEPTION 'La liquidación de ese día ya está aprobada: para cambiarlo, RRHH tiene que reabrirla' USING ERRCODE = '55000';
    END IF;
    IF p_trabajado IS NULL THEN
        DELETE FROM fin.dia_trabajado_ajuste WHERE chofer_id = p_chofer AND fecha = p_fecha;
    ELSE
        IF nullif(btrim(p_motivo), '') IS NULL OR length(btrim(p_motivo)) < 3 THEN
            RAISE EXCEPTION 'Escribí por qué (por ejemplo: movió semirremolques en la base, estuvo de descanso)' USING ERRCODE = '22023';
        END IF;
        INSERT INTO fin.dia_trabajado_ajuste (chofer_id, fecha, trabajado, motivo, creado_por)
        VALUES (p_chofer, p_fecha, p_trabajado, left(btrim(p_motivo), 300), v_usr)
        ON CONFLICT (chofer_id, fecha) DO UPDATE SET trabajado = EXCLUDED.trabajado, motivo = EXCLUDED.motivo,
                                                    creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    -- Si hay un borrador de ese período, los viáticos se actualizan solos
    SELECT id INTO v_liq FROM fin.liquidacion_mensual
     WHERE chofer_id = p_chofer AND estado = 'borrador' AND eliminado_en IS NULL AND periodo = date_trunc('month', p_fecha)::date;
    IF v_liq IS NOT NULL THEN PERFORM fin.fn_liq_viatico(v_liq); END IF;
    RETURN jsonb_build_object('liquidacion_id', v_liq);
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_liquidacion_json(p_liq bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    SELECT fin.fn_liquidacion_json_sin_pasos(p_liq) || jsonb_build_object(
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias_trabajados', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                                        'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                                       FROM fin.liquidacion_mensual l CROSS JOIN LATERAL fin.fn_dias_chofer(l.chofer_id, l.periodo, (l.periodo + interval '1 month - 1 day')::date) x
                                      WHERE l.id = p_liq), '[]'::jsonb),
        'bono_desempeno', fin.fn_bono_propuesta(p_liq),
        'colaboradores', (SELECT jsonb_build_object('imponible', g.col_imponible, 'no_imponible', g.col_no_imponible, 'gratificacion', g.col_gratificacion,
                                                    'afp', g.col_afp, 'salud', g.col_salud, 'cesantia', g.col_cesantia, 'impuesto', g.col_impuesto,
                                                    'otros_descuentos', g.col_otros_descuentos, 'liquido', g.col_liquido,
                                                    'aporte_empleador', g.col_aporte_empleador, 'pdf_ruta', g.col_pdf_ruta, 'cargado_en', g.col_cargado_en)
                            FROM fin.liquidacion_legal g WHERE g.liquidacion_id = p_liq AND g.eliminado_en IS NULL AND g.col_liquido IS NOT NULL),
        'baja_chofer', (SELECT ch.fecha_egreso FROM fin.liquidacion_mensual l JOIN mae.chofer ch ON ch.id = l.chofer_id WHERE l.id = p_liq),
        'tramos', coalesce((SELECT jsonb_agg(jsonb_build_object('item_id', x.item_id, 'viaje', x.viaje, 'salida', x.salida, 'llegada', x.llegada,
                                                               'fuente_fecha', x.fuente_fecha, 'viaje_salida', x.viaje_salida, 'viaje_llegada', x.viaje_llegada,
                                                               'linea', x.linea, 'recorrido', x.recorrido, 'km', x.km, 'canon', x.canon,
                                                               'canon_moneda', x.canon_moneda, 'canon_base', x.canon_base, 'estado', x.estado,
                                                               'detalle', x.detalle, 'ajustado', x.ajustado, 'motivo', x.motivo)
                                             ORDER BY x.viaje_salida, x.viaje, x.item_id)
                              FROM fin.fn_tramos_liquidacion(p_liq) x), '[]'::jsonb))
$function$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: básico proporcional y viáticos por mes calendario' AS resultado;
