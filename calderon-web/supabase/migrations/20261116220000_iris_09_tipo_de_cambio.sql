-- Iris 09 · El dólar: historial del tipo de cambio y cuentas con otro valor del dólar
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 08 aplicada.
-- Agrega la lectura «tipo_cambio», deja probar la cuenta del viaje con otro dólar y suma una regla. No toca datos.

BEGIN;

DO $do$
BEGIN
    IF pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%el símbolo solo no dice la moneda%' THEN
        RAISE EXCEPTION 'Primero hay que correr iris_08_moneda_dictado.sql (y las anteriores)';
    END IF;
END $do$;

-- 1) La lectura: cómo se movió cada moneda
CREATE OR REPLACE FUNCTION ia.fn_lectura_tipo_cambio(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_dias integer := coalesce(nullif(coalesce(p_entrada, '{}') ->> 'dias', '')::integer, 30);
    v_hoy date := mae.fn_hoy(); v_pares jsonb; v_gas numeric := ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630);
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF v_dias NOT BETWEEN 2 AND 400 THEN RAISE EXCEPTION 'El período tiene que ser de 2 a 400 días' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.par), '[]') INTO v_pares FROM (
        SELECT p.moneda_origen || ' a ' || p.moneda_destino AS par,
               '1 ' || p.moneda_origen || ' = tantos ' || p.moneda_destino AS como_leerlo,
               u.tasa AS hoy, to_char(u.fecha, 'DD/MM/YYYY') AS fecha_del_ultimo_dato,
               a.tasa AS al_inicio, to_char(a.fecha, 'DD/MM/YYYY') AS fecha_del_inicio,
               round(100 * (u.tasa - a.tasa) / nullif(a.tasa, 0), 1) AS variacion_pct,
               CASE WHEN u.tasa > a.tasa THEN p.moneda_origen || ' subió frente a ' || p.moneda_destino
                    WHEN u.tasa < a.tasa THEN p.moneda_origen || ' bajó frente a ' || p.moneda_destino
                    ELSE 'sin cambio' END AS que_paso,
               m.minimo, m.maximo, m.datos AS datos_en_el_periodo,
               (SELECT jsonb_agg(jsonb_build_object('fecha', to_char(s.fecha, 'DD/MM'), 'valor', s.tasa) ORDER BY s.fecha)
                  FROM (SELECT DISTINCT ON (date_trunc('week', t.fecha)) t.fecha, t.tasa FROM fin.tipo_cambio t
                         WHERE t.eliminado_en IS NULL AND t.moneda_origen = p.moneda_origen AND t.moneda_destino = p.moneda_destino
                           AND t.fecha BETWEEN v_hoy - v_dias AND v_hoy
                         ORDER BY date_trunc('week', t.fecha), t.fecha DESC) s) AS por_semana
          FROM (SELECT DISTINCT t.moneda_origen, t.moneda_destino FROM fin.tipo_cambio t WHERE t.eliminado_en IS NULL AND t.fecha > v_hoy - 400) p
          CROSS JOIN LATERAL (SELECT t.tasa, t.fecha FROM fin.tipo_cambio t
                               WHERE t.eliminado_en IS NULL AND t.moneda_origen = p.moneda_origen AND t.moneda_destino = p.moneda_destino AND t.fecha <= v_hoy
                               ORDER BY t.fecha DESC, t.id DESC LIMIT 1) u
          CROSS JOIN LATERAL (SELECT t.tasa, t.fecha FROM fin.tipo_cambio t
                               WHERE t.eliminado_en IS NULL AND t.moneda_origen = p.moneda_origen AND t.moneda_destino = p.moneda_destino
                               ORDER BY (t.fecha <= v_hoy - v_dias) DESC, abs(t.fecha - (v_hoy - v_dias)), t.id LIMIT 1) a
          CROSS JOIN LATERAL (SELECT min(t.tasa) AS minimo, max(t.tasa) AS maximo, count(*) AS datos FROM fin.tipo_cambio t
                               WHERE t.eliminado_en IS NULL AND t.moneda_origen = p.moneda_origen AND t.moneda_destino = p.moneda_destino
                                 AND t.fecha BETWEEN v_hoy - v_dias AND v_hoy) m) q;
    RETURN jsonb_build_object(
        'periodo', jsonb_build_object('desde', to_char(v_hoy - v_dias, 'DD/MM/YYYY'), 'hasta', to_char(v_hoy, 'DD/MM/YYYY'), 'dias', v_dias),
        'monedas', v_pares,
        'que_significa_para_la_empresa', format('Los fletes se cobran en dólares y el gasoil, los choferes y buena parte de los costos se pagan en pesos chilenos. '
            || 'Si el dólar SUBE frente al peso chileno, los mismos costos en pesos cuestan menos dólares y la ganancia de cada viaje mejora; si BAJA, empeora. '
            || 'Para ver cuánto, usar «cuenta_viaje» con «dolar_clp». El gasoil del costeo está en %s CLP el litro.', round(v_gas)),
        'de_donde_sale', 'Tipos de cambio cargados en el sistema (Finanzas › Tipos de cambio). Si falta el dato de un día se usa el más cercano.');
END $function$;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('tipo_cambio', 32,
        'El dólar y las otras monedas: valor de hoy, valor al inicio del período, cuánto subió o bajó (en %), mínimo, máximo y cómo vino semana a semana, '
        || 'para cada par cargado en el sistema (dólar contra peso chileno, peso argentino contra peso chileno, etc.), y qué significa para la ganancia de los viajes. '
        || 'Usala cuando pregunten si subió o bajó el dólar o el peso, a cuánto está el dólar, o cómo viene el tipo de cambio.',
        'Tipo de cambio', 'Mirando cómo se movió el dólar…', '/finanzas',
        '{"type": "object", "properties": {"dias": {"type": "integer", "description": "Cuántos días hacia atrás comparar (2 a 400). Si no se manda: 30."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- 2) La cuenta del viaje se puede hacer con otro valor del dólar («dolar_clp»)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_lectura_cuenta_viaje(jsonb)'::regprocedure);
    v_ancla constant text := 'v_litro := v_gas_clp / v_tc;';
    v_nuevo constant text := 'IF nullif(e ->> ''dolar_clp'', '''') IS NOT NULL THEN
        v_tc := (e ->> ''dolar_clp'')::numeric; v_tc_fecha := v_hoy_iris;
        IF v_tc NOT BETWEEN 300 AND 3000 THEN RAISE EXCEPTION ''El valor del dólar en pesos chilenos está fuera de lo razonable'' USING ERRCODE = ''22023''; END IF;
        v_sup := v_sup || to_jsonb(format(''Dólar a %s CLP: es el que pidieron probar, no el del sistema.'', v_tc));
    END IF;
    v_litro := v_gas_clp / v_tc;';
BEGIN
    IF v_def LIKE '%dolar_clp%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 OR position('v_dias_tot numeric;' IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_lectura_cuenta_viaje no es la que esperaba esta migración (falta Iris 07): avisar antes de seguir';
    END IF;
    v_def := replace(v_def, 'v_dias_tot numeric;', 'v_dias_tot numeric; v_hoy_iris date := mae.fn_hoy();');
    EXECUTE replace(v_def, v_ancla, v_nuevo);
END $do$;

UPDATE ia.asistente_herramienta
   SET entrada = jsonb_set(entrada, '{properties,dolar_clp}',
                           '{"type": "number", "description": "Valor del dólar en pesos chilenos para probar un escenario. Si no se manda: el último cargado en el sistema."}'::jsonb)
 WHERE codigo = 'cuenta_viaje';

-- 3) El despacho
CREATE OR REPLACE FUNCTION ia.fn_herramienta(p_codigo text, p_entrada jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb;
BEGIN
    -- Migración 258: precios dudosos. Iris 02: viento en ruta y hora de Mendoza. Iris 03: cuenta del viaje. Iris 04: clientes. Iris 09: tipo de cambio.
    IF p_codigo = 'cargas_precio_dudoso' THEN
        r := ia.fn_lectura_cargas_precio(nullif(p_entrada->>'desde', '')::date, nullif(p_entrada->>'hasta', '')::date);
    ELSIF p_codigo IN ('viento_en_ruta', 'cuenta_viaje', 'negocio_clientes', 'tipo_cambio') THEN
        IF NOT EXISTS (SELECT 1 FROM ia.asistente_herramienta WHERE codigo = p_codigo AND activa) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Esa lectura no está en la lista del asistente');
        END IF;
        BEGIN
            r := jsonb_build_object('ok', true, 'datos', CASE p_codigo
                    WHEN 'viento_en_ruta' THEN ia.fn_lectura_viento_ruta(p_entrada)
                    WHEN 'cuenta_viaje' THEN ia.fn_lectura_cuenta_viaje(p_entrada)
                    WHEN 'negocio_clientes' THEN ia.fn_lectura_negocio_clientes(p_entrada)
                    ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
        END;
    ELSE
        r := ia.fn_herramienta_base(p_codigo, p_entrada);
    END IF;
    IF r ? 'datos' THEN r := jsonb_set(r, '{datos}', ia.fn_hora_local(r -> 'datos')); END IF;
    RETURN r;
END $function$;

-- 4) Regla
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'al hablar en reunión decí «dólares» o «pesos chilenos».''';
    v_nuevo constant text := $t$
        || ' 26) Si preguntan si subió o bajó el dólar o el peso, a cuánto está, o cómo viene el cambio, usá «tipo_cambio» y respondé: a cuánto está hoy, cuánto subió o bajó y desde cuándo, '
        || 'y en una frase qué significa para la empresa (dólar más alto frente al peso chileno = los viajes dejan más). Si quieren el efecto en un viaje, hacé «cuenta_viaje» dos veces: con el dólar de hoy y con el otro valor en «dolar_clp». '
        || 'Si en la pregunta alguien se corrige («o sea», «perdón», «mejor dicho»), vale lo último que dijo.'$t$;
BEGIN
    IF v_def LIKE '%«tipo_cambio»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 08): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

REVOKE ALL ON FUNCTION ia.fn_lectura_tipo_cambio(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_tipo_cambio(jsonb) TO tc_app, tc_admin, tc_lectura;

COMMIT;
