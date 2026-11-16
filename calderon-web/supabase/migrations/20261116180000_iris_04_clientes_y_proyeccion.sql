-- Iris 04 · Etapa 2 (segunda parte): clientes, proyección de ganancia e IVA del combustible
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 03 aplicada.
-- Solo agrega una lectura y reglas a las instrucciones. No toca datos. Se puede correr más de una vez.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_cuenta_viaje(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que correr iris_03_cuenta_de_viaje.sql';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_negocio_clientes(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}');
    v_dias integer := coalesce(nullif(e ->> 'dias', '')::integer, 30);
    v_hoy date := mae.fn_hoy(); v_desde date;
    v_fijo numeric := ref.fn_parametro_num('ia.costeo_fijo_dia_usd', 119.5) + ref.fn_parametro_num('ia.costeo_chofer_dia_usd', 58);
    v_neu numeric := ref.fn_parametro_num('ia.costeo_neumaticos_km_usd', 0.028);
    v_cc numeric := ref.fn_parametro_num('ia.costeo_consumo_cargado', 38.7);
    v_tc numeric; v_litro numeric; v_mes numeric;
    v_clientes jsonb; v_tot record; v_iva record; v_cobro jsonb;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF v_dias NOT BETWEEN 7 AND 366 THEN RAISE EXCEPTION 'El período tiene que ser de 7 a 366 días' USING ERRCODE = '22023'; END IF;
    v_desde := v_hoy - v_dias; v_mes := 30.4 / v_dias;
    SELECT tc.tasa INTO v_tc FROM fin.tipo_cambio tc
     WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.fecha <= v_hoy ORDER BY tc.fecha DESC LIMIT 1;
    IF v_tc IS NULL THEN RAISE EXCEPTION 'No hay tipo de cambio USD a CLP cargado' USING ERRCODE = '55000'; END IF;
    v_litro := ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630) / v_tc;

    CREATE TEMP TABLE IF NOT EXISTS _iris_ops (cliente_id bigint, linea text, usd numeric, costo numeric, medido boolean, sin_km boolean) ON COMMIT DROP;
    TRUNCATE _iris_ops;
    INSERT INTO _iris_ops
    SELECT s.cliente_id, coalesce(l.codigo, 'sin línea'),
           ven.fn_a_usd(s.precio_viaje, s.precio_moneda::text, coalesce(s.fecha_operacion, v_hoy)),
           -- Costo estimado del tramo cargado: km de la línea y días reales del viaje (si no hay, 450 km por día)
           CASE WHEN l.distancia_km > 0 THEN
               l.distancia_km * v_cc / 100 * v_litro + l.distancia_km * v_neu
               + v_fijo * CASE WHEN s.fecha_real_fin > s.fecha_real_inicio
                               THEN least(greatest(extract(epoch FROM s.fecha_real_fin - s.fecha_real_inicio) / 86400, 1), 15)
                               ELSE greatest(round(l.distancia_km / 450 * 2) / 2, 1) END END,
           s.fecha_real_fin > s.fecha_real_inicio, coalesce(l.distancia_km, 0) = 0
      FROM ops.servicio_comercial s LEFT JOIN mae.linea l ON l.id = s.linea_id
     WHERE s.eliminado_en IS NULL AND s.estado <> 'cancelado'
       AND coalesce(s.fecha_operacion, (s.creado_en AT TIME ZONE 'America/Argentina/Mendoza')::date) BETWEEN v_desde AND v_hoy;

    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.ganancia_estimada_usd DESC NULLS LAST, q.viajes DESC), '[]') INTO v_clientes FROM (
        SELECT coalesce(c.nombre_fantasia, c.razon_social) AS cliente,
               count(*) AS viajes, round(count(*) * v_mes, 1) AS viajes_por_mes,
               count(*) FILTER (WHERE o.usd IS NULL) AS viajes_sin_precio,
               round(avg(o.usd)) AS precio_promedio_usd, round(sum(o.usd)) AS ingreso_usd,
               round(sum(o.usd - o.costo) FILTER (WHERE o.usd IS NOT NULL AND o.costo IS NOT NULL)) AS ganancia_estimada_usd,
               round(100 * sum(o.usd - o.costo) FILTER (WHERE o.usd IS NOT NULL AND o.costo IS NOT NULL)
                     / nullif(sum(o.usd) FILTER (WHERE o.usd IS NOT NULL AND o.costo IS NOT NULL), 0)) AS margen_estimado_pct,
               round(avg(o.usd - o.costo) FILTER (WHERE o.usd IS NOT NULL AND o.costo IS NOT NULL)) AS ganancia_por_viaje_usd,
               round(sum(o.usd - o.costo) FILTER (WHERE o.usd IS NOT NULL AND o.costo IS NOT NULL) * v_mes) AS ganancia_por_mes_usd,
               count(*) FILTER (WHERE NOT coalesce(o.medido, false)) AS viajes_con_dias_estimados,
               (SELECT string_agg(z.linea || ' (' || z.n || ')', ', ' ORDER BY z.n DESC)
                  FROM (SELECT o2.linea, count(*) AS n FROM _iris_ops o2 WHERE o2.cliente_id = o.cliente_id GROUP BY 1 ORDER BY 2 DESC LIMIT 4) z) AS lineas,
               c.condicion_pago_dias AS plazo_cargado_dias,
               (SELECT round(avg(f.cobrada_en::date - f.fecha_emision::date)) FROM ven.factura f
                 WHERE f.cliente_id = o.cliente_id AND f.eliminado_en IS NULL AND f.estado !~* '^anul' AND f.cobrada_en IS NOT NULL
                   AND f.fecha_emision >= v_hoy - 180) AS dias_reales_de_cobro,
               (SELECT round(sum(ven.fn_a_usd(f.total, f.moneda::text, f.fecha_emision::date))) FROM ven.factura f
                 WHERE f.cliente_id = o.cliente_id AND f.eliminado_en IS NULL AND f.estado !~* '^anul' AND f.fecha_emision IS NOT NULL
                   AND f.cobrada_en IS NULL) AS sin_cobrar_usd,
               (SELECT round(sum(ven.fn_a_usd(f.total, f.moneda::text, f.fecha_emision::date))) FROM ven.factura f
                 WHERE f.cliente_id = o.cliente_id AND f.eliminado_en IS NULL AND f.estado !~* '^anul' AND f.fecha_emision IS NOT NULL
                   AND f.cobrada_en IS NULL AND f.vence::date < v_hoy) AS vencido_usd
          FROM _iris_ops o JOIN mae.cliente c ON c.id = o.cliente_id
         GROUP BY o.cliente_id, c.nombre_fantasia, c.razon_social, c.condicion_pago_dias) q;

    SELECT count(*) AS viajes, round(sum(usd)) AS ingreso,
           round(sum(usd - costo) FILTER (WHERE usd IS NOT NULL AND costo IS NOT NULL)) AS ganancia,
           count(*) FILTER (WHERE usd IS NULL) AS sin_precio, count(*) FILTER (WHERE sin_km) AS sin_km
      INTO v_tot FROM _iris_ops;

    -- IVA del combustible cargado en Chile (19 % incluido en el precio): lo que se puede recuperar
    SELECT round(sum(k.litros)) AS litros, round(sum(k.importe_original)) AS clp, round(sum(k.importe_original) * 19 / 119 / v_tc) AS iva_usd
      INTO v_iva
      FROM fue.carga_combustible k JOIN mae.estacion_servicio es ON es.id = k.estacion_id
     WHERE k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada' AND k.moneda = 'CLP' AND es.pais = 'CL'
       AND (k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN v_desde AND v_hoy;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'periodo', jsonb_build_object('desde', to_char(v_desde, 'DD/MM/YYYY'), 'hasta', to_char(v_hoy, 'DD/MM/YYYY'), 'dias', v_dias),
        'clientes', v_clientes,
        'total', jsonb_build_object('viajes', v_tot.viajes, 'ingreso_usd', v_tot.ingreso, 'ganancia_estimada_usd', v_tot.ganancia,
                                    'viajes_sin_precio', nullif(v_tot.sin_precio, 0), 'viajes_sin_km_de_linea', nullif(v_tot.sin_km, 0)),
        'proyeccion_a_este_ritmo', jsonb_build_object('viajes_por_mes', round(v_tot.viajes * v_mes), 'ingreso_por_mes_usd', round(v_tot.ingreso * v_mes),
                                    'ganancia_por_mes_usd', round(v_tot.ganancia * v_mes), 'ganancia_por_anio_usd', round(v_tot.ganancia * v_mes * 12)),
        'iva_combustible_chile', jsonb_build_object('litros', v_iva.litros, 'pagado_clp', v_iva.clp, 'iva_recuperable_usd', v_iva.iva_usd,
                                    'por_mes_usd', round(v_iva.iva_usd * v_mes), 'por_anio_usd', round(v_iva.iva_usd * v_mes * 12)),
        'como_se_calcula', 'Viajes: operaciones no canceladas del período con su precio pasado a USD. '
            || 'Ganancia ESTIMADA: precio menos el costo del tramo cargado (gasoil, chofer, fijos por día y neumáticos, con los km de la línea y los días reales del viaje; si no hay fechas, 450 km por día). '
            || 'NO descuenta tramos vacíos, peajes ni gastos generales: la ganancia real es menor; para una línea puntual usar «cuenta_viaje» con sus vacíos. '
            || 'Proyección: el ritmo del período llevado a un mes y a doce. IVA: 19 % incluido en lo pagado en estaciones de Chile; se recupera solo si está la factura.'));
END $function$;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('negocio_clientes', 31,
        'Cómo va el negocio por cliente en los últimos días: viajes, viajes por mes, precio promedio, ingreso, ganancia y margen ESTIMADOS, líneas, '
        || 'días reales de cobro, lo que falta cobrar y lo vencido. Trae además el total, la proyección de ganancia por mes y por año a este ritmo, '
        || 'y el IVA del combustible cargado en Chile que se puede recuperar. '
        || 'Usala para: cuál es el mejor cliente, cuánto se gana por mes o por año, cuánto IVA del combustible se recupera, qué cliente conviene cuidar o renegociar.',
        'Clientes y proyección', 'Sumando viajes, precios y cobros por cliente…', '/analisis/rentabilidad',
        '{"type": "object", "properties": {"dias": {"type": "integer", "description": "Cuántos días hacia atrás mirar (7 a 366). Si no se manda: 30."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

CREATE OR REPLACE FUNCTION ia.fn_herramienta(p_codigo text, p_entrada jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb;
BEGIN
    -- Migración 258: precios dudosos. Iris 02: viento en ruta y hora de Mendoza. Iris 03: cuenta del viaje. Iris 04: clientes y proyección.
    IF p_codigo = 'cargas_precio_dudoso' THEN
        r := ia.fn_lectura_cargas_precio(nullif(p_entrada->>'desde', '')::date, nullif(p_entrada->>'hasta', '')::date);
    ELSIF p_codigo IN ('viento_en_ruta', 'cuenta_viaje', 'negocio_clientes') THEN
        IF NOT EXISTS (SELECT 1 FROM ia.asistente_herramienta WHERE codigo = p_codigo AND activa) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Esa lectura no está en la lista del asistente');
        END IF;
        BEGIN
            r := jsonb_build_object('ok', true, 'datos', CASE p_codigo
                    WHEN 'viento_en_ruta' THEN ia.fn_lectura_viento_ruta(p_entrada)
                    WHEN 'cuenta_viaje' THEN ia.fn_lectura_cuenta_viaje(p_entrada)
                    ELSE ia.fn_lectura_negocio_clientes(p_entrada) END);
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;
    ELSE
        r := ia.fn_herramienta_base(p_codigo, p_entrada);
    END IF;
    IF r ? 'datos' THEN r := jsonb_set(r, '{datos}', ia.fn_hora_local(r -> 'datos')); END IF;
    RETURN r;
END $function$;

DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'Redactar no es cambiar nada en el sistema.''';
    v_nuevo constant text := $t$
        || ' 21) Para el mejor cliente, cuánto se gana por mes o por año y el IVA del combustible, usá «negocio_clientes». '
        || 'El mejor cliente se decide mirando tres cosas juntas y diciéndolas: cuánto deja por mes (volumen por ganancia por viaje), el margen, y cómo paga (días reales de cobro y lo vencido). '
        || 'Decí siempre que esa ganancia es estimada y que no descuenta tramos vacíos ni peajes; si un cliente tiene viajes sin precio, avisalo. '
        || 'Todos los clientes pagan a 30 días: si el plazo cargado dice otra cosa, es un dato mal cargado, no lo uses para comparar. '
        || '22) Cuando pidan una presentación para Gerencia, escribila con títulos «## » (uno por lámina, una idea por lámina, hasta 8 láminas): '
        || 'la situación, la cuenta, qué pasa si no se cambia, la propuesta (pedir / cerrar / no bajar de), y cómo pedirlo. Sin precio fijo ni estadía.'$t$;
BEGIN
    IF v_def LIKE '%negocio_clientes%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 03): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

REVOKE ALL ON FUNCTION ia.fn_lectura_negocio_clientes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_negocio_clientes(jsonb) TO tc_app, tc_admin, tc_lectura;

COMMIT;
