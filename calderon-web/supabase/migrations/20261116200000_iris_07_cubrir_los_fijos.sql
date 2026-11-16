-- Iris 07 · Cuántos viajes hacen falta para cubrir los costos fijos (punto de equilibrio)
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 06 aplicada.
-- Mejora la lectura «cuenta_viaje»: suma el punto de equilibrio, estima los días si no los dicen
-- y, si no encuentra la línea, devuelve la lista de líneas para que Iris elija. No toca datos.

BEGIN;

DO $do$
BEGIN
    IF pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«[Reunión]»%' THEN
        RAISE EXCEPTION 'Primero hay que correr iris_06_modo_reunion.sql (y antes iris_02, 03 y 04)';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_cuenta_viaje(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}');
    v_fijo numeric := ref.fn_parametro_num('ia.costeo_fijo_dia_usd', 119.5);
    v_chofer numeric := ref.fn_parametro_num('ia.costeo_chofer_dia_usd', 58);
    v_neu numeric := ref.fn_parametro_num('ia.costeo_neumaticos_km_usd', 0.028);
    v_cc numeric; v_cv numeric := ref.fn_parametro_num('ia.costeo_consumo_vacio', 29.5);
    v_obj numeric := ref.fn_parametro_num('ven.margen_objetivo_pct', 20);
    v_piso numeric := ref.fn_parametro_num('ia.costeo_margen_piso_pct', 12);
    v_gas_clp numeric; v_tc numeric; v_tc_fecha date; v_litro numeric;
    v_km numeric; v_dias numeric; v_peajes numeric; v_otros numeric; v_tarifa numeric;
    l_codigo text; l_km numeric; t jsonb; v_tramos jsonb := '[]'; v_sup jsonb := '[]';
    v_total numeric := 0; v_fijo_dia numeric := 0; v_litros numeric := 0; v_gas_total numeric := 0;
    x_km numeric; x_dias numeric; x_gas numeric; x_sub numeric; x_l numeric;
    v_cerrar numeric; v_pedir numeric; v_nobajar numeric; v_tabla jsonb := '[]'; v_dias_tab jsonb := '[]'; p numeric; dd numeric; v_alt numeric;
    v_lineas text; v_cam integer; v_estr numeric; v_aporte numeric; v_dias_tot numeric;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;

    -- Línea (opcional): de ahí salen los km si no los dicen
    IF nullif(btrim(e ->> 'linea'), '') IS NOT NULL THEN
        SELECT x.codigo, x.distancia_km INTO l_codigo, l_km FROM mae.linea x
         WHERE x.eliminado_en IS NULL AND upper(x.codigo) = upper(btrim(e ->> 'linea'));
        IF l_codigo IS NULL THEN
            SELECT string_agg(x.codigo || ' (' || round(x.distancia_km) || ' km)', ', ' ORDER BY x.codigo) INTO v_lineas FROM mae.linea x
             WHERE x.eliminado_en IS NULL AND x.activa AND x.distancia_km > 0;
            RAISE EXCEPTION 'No encuentro la línea «%». Las líneas activas son: %', e ->> 'linea', left(coalesce(v_lineas, 'ninguna'), 1500) USING ERRCODE = '22023';
        END IF;
    END IF;
    v_km := coalesce(nullif(e ->> 'km_cargado', '')::numeric, l_km);
    v_dias := nullif(e ->> 'dias_cargado', '')::numeric;
    IF v_km IS NULL OR v_km NOT BETWEEN 20 AND 8000 THEN
        SELECT string_agg(x.codigo || ' (' || round(x.distancia_km) || ' km)', ', ' ORDER BY x.codigo) INTO v_lineas FROM mae.linea x
         WHERE x.eliminado_en IS NULL AND x.activa AND x.distancia_km > 0;
        RAISE EXCEPTION 'Faltan los km del tramo cargado o el código de la línea. Las líneas activas son: %', left(coalesce(v_lineas, 'ninguna'), 1500) USING ERRCODE = '22023';
    END IF;
    IF v_dias IS NULL THEN
        v_dias := greatest(round(v_km / 450 * 2) / 2, 1);   -- unos 450 km por día contando esperas, de a medio día
        v_sup := v_sup || to_jsonb(format('Días del tramo cargado: %s, estimados a 450 km por día (no los dijeron). Si son otros, la cuenta cambia %s USD por día.', v_dias::float8, round(v_chofer + v_fijo)));
    END IF;
    IF v_dias NOT BETWEEN 0.25 AND 30 THEN RAISE EXCEPTION 'Los días del tramo cargado tienen que estar entre 0,25 y 30' USING ERRCODE = '22023'; END IF;
    IF e ->> 'km_cargado' IS NULL THEN v_sup := v_sup || to_jsonb(format('Km del tramo cargado: los de la línea %s (%s km), no medidos en un viaje.', l_codigo, round(v_km))); END IF;

    v_cc := coalesce(nullif(e ->> 'consumo_cargado_l_100km', '')::numeric, ref.fn_parametro_num('ia.costeo_consumo_cargado', 38.7));
    v_gas_clp := coalesce(nullif(e ->> 'gasoil_clp', '')::numeric, ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630));
    IF v_cc NOT BETWEEN 15 AND 70 OR v_gas_clp NOT BETWEEN 300 AND 5000 THEN RAISE EXCEPTION 'El consumo o el precio del gasoil están fuera de lo razonable' USING ERRCODE = '22023'; END IF;
    SELECT tc.tasa, tc.fecha INTO v_tc, v_tc_fecha FROM fin.tipo_cambio tc
     WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.fecha <= mae.fn_hoy() ORDER BY tc.fecha DESC LIMIT 1;
    IF v_tc IS NULL THEN RAISE EXCEPTION 'No hay tipo de cambio USD a CLP cargado' USING ERRCODE = '55000'; END IF;
    v_litro := v_gas_clp / v_tc;

    v_peajes := nullif(e ->> 'peajes_usd', '')::numeric;
    IF v_peajes IS NULL THEN v_peajes := 0; v_sup := v_sup || to_jsonb('Sin peajes ni tasas: no los dijeron. Si los hay, el costo sube eso mismo.'::text); END IF;
    v_otros := coalesce(nullif(e ->> 'otros_usd', '')::numeric, 0);
    v_tarifa := nullif(e ->> 'tarifa_usd', '')::numeric;

    -- Tramo cargado
    x_l := v_km * v_cc / 100; x_gas := x_l * v_litro;
    x_sub := x_gas + v_dias * (v_chofer + v_fijo) + v_km * v_neu + v_peajes + v_otros;
    v_tramos := v_tramos || jsonb_strip_nulls(jsonb_build_object('tramo', 'Cargado', 'km', round(v_km), 'dias', v_dias, 'litros', round(x_l),
                    'gasoil_usd', round(x_gas), 'chofer_usd', round(v_dias * v_chofer), 'fijos_usd', round(v_dias * v_fijo),
                    'neumaticos_usd', round(v_km * v_neu), 'peajes_usd', nullif(round(v_peajes), 0), 'otros_usd', nullif(round(v_otros), 0), 'subtotal_usd', round(x_sub)));
    v_total := x_sub; v_litros := x_l; v_gas_total := x_gas;

    -- Tramos vacíos que son costo de este viaje
    IF jsonb_typeof(e -> 'vacios') = 'array' THEN
        FOR t IN SELECT z FROM jsonb_array_elements(e -> 'vacios') z LIMIT 6 LOOP
            x_km := nullif(t ->> 'km', '')::numeric; x_dias := coalesce(nullif(t ->> 'dias', '')::numeric, 0);
            IF x_km IS NULL OR x_km NOT BETWEEN 1 AND 8000 OR x_dias NOT BETWEEN 0 AND 15 THEN
                RAISE EXCEPTION 'Cada tramo vacío necesita los km (y los días que lleva)' USING ERRCODE = '22023';
            END IF;
            IF t ->> 'dias' IS NULL THEN
                x_dias := round(x_km / 600 * 2) / 2;   -- unos 600 km por día, de a medio día
                v_sup := v_sup || to_jsonb(format('Tramo vacío «%s»: %s días, estimado a 600 km por día.', coalesce(t ->> 'descripcion', 'vacío'), x_dias));
            END IF;
            x_l := x_km * v_cv / 100; x_gas := x_l * v_litro;
            x_sub := x_gas + x_dias * (v_chofer + v_fijo) + x_km * v_neu + coalesce(nullif(t ->> 'peajes_usd', '')::numeric, 0);
            v_tramos := v_tramos || jsonb_strip_nulls(jsonb_build_object('tramo', 'Vacío: ' || coalesce(nullif(btrim(t ->> 'descripcion'), ''), 'sin nombre'),
                            'km', round(x_km), 'dias', x_dias, 'litros', round(x_l), 'gasoil_usd', round(x_gas),
                            'chofer_usd', round(x_dias * v_chofer), 'fijos_usd', round(x_dias * v_fijo), 'neumaticos_usd', round(x_km * v_neu),
                            'peajes_usd', nullif(round(coalesce(nullif(t ->> 'peajes_usd', '')::numeric, 0)), 0), 'subtotal_usd', round(x_sub)));
            v_total := v_total + x_sub; v_litros := v_litros + x_l; v_gas_total := v_gas_total + x_gas;
        END LOOP;
    END IF;
    v_total := round(v_total);

    -- Qué precio pedir: el objetivo y el piso son margen sobre el precio
    v_cerrar := round(v_total / (1 - v_obj / 100) / 50) * 50;
    v_pedir := round(v_cerrar * 1.02 / 50) * 50; IF v_pedir <= v_cerrar THEN v_pedir := v_cerrar + 50; END IF;
    v_nobajar := ceil(v_total / (1 - v_piso / 100) / 50) * 50;

    -- Tabla de ganancias por precio (de a 100 alrededor) y por día de más o de menos
    FOR p IN SELECT DISTINCT q FROM unnest(ARRAY[v_tarifa, v_nobajar, v_cerrar, v_pedir, v_cerrar - 100, v_cerrar + 200]) q WHERE q IS NOT NULL AND q > 0 ORDER BY q LOOP
        v_alt := p - (v_total - v_gas_total + v_gas_total * 1500 / v_gas_clp);
        v_tabla := v_tabla || jsonb_build_object('precio_usd', p, 'ganancia_usd', round(p - v_total), 'margen_pct', round(100 * (p - v_total) / p),
                        'ganancia_con_gasoil_a_1500_usd', CASE WHEN v_gas_clp <> 1500 THEN round(v_alt) END);
    END LOOP;
    IF v_tarifa IS NOT NULL THEN
        FOREACH dd IN ARRAY ARRAY[-1, 0, 1, 2] LOOP
            CONTINUE WHEN v_dias + dd <= 0;
            v_dias_tab := v_dias_tab || jsonb_build_object('dias_cargado', v_dias + dd,
                'ganancia_usd', round(v_tarifa - v_total - dd * (v_chofer + v_fijo)),
                'margen_pct', round(100 * (v_tarifa - v_total - dd * (v_chofer + v_fijo)) / v_tarifa));
        END LOOP;
    END IF;

    -- Cuántos viajes hacen falta para cubrir los costos fijos de la flota (el fijo por día de todos los camiones, todo el mes)
    v_dias_tot := (SELECT sum((z ->> 'dias')::numeric) FROM jsonb_array_elements(v_tramos) z);
    v_cam := coalesce(nullif(e ->> 'camiones', '')::integer,
                      (SELECT count(*) FROM mae.camion k WHERE k.eliminado_en IS NULL AND k.estado IN ('activo', 'taller'))::integer);
    IF v_cam NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'La cantidad de camiones no es válida' USING ERRCODE = '22023'; END IF;
    v_estr := round(v_fijo * 30.4 * v_cam);
    v_aporte := CASE WHEN v_tarifa IS NOT NULL THEN round(v_tarifa - (v_total - v_fijo * v_dias_tot)) END;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'linea', l_codigo, 'tramos', v_tramos, 'litros_totales', round(v_litros),
        'costo_total_usd', v_total,
        'tarifa_usd', v_tarifa,
        'ganancia_usd', CASE WHEN v_tarifa IS NOT NULL THEN round(v_tarifa - v_total) END,
        'margen_pct', CASE WHEN v_tarifa > 0 THEN round(100 * (v_tarifa - v_total) / v_tarifa) END,
        'ganancia_por_dia_usd', CASE WHEN v_tarifa IS NOT NULL THEN round((v_tarifa - v_total) / nullif((SELECT sum((z ->> 'dias')::numeric) FROM jsonb_array_elements(v_tramos) z), 0)) END,
        'precio_de_equilibrio_usd', v_total,
        'propuesta', jsonb_build_object('pedir_usd', v_pedir, 'cerrar_usd', v_cerrar, 'no_bajar_de_usd', v_nobajar,
                                        'margen_objetivo_pct', v_obj, 'margen_piso_pct', v_piso),
        'tabla_por_precio', v_tabla,
        'por_dias_del_tramo_cargado', CASE WHEN jsonb_array_length(v_dias_tab) > 0 THEN v_dias_tab END,
        'cada_dia_extra_cuesta_usd', round(v_chofer + v_fijo),
        'para_cubrir_los_fijos_de_la_flota', CASE WHEN v_tarifa IS NOT NULL THEN jsonb_build_object(
            'camiones', v_cam, 'fijos_por_camion_por_mes_usd', round(v_fijo * 30.4), 'fijos_de_la_flota_por_mes_usd', v_estr,
            'aporte_de_cada_viaje_usd', v_aporte,
            'viajes_por_mes_para_cubrirlos', CASE WHEN v_aporte > 0 THEN ceil(v_estr / v_aporte) END,
            'viajes_por_mes_para_cubrir_un_camion', CASE WHEN v_aporte > 0 THEN ceil(v_fijo * 30.4 / v_aporte) END,
            'viajes_que_entran_en_el_mes', floor(v_cam * 30.4 / nullif(v_dias_tot, 0)),
            'viajes_que_puede_hacer_un_camion_por_mes', round(30.4 / nullif(v_dias_tot, 0), 1),
            'explicacion', 'Aporte de cada viaje = tarifa menos gasoil, chofer, neumáticos, peajes y otros (todo menos el fijo por día). '
                || 'Fijos = el costo fijo por día de cada camión con su semirremolque (leasing, estructura, amortización, seguro), los 30 días, ande o no ande. '
                || CASE WHEN v_aporte <= 0 THEN 'Con esta tarifa el viaje no aporta nada a los fijos.'
                        WHEN ceil(v_estr / v_aporte) > floor(v_cam * 30.4 / nullif(v_dias_tot, 0))
                        THEN 'Solo con este viaje NO se llega: hacen falta más viajes de los que entran en el mes.'
                        ELSE 'Se llega: entran más viajes en el mes de los que hacen falta.' END) END,
        'criterio', format('Promedio de flota: fijos %s USD por día, chofer %s USD por día, neumáticos %s USD por km. Consumo %s L/100 km cargado y %s vacío. '
                           || 'Gasoil a %s CLP el litro, dólar a %s CLP (%s). Margen medido sobre el precio. No incluye gastos generales ni impuestos.',
                           v_fijo, v_chofer, v_neu, v_cc, v_cv, round(v_gas_clp), v_tc, to_char(v_tc_fecha, 'DD/MM/YYYY')),
        'supuestos', CASE WHEN jsonb_array_length(v_sup) > 0 THEN v_sup END));
END $function$;

UPDATE ia.asistente_herramienta
   SET descripcion = 'La cuenta de UN viaje con el criterio de Gerencia: costo por tramo (gasoil, chofer, fijos por día, neumáticos, peajes), tramos vacíos que se le cargan, '
        || 'ganancia y margen con la tarifa, precio de equilibrio, propuesta de precio (pedir / cerrar / no bajar de), tabla de ganancias por precio, '
        || 'comparación con el gasoil a 1.500, qué pasa con un día más o menos, y CUÁNTOS VIAJES POR MES hacen falta a esa tarifa para cubrir los costos fijos de la flota (punto de equilibrio). '
        || 'Usala para: cuánto deja un viaje, a cuánto cobrar un flete nuevo o un tramo extra, cuánto hay que cobrar para ganar X, cuántos viajes de X dólares necesitamos, y para armar pedidos de aumento. '
        || 'Es una CUENTA: no busca viajes cargados, sirve aunque ese viaje nunca se haya hecho. '
        || 'Mandá el código de la línea o los km; si no sabés el código, mandá lo que te dijeron en «linea» y el error te devuelve la lista de líneas para elegir. '
        || 'Códigos de lugares en las líneas: SAI San Antonio, BSAS Buenos Aires, MZA Mendoza, MP o MDP Mar del Plata, ROS Rosario, CBA Córdoba, NQ Neuquén, CNL Coronel, STGO Santiago. '
        || 'Para comparar dos precios o dos escenarios, pedila dos veces.',
       entrada = jsonb_set(entrada #- '{required}', '{properties,camiones}',
                           '{"type": "integer", "description": "Cantidad de camiones de la flota para el punto de equilibrio. Si no se manda: los tractores del sistema."}'::jsonb)
 WHERE codigo = 'cuenta_viaje';

UPDATE ia.asistente_herramienta
   SET entrada = jsonb_set(entrada, '{properties,dias_cargado,description}',
                           '"Días que lleva el tramo cargado, contando la espera de carga. Si no se manda: se estima a 450 km por día y se avisa."'::jsonb)
 WHERE codigo = 'cuenta_viaje';

DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'contestá en una frase que no entendiste y que lo repitan.''';
    v_nuevo constant text := $t$
        || ' 24) Preguntas del tipo «cuántos viajes de X dólares necesitamos», «cuántos viajes hacen falta para cubrir la estructura / los fijos / los costos» o «punto de equilibrio» '
        || 'NO se responden buscando viajes cargados: son una cuenta. Usá «cuenta_viaje» con esa tarifa y esa línea y respondé con «para_cubrir_los_fijos_de_la_flota»: '
        || 'cuántos viajes por mes hacen falta para toda la flota y para un camión, cuántos entran en el mes y si se llega o no. '
        || 'Nunca contestes «no tengo viajes de esos cargados» a una pregunta de precio, de costo o de cuántos viajes hacen falta. '
        || 'Si no sabés qué línea es, probá con lo que te dijeron y elegí de la lista que devuelve el error; si hay más de una posible (por ejemplo a Mar del Plata), usá la más corta y decí cuál tomaste.'$t$;
BEGIN
    IF v_def LIKE '%para_cubrir_los_fijos_de_la_flota%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 06): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

COMMIT;
