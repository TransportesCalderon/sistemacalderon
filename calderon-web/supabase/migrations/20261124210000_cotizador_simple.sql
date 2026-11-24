-- =====================================================================================
-- Migración 305 · Cotizador simple para Gerencia: precio por km con los costos reales de la empresa
-- =====================================================================================
-- Pedido (24/11/2026): el cotizador pedía demasiados datos. Ya están cargados casi todos los gastos fijos y variables,
-- así que el precio por km tiene que salir de ahí.
--   · ven.fn_costo_km_contable(meses): todos los costos y gastos de la contabilidad (fijos y variables) de los últimos
--     meses completos ÷ los km que hizo toda la flota en esos meses (telemetría; si un camión no tiene, sus cierres de
--     viaje). En USD con el dólar de cada mes. Trae el detalle por mes, las cuentas que más pesan y los camiones sin km.
--     El combustible sale de las cargas del período (la contabilidad puede tenerlo atrasado; se puede cambiar) y
--     quedan afuera las cuentas que no son costo del servicio (por defecto 6.1.13, pagos sin identificar del corte).
--     Gerencia elige la base (meses, si incluye el mes en curso) con ven.fn_guardar_base_costo.
--   · ven.fn_costo_km_usd: primero el contable; si no hay datos, el manual y después el de los viajes (como antes).
--     Con el contable no se suma el canon del chofer aparte (ya está en los costos).
--   · ven.fn_cotizar(origen, destino, ruta, vuelve vacío, regreso, margen, empresa): km de la ruta cargada o, si no hay,
--     del mapa; costo, precio por km y precio del viaje con el margen (20 % por defecto). Solo calcula.
--   · ven.fn_cotizar_guardar(...): lo guarda como cotización para el cliente (con su PDF, como siempre). Si la ruta no
--     existía la crea con los km del mapa; si la empresa no existe, la crea como prospecto.
--   · Gerencia puede guardar cotizaciones (antes solo Ventas y TI).
-- Va después de la 304 del otro chat (carga con tarjeta informada por el chofer). web.version_base = 305.
-- =====================================================================================
BEGIN;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.meses_costo_contable', '3'::jsonb, 'Cotizador: meses completos de contabilidad para el costo por km (Migración 305)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.meses_costo_contable');
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.costo_incluye_mes_actual', '"false"'::jsonb, 'Cotizador: el costo por km incluye el mes en curso hasta ayer (Migración 305)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.costo_incluye_mes_actual');
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.combustible_de_cargas', '"true"'::jsonb, 'Cotizador: el combustible se toma de las cargas del período y no de la contabilidad (Migración 305)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.combustible_de_cargas');
-- Cuentas que no son costo del servicio (por ejemplo, los pagos sin identificar de antes del corte del 18/11)
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.cuentas_fuera_del_costo', '["6.1.13"]'::jsonb, 'Cotizador: cuentas contables que no entran en el costo por km (Migración 305)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.cuentas_fuera_del_costo');
-- Desde cuándo la contabilidad tiene todos los costos (los meses anteriores están incompletos y bajarían el costo)
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ven.costo_contable_desde', '"2026-10-01"'::jsonb, 'Cotizador: primer mes con la contabilidad completa (Migración 305)'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ven.costo_contable_desde');

-- Gerencia también cotiza
CREATE OR REPLACE FUNCTION ven.fn_exigir_ventas()
RETURNS bigint
LANGUAGE sql
STABLE
AS $f$ SELECT ven.fn_exigir(ARRAY['comercial', 'gerencia', 'ti'], 'Esto lo cargan Ventas, Gerencia o TI') $f$;

-- ---------------------------------------------------------------------------------
-- 1 · Costo por km con la contabilidad
-- ---------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS ops.fn_ven_costo_km_contable(integer);
DROP FUNCTION IF EXISTS ven.fn_costo_km_contable(integer);
DROP FUNCTION IF EXISTS ops.fn_ven_guardar_base_costo(integer, boolean, text[]);
DROP FUNCTION IF EXISTS ven.fn_guardar_base_costo(integer, boolean, text[]);
CREATE OR REPLACE FUNCTION ven.fn_costo_km_contable(p_meses integer DEFAULT NULL, p_hasta_hoy boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_n integer := greatest(1, least(12, coalesce(p_meses, ref.fn_parametro_num('ven.meses_costo_contable', 3)::integer)));
    v_hoy_inc boolean := coalesce(p_hasta_hoy, ref.fn_parametro_texto('ven.costo_incluye_mes_actual', 'false') = 'true');
    v_hoy date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
    -- Meses completos; con «hasta hoy», también el mes en curso hasta ayer
    v_hasta date := CASE WHEN v_hoy_inc THEN v_hoy - 1 ELSE date_trunc('month', v_hoy)::date - 1 END;
    v_desde date := greatest((date_trunc('month', v_hasta) - make_interval(months => v_n - 1))::date,
                             coalesce(nullif(ref.fn_parametro_texto('ven.costo_contable_desde', ''), '')::date, '2000-01-01'));
    v_fuera text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce((SELECT valor FROM ref.parametro WHERE codigo = 'ven.cuentas_fuera_del_costo'), '[]')));
    -- El combustible, de las cargas del período (la contabilidad puede tenerlo atrasado); si no, de la contabilidad
    v_cargas boolean := ref.fn_parametro_texto('ven.combustible_de_cargas', 'true') = 'true';
    v_base text := ref.fn_moneda_base(); r jsonb;
BEGIN
    WITH meses AS (
        SELECT m::date AS mes, least((m + interval '1 month - 1 day')::date, v_hasta) AS fin
          FROM generate_series(date_trunc('month', v_desde), date_trunc('month', v_hasta), interval '1 month') m
         WHERE v_hasta >= v_desde
    ), costos AS (
        SELECT date_trunc('month', a.fecha)::date AS mes, c.codigo, c.nombre, sum(l.debe - l.haber) AS v
          FROM fin.asiento a JOIN fin.asiento_linea l ON l.asiento_id = a.id JOIN fin.cuenta_contable c ON c.id = l.cuenta_id
         WHERE a.fecha BETWEEN v_desde AND v_hasta AND c.tipo IN ('costo', 'gasto') AND NOT (c.codigo = ANY (v_fuera))
         GROUP BY 1, 2, 3
    ), costos_conta AS (
        SELECT x.mes, x.codigo, x.nombre, ven.fn_a_usd(x.v, v_base, m.fin) AS usd FROM costos x JOIN meses m ON m.mes = x.mes
    ), km_tel AS (
        SELECT date_trunc('month', a.fecha)::date AS mes, a.camion_id, sum(a.km) AS km
          FROM tel.agregado_diario_camion a
         WHERE a.fecha BETWEEN v_desde AND v_hasta AND a.km > 0 AND a.km < 2000
         GROUP BY 1, 2
    ), km_cierres AS (
        SELECT date_trunc('month', (v.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza'))::date AS mes, v.camion_id, sum(v.km_recorridos) AS km
          FROM fue.cierre_viaje v
         WHERE v.eliminado_en IS NULL AND v.estado <> 'anulado' AND v.km_recorridos > 0
           AND (v.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN v_desde AND v_hasta
         GROUP BY 1, 2
    ), km_camion AS (
        -- Por camión y mes: la telemetría; si no tiene, lo de sus cierres de viaje
        SELECT coalesce(t.mes, c.mes) AS mes, coalesce(t.camion_id, c.camion_id) AS camion_id,
               coalesce(t.km, c.km) AS km, CASE WHEN t.km IS NOT NULL THEN 'telemetria' ELSE 'cierres' END AS fuente
          FROM km_tel t FULL JOIN km_cierres c ON c.mes = t.mes AND c.camion_id = t.camion_id
    ), cargas AS (
        -- Control: el combustible cargado en el período (para ver si la contabilidad lo tiene completo)
        SELECT date_trunc('month', (k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza'))::date AS mes, sum(k.importe_moneda_base) AS v
          FROM fue.carga_combustible k
         WHERE k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada'
           AND (k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN v_desde AND v_hasta
         GROUP BY 1
    ), costos_usd AS (
        SELECT mes, codigo, nombre, usd FROM costos_conta WHERE NOT (v_cargas AND nombre ILIKE '%combustible%')
        UNION ALL
        SELECT g.mes, 'cargas', 'Combustible (cargas del período)', ven.fn_a_usd(g.v, v_base, m.fin)
          FROM cargas g JOIN meses m ON m.mes = g.mes WHERE v_cargas
    ), por_mes AS (
        SELECT m.mes, m.fin,
               (SELECT round(sum(usd), 2) FROM costos_usd x WHERE x.mes = m.mes) AS costo_usd,
               (SELECT round(sum(usd), 2) FROM costos_conta x WHERE x.mes = m.mes AND x.nombre ILIKE '%combustible%') AS combustible_usd,
               (SELECT round(ven.fn_a_usd(v, v_base, m.fin), 2) FROM cargas g WHERE g.mes = m.mes) AS cargas_usd,
               (SELECT count(*) FILTER (WHERE usd IS NULL) FROM costos_usd x WHERE x.mes = m.mes) AS sin_dolar,
               (SELECT round(sum(km)) FROM km_camion k WHERE k.mes = m.mes) AS km,
               (SELECT count(DISTINCT camion_id) FROM km_camion k WHERE k.mes = m.mes) AS camiones
          FROM meses m
    ), validos AS (
        SELECT * FROM por_mes WHERE coalesce(costo_usd, 0) > 0 AND coalesce(km, 0) > 0
    )
    SELECT jsonb_build_object(
        'costo_km_usd', (SELECT round(sum(costo_usd) / nullif(sum(km), 0), 4) FROM validos),
        'costo_usd', (SELECT sum(costo_usd) FROM validos),
        'km', (SELECT sum(km) FROM validos),
        'desde', (SELECT min(mes) FROM validos),
        'hasta', (SELECT max(fin) FROM validos),
        'meses_pedidos', v_n, 'hasta_hoy', v_hoy_inc, 'cuentas_fuera', to_jsonb(v_fuera), 'combustible_de_cargas', v_cargas,
        'combustible_contable_usd', (SELECT sum(combustible_usd) FROM validos),
        'combustible_cargas_usd', (SELECT sum(cargas_usd) FROM validos),
        'meses', coalesce((SELECT jsonb_agg(jsonb_build_object('mes', mes, 'hasta', fin, 'costo_usd', costo_usd, 'km', km, 'camiones', camiones,
                                                              'costo_km_usd', round(costo_usd / nullif(km, 0), 4),
                                                              'combustible_usd', combustible_usd, 'cargas_usd', cargas_usd,
                                                              'usado', coalesce(costo_usd, 0) > 0 AND coalesce(km, 0) > 0,
                                                              'sin_dolar', sin_dolar) ORDER BY mes) FROM por_mes), '[]'),
        'cuentas', coalesce((SELECT jsonb_agg(x ORDER BY (x ->> 'usd')::numeric DESC) FROM (
                     SELECT jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'usd', round(sum(c.usd), 0),
                                               'pct', round(100 * sum(c.usd) / nullif((SELECT sum(costo_usd) FROM validos), 0), 1)) AS x
                       FROM costos_usd c WHERE c.mes IN (SELECT mes FROM validos) AND c.usd IS NOT NULL
                      GROUP BY c.codigo, c.nombre ORDER BY sum(c.usd) DESC LIMIT 12) t), '[]'),
        'km_de_cierres', (SELECT round(sum(km)) FROM km_camion WHERE fuente = 'cierres' AND mes IN (SELECT mes FROM validos)),
        'camiones_sin_km', coalesce((SELECT jsonb_agg(m.patente ORDER BY m.patente) FROM mae.camion m
                                      WHERE m.eliminado_en IS NULL AND coalesce(m.estado, '') NOT IN ('baja', 'vendido', 'inactivo')
                                        AND NOT EXISTS (SELECT 1 FROM km_camion k WHERE k.camion_id = m.id AND k.mes IN (SELECT mes FROM validos))), '[]'))
      INTO r;
    RETURN r || jsonb_build_object('fuente', 'contable');
END $f$;

-- Gerencia elige la base del costo (meses, si incluye el mes en curso y qué cuentas quedan afuera)
CREATE OR REPLACE FUNCTION ven.fn_guardar_base_costo(p_meses integer, p_hasta_hoy boolean, p_cuentas_fuera text[] DEFAULT NULL, p_combustible_de_cargas boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := ven.fn_exigir_ventas();
BEGIN
    IF p_meses IS NULL OR p_meses < 1 OR p_meses > 12 THEN RAISE EXCEPTION 'Elegí de 1 a 12 meses' USING ERRCODE = '22023'; END IF;
    UPDATE ref.parametro SET valor = to_jsonb(p_meses), actualizado_por = v_usr, actualizado_en = now() WHERE codigo = 'ven.meses_costo_contable';
    UPDATE ref.parametro SET valor = to_jsonb(coalesce(p_hasta_hoy, false)::text), actualizado_por = v_usr, actualizado_en = now()
     WHERE codigo = 'ven.costo_incluye_mes_actual';
    IF p_combustible_de_cargas IS NOT NULL THEN
        UPDATE ref.parametro SET valor = to_jsonb(p_combustible_de_cargas::text), actualizado_por = v_usr, actualizado_en = now()
         WHERE codigo = 'ven.combustible_de_cargas';
    END IF;
    IF p_cuentas_fuera IS NOT NULL THEN
        UPDATE ref.parametro SET valor = to_jsonb(p_cuentas_fuera), actualizado_por = v_usr, actualizado_en = now() WHERE codigo = 'ven.cuentas_fuera_del_costo';
    END IF;
    RETURN ven.fn_costo_km_contable(NULL, NULL);
END $f$;

-- El costo por km que usan las cotizaciones: contable → manual → viajes
CREATE OR REPLACE FUNCTION ven.fn_costo_km_usd()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE c jsonb;
BEGIN
    BEGIN
        c := ven.fn_costo_km_contable(NULL, NULL);
    EXCEPTION WHEN OTHERS THEN c := NULL;
    END;
    IF (c ->> 'costo_km_usd') IS NOT NULL THEN
        RETURN jsonb_build_object('costo_km_usd', (c ->> 'costo_km_usd')::numeric, 'fuente', 'contable', 'km', c -> 'km',
                                  'desde', c -> 'desde', 'hasta', c -> 'hasta');
    END IF;
    IF ref.fn_parametro_num('ven.costo_km_manual_usd', 0) > 0 THEN
        RETURN jsonb_build_object('costo_km_usd', ref.fn_parametro_num('ven.costo_km_manual_usd', 0), 'fuente', 'manual');
    END IF;
    RETURN (SELECT jsonb_build_object('costo_km_usd', x.costo_km_usd, 'fuente', 'viajes', 'viajes', x.viajes, 'km', x.km,
                                      'desde', x.desde, 'hasta', x.hasta, 'calculado_en', x.calculado_en)
              FROM ven.costo_referencia x ORDER BY x.id DESC LIMIT 1);
END $f$;

-- Costo de un viaje por una ruta: con el costo contable, el canon ya está adentro
CREATE OR REPLACE FUNCTION ven.fn_costo_viaje(p_linea bigint, p_vuelta_vacia boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l mae.linea%ROWTYPE; c jsonb := ven.fn_costo_km_usd(); v_km numeric; v_canon numeric; v_ckm numeric; v_total numeric;
        v_contable boolean;
BEGIN
    SELECT * INTO l FROM mae.linea WHERE id = p_linea;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_contable := c ->> 'fuente' = 'contable';
    v_km := l.distancia_km * CASE WHEN p_vuelta_vacia THEN 2 ELSE 1 END;
    v_canon := CASE WHEN v_contable THEN NULL ELSE ven.fn_a_usd(l.canon_chofer, l.canon_moneda) END;
    v_ckm := (c ->> 'costo_km_usd')::numeric;
    IF v_km IS NOT NULL AND v_ckm IS NOT NULL AND (v_contable OR l.canon_chofer IS NULL OR v_canon IS NOT NULL) THEN
        v_total := round(v_km * v_ckm + coalesce(v_canon, 0), 2);
    END IF;
    RETURN jsonb_build_object('km', v_km, 'costo_km_usd', v_ckm, 'fuente', c ->> 'fuente', 'canon_usd', v_canon,
        'canon_sin_cotizacion', NOT v_contable AND l.canon_chofer IS NOT NULL AND v_canon IS NULL, 'costo_usd', v_total,
        'falta', CASE WHEN l.distancia_km IS NULL THEN 'La línea no tiene los km cargados'
                      WHEN v_ckm IS NULL THEN 'Falta el costo por km: no hay meses completos con costos y km cargados'
                      WHEN NOT v_contable AND l.canon_chofer IS NOT NULL AND v_canon IS NULL THEN 'Falta la cotización del dólar para el canon' END);
END $f$;

-- ---------------------------------------------------------------------------------
-- 2 · Cotizar: origen, destino y si vuelve vacío
-- ---------------------------------------------------------------------------------
-- Km entre dos lugares: la ruta cargada (la elegida o la primera con km) o el mapa
CREATE OR REPLACE FUNCTION ven.fn_km_entre(p_origen bigint, p_destino bigint, p_linea bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l record; o mae.ubicacion%ROWTYPE; d mae.ubicacion%ROWTYPE; m record;
BEGIN
    SELECT x.id, x.codigo, x.distancia_km INTO l FROM mae.linea x
     WHERE x.eliminado_en IS NULL AND x.distancia_km > 0
       AND ((p_linea IS NOT NULL AND x.id = p_linea) OR (p_linea IS NULL AND x.lugar_retiro_id = p_origen AND x.lugar_entrega_id = p_destino))
     ORDER BY x.activa DESC, x.id LIMIT 1;
    IF l.id IS NOT NULL THEN
        RETURN jsonb_build_object('km', l.distancia_km, 'fuente', 'ruta', 'linea_id', l.id, 'ruta', l.codigo);
    END IF;
    SELECT * INTO o FROM mae.ubicacion WHERE id = p_origen;
    SELECT * INTO d FROM mae.ubicacion WHERE id = p_destino;
    IF o.latitud IS NULL OR d.latitud IS NULL THEN
        RETURN jsonb_build_object('km', NULL, 'fuente', NULL,
            'falta', format('%s no tiene la ubicación en el mapa: cargala en Configuración › Lugares', CASE WHEN o.latitud IS NULL THEN o.nombre ELSE d.nombre END));
    END IF;
    SELECT * INTO m FROM tel.fn_osrm_camino(jsonb_build_array(jsonb_build_object('lat', o.latitud, 'lng', o.longitud),
                                                              jsonb_build_object('lat', d.latitud, 'lng', d.longitud)));
    IF m.km IS NULL THEN RETURN jsonb_build_object('km', NULL, 'fuente', NULL, 'falta', coalesce(m.error, 'El mapa no encontró camino')); END IF;
    RETURN jsonb_build_object('km', round(m.km), 'fuente', 'mapa');
END $f$;

CREATE OR REPLACE FUNCTION ven.fn_cotizar(p_origen bigint, p_destino bigint, p_linea bigint DEFAULT NULL, p_vuelta_vacia boolean DEFAULT false,
                                          p_regreso bigint DEFAULT NULL, p_margen numeric DEFAULT NULL, p_empresa bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    ida jsonb; vuelta jsonb; c jsonb := ven.fn_costo_km_usd(); v_margen numeric := coalesce(p_margen, ref.fn_parametro_num('ven.margen_objetivo_pct', 20));
    v_ckm numeric; v_km_ida numeric; v_km_vacio numeric := 0; v_costo numeric; v_precio numeric; v_cli bigint; v_tarifa numeric; v_tarifa_de text; v_falta text;
    v_lineas jsonb;
BEGIN
    PERFORM ven.fn_exigir_lectura();
    IF p_origen IS NULL OR p_destino IS NULL THEN RAISE EXCEPTION 'Elegí el origen y el destino' USING ERRCODE = '22023'; END IF;
    IF p_origen = p_destino THEN RAISE EXCEPTION 'El origen y el destino son el mismo lugar' USING ERRCODE = '22023'; END IF;
    IF v_margen < 0 OR v_margen > 200 THEN RAISE EXCEPTION 'El margen va de 0 a 200 %%' USING ERRCODE = '22023'; END IF;

    -- Las rutas cargadas entre esos dos lugares (para elegir por dónde)
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'km', x.distancia_km) ORDER BY x.activa DESC, x.id), '[]')
      INTO v_lineas FROM mae.linea x
     WHERE x.eliminado_en IS NULL AND x.lugar_retiro_id = p_origen AND x.lugar_entrega_id = p_destino AND x.distancia_km > 0;

    ida := ven.fn_km_entre(p_origen, p_destino, p_linea);
    v_km_ida := (ida ->> 'km')::numeric;
    IF coalesce(p_vuelta_vacia, false) THEN
        vuelta := ven.fn_km_entre(p_destino, coalesce(p_regreso, p_origen), NULL);
        v_km_vacio := coalesce((vuelta ->> 'km')::numeric, 0);
    END IF;
    v_ckm := (c ->> 'costo_km_usd')::numeric;
    v_falta := coalesce(ida ->> 'falta', vuelta ->> 'falta',
                        CASE WHEN v_ckm IS NULL THEN 'Falta el costo por km: no hay meses completos con costos y km cargados' END);
    IF v_km_ida IS NOT NULL AND v_ckm IS NOT NULL THEN
        v_costo := round((v_km_ida + v_km_vacio) * v_ckm, 2);
        v_precio := ceil(v_costo * (1 + v_margen / 100) / 10) * 10;
    END IF;
    SELECT cliente_id INTO v_cli FROM ven.empresa WHERE id = p_empresa;
    IF (ida ->> 'linea_id') IS NOT NULL THEN
        SELECT t.precio_usd, CASE WHEN t.de_cliente THEN 'cliente' ELSE 'general' END INTO v_tarifa, v_tarifa_de
          FROM ven.fn_tarifa_vigente((ida ->> 'linea_id')::bigint, v_cli, 'viaje', NULL) t;
    END IF;
    RETURN jsonb_build_object(
        'origen', (SELECT nombre FROM mae.ubicacion WHERE id = p_origen), 'destino', (SELECT nombre FROM mae.ubicacion WHERE id = p_destino),
        'regreso', CASE WHEN p_vuelta_vacia THEN (SELECT nombre FROM mae.ubicacion WHERE id = coalesce(p_regreso, p_origen)) END,
        'rutas', v_lineas, 'linea_id', ida -> 'linea_id', 'ruta', ida -> 'ruta',
        'km_cargado', v_km_ida, 'fuente_km', ida -> 'fuente', 'km_vacio', v_km_vacio, 'fuente_km_vacio', vuelta -> 'fuente',
        'km_total', v_km_ida + v_km_vacio,
        'costo_km_usd', v_ckm, 'fuente_costo', c -> 'fuente', 'costo_desde', c -> 'desde', 'costo_hasta', c -> 'hasta',
        'costo_usd', v_costo, 'margen_pct', v_margen, 'precio_usd', v_precio,
        'precio_km_usd', round(v_precio / nullif(v_km_ida + v_km_vacio, 0), 3),
        'precio_km_cargado_usd', round(v_precio / nullif(v_km_ida, 0), 3),
        'tarifa_vigente_usd', v_tarifa, 'tarifa_de', v_tarifa_de,
        'falta', v_falta);
END $f$;

-- Guardar como cotización para el cliente
CREATE OR REPLACE FUNCTION ven.fn_cotizar_guardar(p_datos jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    d jsonb := coalesce(p_datos, '{}'); v_emp bigint := nullif(d ->> 'empresa_id', '')::bigint; v_nombre text := btrim(coalesce(d ->> 'empresa_nombre', ''));
    v_origen bigint := nullif(d ->> 'origen_id', '')::bigint; v_destino bigint := nullif(d ->> 'destino_id', '')::bigint;
    v_linea bigint := nullif(d ->> 'linea_id', '')::bigint; v_vv boolean := coalesce((d ->> 'vuelta_vacia')::boolean, false);
    v_precio numeric := nullif(d ->> 'precio_usd', '')::numeric; v_viajes numeric := coalesce(nullif(d ->> 'viajes', '')::numeric, 1);
    q jsonb; o mae.ubicacion%ROWTYPE; de mae.ubicacion%ROWTYPE; v_cod text; i integer := 1;
BEGIN
    PERFORM ven.fn_exigir_ventas();
    IF v_precio IS NULL OR v_precio <= 0 THEN RAISE EXCEPTION 'Falta el precio' USING ERRCODE = '22023'; END IF;
    IF v_viajes <= 0 THEN RAISE EXCEPTION '¿Cuántos viajes son?' USING ERRCODE = '22023'; END IF;
    -- La empresa: la elegida o, si se escribió un nombre nuevo, un prospecto
    IF v_emp IS NULL THEN
        IF length(v_nombre) < 2 THEN RAISE EXCEPTION 'Elegí la empresa o escribí su nombre' USING ERRCODE = '22023'; END IF;
        SELECT id INTO v_emp FROM ven.empresa WHERE lower(btrim(nombre)) = lower(v_nombre) AND eliminado_en IS NULL LIMIT 1;
        IF v_emp IS NULL THEN v_emp := ven.fn_guardar_empresa(NULL, jsonb_build_object('nombre', v_nombre, 'origen', 'otro')); END IF;
    END IF;
    -- La ruta: la elegida, una cargada entre esos lugares o una nueva con los km del mapa
    q := ven.fn_cotizar(v_origen, v_destino, v_linea, v_vv, NULL, NULL, v_emp);
    v_linea := coalesce(v_linea, nullif(q ->> 'linea_id', '')::bigint);
    IF v_linea IS NULL THEN
        IF (q ->> 'km_cargado') IS NULL THEN RAISE EXCEPTION '%', coalesce(q ->> 'falta', 'No se pudieron calcular los km') USING ERRCODE = '22023'; END IF;
        SELECT * INTO o FROM mae.ubicacion WHERE id = v_origen;
        SELECT * INTO de FROM mae.ubicacion WHERE id = v_destino;
        v_cod := left(regexp_replace(upper(coalesce(o.codigo, o.nombre)), '[^A-Z0-9]', '', 'g'), 12) || '-'
              || left(regexp_replace(upper(coalesce(de.codigo, de.nombre)), '[^A-Z0-9]', '', 'g'), 12);
        WHILE EXISTS (SELECT 1 FROM mae.linea WHERE codigo = v_cod || CASE WHEN i > 1 THEN '-' || i ELSE '' END AND eliminado_en IS NULL) LOOP
            i := i + 1;
        END LOOP;
        v_cod := v_cod || CASE WHEN i > 1 THEN '-' || i ELSE '' END;
        INSERT INTO mae.linea (codigo, lugar_retiro_id, lugar_entrega_id, distancia_km, cruza_frontera, creado_por, actualizado_por)
        VALUES (v_cod, v_origen, v_destino, (q ->> 'km_cargado')::numeric, coalesce(o.pais, '') <> coalesce(de.pais, ''),
                aud.fn_usuario_actual(), aud.fn_usuario_actual())
        RETURNING id INTO v_linea;
    END IF;
    RETURN ven.fn_guardar_cotizacion(NULL, NULL, jsonb_build_object(
        'empresa_id', v_emp, 'observacion', nullif(btrim(coalesce(d ->> 'observacion', '')), ''),
        'renglones', jsonb_build_array(jsonb_build_object(
            'tipo', 'flete', 'linea_id', v_linea, 'unidad', 'viaje', 'cantidad', v_viajes, 'vuelta_vacia', v_vv, 'precio_usd', v_precio,
            'descripcion', 'Flete ' || ven.fn_nombre_linea(v_linea)
                           || CASE WHEN v_vv THEN ' (incluye el regreso vacío)' ELSE '' END))));
END $f$;

-- Puertas desde la web (schema ops), con los permisos de las vecinas
CREATE OR REPLACE FUNCTION ops.fn_ven_costo_km_contable(p_meses integer DEFAULT NULL, p_hasta_hoy boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ BEGIN PERFORM ven.fn_exigir_lectura(); RETURN ven.fn_costo_km_contable(p_meses, p_hasta_hoy); END $f$;
CREATE OR REPLACE FUNCTION ops.fn_ven_guardar_base_costo(p_meses integer, p_hasta_hoy boolean, p_cuentas_fuera text[] DEFAULT NULL, p_combustible_de_cargas boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_guardar_base_costo(p_meses, p_hasta_hoy, p_cuentas_fuera, p_combustible_de_cargas) $f$;
CREATE OR REPLACE FUNCTION ops.fn_ven_cotizar(p_origen bigint, p_destino bigint, p_linea bigint DEFAULT NULL, p_vuelta_vacia boolean DEFAULT false,
                                              p_regreso bigint DEFAULT NULL, p_margen numeric DEFAULT NULL, p_empresa bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cotizar(p_origen, p_destino, p_linea, p_vuelta_vacia, p_regreso, p_margen, p_empresa) $f$;
CREATE OR REPLACE FUNCTION ops.fn_ven_cotizar_guardar(p_datos jsonb)
RETURNS bigint LANGUAGE sql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT ven.fn_cotizar_guardar(p_datos) $f$;

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION ven.fn_costo_km_contable(integer, boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_guardar_base_costo(integer, boolean, text[], boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_guardar_base_costo(integer, boolean, text[], boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_km_entre(bigint, bigint, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ven.fn_cotizar_guardar(jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_costo_km_contable(integer, boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION ops.fn_ven_cotizar_guardar(jsonb) FROM PUBLIC;
    -- Lo que ya podían ejecutar las funciones de ven (las de ops llaman a las de ven con los permisos de quien llama)
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'ven' AND a.routine_name = 'fn_sugerir' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_costo_km_contable(integer, boolean) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_km_entre(bigint, bigint, bigint) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint) TO %I', r.grantee);
    END LOOP;
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'ven' AND a.routine_name = 'fn_guardar_cotizacion' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_cotizar_guardar(jsonb) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ven.fn_guardar_base_costo(integer, boolean, text[], boolean) TO %I', r.grantee);
    END LOOP;
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'ops' AND a.routine_name = 'fn_ven_sugerir' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_costo_km_contable(integer, boolean) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_cotizar(bigint, bigint, bigint, boolean, bigint, numeric, bigint) TO %I', r.grantee);
    END LOOP;
    FOR r IN SELECT DISTINCT a.grantee FROM information_schema.routine_privileges a
              WHERE a.routine_schema = 'ops' AND a.routine_name = 'fn_ven_guardar_cotizacion' AND a.privilege_type = 'EXECUTE'
                AND a.grantee NOT IN ('PUBLIC', 'postgres') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_cotizar_guardar(jsonb) TO %I', r.grantee);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_ven_guardar_base_costo(integer, boolean, text[], boolean) TO %I', r.grantee);
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '305' WHERE codigo = 'web.version_base' AND valor::text::int < 305;

COMMIT;

-- Resultado: el costo por km que sale de la contabilidad
SELECT 'migración 305 aplicada' AS que,
       x ->> 'costo_km_usd' AS costo_km_usd, x ->> 'desde' AS desde, x ->> 'hasta' AS hasta,
       x ->> 'costo_usd' AS costos_usd, x ->> 'km' AS km_flota,
       x ->> 'combustible_contable_usd' AS combustible_contabilidad_usd, x ->> 'combustible_cargas_usd' AS combustible_cargas_usd,
       x -> 'camiones_sin_km' AS camiones_sin_km, x -> 'cuentas' AS cuentas_que_mas_pesan, x -> 'meses' AS por_mes
  FROM (SELECT ven.fn_costo_km_contable(NULL, NULL) AS x) t;
-- Y con el mes en curso hasta ayer, para comparar
SELECT 'con noviembre hasta ayer' AS que, x ->> 'costo_km_usd' AS costo_km_usd, x ->> 'km' AS km_flota, x -> 'meses' AS por_mes
  FROM (SELECT ven.fn_costo_km_contable(2, true) AS x) t;
