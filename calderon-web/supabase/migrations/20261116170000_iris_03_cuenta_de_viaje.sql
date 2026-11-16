-- Iris 03 · Etapa 2: la cuenta de un viaje (costo, ganancia y qué precio pedir) con el criterio de Gerencia
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 02 aplicada.
-- No toca datos de viajes. Agrega 7 parámetros de costeo (se cambian en Parámetros) y se puede correr más de una vez.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_hora_local(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que correr iris_02_viento_en_ruta.sql';
    END IF;
END $do$;

-- 1) Parámetros del costeo (promedio de flota; los valores son los que se usaron con Gerencia en noviembre 2026)
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('ia.costeo_fijo_dia_usd',        '119.5', 'Iris 03: costo fijo del camión con semirremolque por día de viaje, en USD (promedio de flota: leasing, estructura, amortización, seguro y otros).'),
 ('ia.costeo_chofer_dia_usd',      '58',    'Iris 03: costo del chofer por día de viaje, en USD.'),
 ('ia.costeo_neumaticos_km_usd',   '0.028', 'Iris 03: neumáticos por km recorrido, en USD.'),
 ('ia.costeo_consumo_cargado',     '38.7',  'Iris 03: consumo cargado, litros cada 100 km (medido).'),
 ('ia.costeo_consumo_vacio',       '29.5',  'Iris 03: consumo vacío o con contenedor vacío, litros cada 100 km (medido).'),
 ('ia.costeo_gasoil_clp',          '1630',  'Iris 03: precio del litro de gasoil para costear, en CLP (1.630 en estación; 1.500 en Lo Espejo).'),
 ('ia.costeo_margen_piso_pct',     '12',    'Iris 03: margen mínimo sobre el precio: por debajo no se toma el viaje. El objetivo es ven.margen_objetivo_pct.')
ON CONFLICT (codigo) DO NOTHING;

-- 2) La lectura
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
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;

    -- Línea (opcional): de ahí salen los km si no los dicen
    IF nullif(btrim(e ->> 'linea'), '') IS NOT NULL THEN
        SELECT x.codigo, x.distancia_km INTO l_codigo, l_km FROM mae.linea x
         WHERE x.eliminado_en IS NULL AND upper(x.codigo) = upper(btrim(e ->> 'linea'));
        IF l_codigo IS NULL THEN RAISE EXCEPTION 'No encuentro la línea «%» (Maestros › Líneas)', e ->> 'linea' USING ERRCODE = '22023'; END IF;
    END IF;
    v_km := coalesce(nullif(e ->> 'km_cargado', '')::numeric, l_km);
    v_dias := nullif(e ->> 'dias_cargado', '')::numeric;
    IF v_km IS NULL OR v_km NOT BETWEEN 20 AND 8000 THEN RAISE EXCEPTION 'Faltan los km del tramo cargado (o la línea)' USING ERRCODE = '22023'; END IF;
    IF v_dias IS NULL OR v_dias NOT BETWEEN 0.25 AND 30 THEN RAISE EXCEPTION 'Faltan los días que lleva el tramo cargado, contando la espera de carga' USING ERRCODE = '22023'; END IF;
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
        'criterio', format('Promedio de flota: fijos %s USD por día, chofer %s USD por día, neumáticos %s USD por km. Consumo %s L/100 km cargado y %s vacío. '
                           || 'Gasoil a %s CLP el litro, dólar a %s CLP (%s). Margen medido sobre el precio. No incluye gastos generales ni impuestos.',
                           v_fijo, v_chofer, v_neu, v_cc, v_cv, round(v_gas_clp), v_tc, to_char(v_tc_fecha, 'DD/MM/YYYY')),
        'supuestos', CASE WHEN jsonb_array_length(v_sup) > 0 THEN v_sup END));
END $function$;

-- 3) La lectura entra en la lista de Iris
INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('cuenta_viaje', 30,
        'La cuenta de UN viaje con el criterio de Gerencia: costo por tramo (gasoil, chofer, fijos por día, neumáticos, peajes), tramos vacíos que se le cargan, '
        || 'ganancia y margen con la tarifa, precio de equilibrio, propuesta de precio (pedir / cerrar / no bajar de), tabla de ganancias por precio, '
        || 'comparación con el gasoil a 1.500 y qué pasa con un día más o menos. '
        || 'Usala para: cuánto deja un viaje, a cuánto cobrar un flete nuevo o un tramo extra, cuánto hay que cobrar para ganar X, y para armar pedidos de aumento. '
        || 'Necesita los km y los días del tramo cargado (o el código de la línea para los km). Para comparar dos precios o dos escenarios, pedila dos veces. '
        || 'Para «cobrar lo mismo que en otra línea», pedila para las dos y compará la ganancia por viaje o por día.',
        'La cuenta del viaje', 'Haciendo la cuenta del viaje…', '/analisis/rentabilidad',
        '{"type": "object", "required": ["dias_cargado"], "properties": {
            "linea": {"type": "string", "description": "Código de la línea (por ejemplo SAI-BSAS). Se usa para los km si no se manda km_cargado."},
            "km_cargado": {"type": "number", "description": "Km del tramo cargado."},
            "dias_cargado": {"type": "number", "description": "Días que lleva el tramo cargado, contando la espera de carga."},
            "tarifa_usd": {"type": "number", "description": "Lo que se cobra o se piensa cobrar, en USD. Si no se manda, igual devuelve el costo y la propuesta de precio."},
            "vacios": {"type": "array", "description": "Tramos vacíos (o con contenedor vacío) que son costo de este viaje.", "items": {"type": "object", "required": ["km"], "properties": {
                "descripcion": {"type": "string"}, "km": {"type": "number"}, "dias": {"type": "number", "description": "Si no se manda: 600 km por día."}, "peajes_usd": {"type": "number"}}}},
            "peajes_usd": {"type": "number", "description": "Peajes y tasas del tramo cargado, en USD."},
            "otros_usd": {"type": "number", "description": "Otros costos del viaje en USD (por ejemplo, canon de chofer mayor al habitual)."},
            "gasoil_clp": {"type": "number", "description": "Precio del litro de gasoil en CLP. Si no se manda: el del sistema."},
            "consumo_cargado_l_100km": {"type": "number", "description": "Consumo cargado. Si no se manda: el medido de la flota."}}}'::jsonb,
        true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- 4) El despacho (se agrega la lectura; lo demás queda igual)
CREATE OR REPLACE FUNCTION ia.fn_herramienta(p_codigo text, p_entrada jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb;
BEGIN
    -- Migración 258: precios dudosos. Iris 02: viento en ruta y horas en hora de Mendoza. Iris 03: la cuenta del viaje.
    IF p_codigo = 'cargas_precio_dudoso' THEN
        r := ia.fn_lectura_cargas_precio(nullif(p_entrada->>'desde', '')::date, nullif(p_entrada->>'hasta', '')::date);
    ELSIF p_codigo IN ('viento_en_ruta', 'cuenta_viaje') THEN
        IF NOT EXISTS (SELECT 1 FROM ia.asistente_herramienta WHERE codigo = p_codigo AND activa) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Esa lectura no está en la lista del asistente');
        END IF;
        BEGIN
            r := jsonb_build_object('ok', true, 'datos', CASE p_codigo WHEN 'viento_en_ruta' THEN ia.fn_lectura_viento_ruta(p_entrada)
                                                                       ELSE ia.fn_lectura_cuenta_viaje(p_entrada) END);
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;
    ELSE
        r := ia.fn_herramienta_base(p_codigo, p_entrada);
    END IF;
    IF r ? 'datos' THEN r := jsonb_set(r, '{datos}', ia.fn_hora_local(r -> 'datos')); END IF;
    RETURN r;
END $function$;

-- 5) Instrucciones: reglas de la casa para lo económico (se agregan al final)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'Esos números salen de la lectura, no los calcules vos.''';
    v_nuevo constant text := $t$
        || ' 17) Para cuánto deja un viaje, a cuánto cobrar un flete o un tramo extra, o cuánto pedir de aumento, usá «cuenta_viaje» (no «rentabilidad», que es lo ya facturado). '
        || 'Si faltan los km o los días, preguntalos en una línea; lo demás no lo pidas: usá lo del sistema y decí los supuestos al final. '
        || 'Los tramos vacíos que te nombren (ir a buscar la carga, volver vacío, contenedor vacío) van como costo de ese viaje. '
        || '18) Respondé la cuenta corto: costo total, ganancia y margen, y la propuesta en una línea: «Pedir X, cerrar en Y, no bajar de Z». Si piden el detalle, la tabla por tramo o la tabla por precio. '
        || '19) Reglas de la casa, siempre: nunca ofrezcas precio fijo por un plazo; nunca propongas cobrar estadía; no compares una línea o un cliente con otro salvo que te lo pidan; '
        || 'cada línea se presenta sola; los costos, la ganancia y el margen son solo para Gerencia. '
        || '20) Podés redactar mails, argumentos para una llamada y el texto de una presentación para Gerencia (una idea por lámina, simple). '
        || 'Lo que va al cliente es un pedido amable y abierto a negociar, nunca una imposición, y NO lleva costos, márgenes, ganancia ni lo que pagan otros clientes: '
        || 'solo el precio pedido y motivos generales (combustible, días de viaje, tramos vacíos). Redactar no es cambiar nada en el sistema.'$t$;
BEGIN
    IF v_def LIKE '%cuenta_viaje%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 02): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

REVOKE ALL ON FUNCTION ia.fn_lectura_cuenta_viaje(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_cuenta_viaje(jsonb) TO tc_app, tc_admin, tc_lectura;

COMMIT;
