-- =====================================================================================
-- Migración 369 · Disponible hoy, la plata por moneda y «pagar primero»
-- =====================================================================================
-- Tres ideas tomadas del handoff de Atlas (26/11/2026), hechas en la base y a la manera de IronTrack:
--   · «Disponible hoy»: la plata menos lo que ya tiene destino (una cuota de cada leasing o crédito de estos días, los
--     sueldos que vienen y la espalda). Es lo que se puede usar sin tocar lo planificado; si da negativo, es lo que falta.
--   · La plata por moneda: cuánto hay en pesos chilenos, dólares y pesos argentinos, y cuánto paga el reparto en cada
--     una. Avisa cuando hay que comprar moneda para pagar, o cuando hay moneda contada como pesos que habría que vender.
--   · «Pagar primero»: una marca que ponen Finanzas, Gerencia o TI en un contrato, un proveedor o una deuda. Lo marcado va
--     antes que el resto en «una cuota de cada contrato» y en «cancelar deudas», aunque no cobre interés.
-- Además, todo renglón de cuotas y deudas queda con a quién se le debe (los gastos sin proveedor no lo tenían): así a
-- cualquiera se le puede cargar el interés o la marca.
-- Necesita la migración 368 (reparto de la plata). No cambia datos ni web.version_base. Se puede correr más de una vez.
-- Antes de terminar prueba la cuenta con los datos de la base: si falla, no deja nada aplicado.
-- Lo de Iris va aparte, en iris_20, que se corre después de esta.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_plan_caja_reparto_calcular(jsonb)') IS NULL OR to_regclass('fin.plan_caja_mora') IS NULL
       OR to_regprocedure('fin.fn_plan_caja_salidas(jsonb)') IS NULL OR to_regprocedure('fin.fn_plan_caja_mora_guardar(text, bigint, jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 368 (20261126200000_reparto_de_la_plata.sql): correrla antes que esta';
    END IF;
END $v$;

-- ---------------------------------------------------------------------------------
-- 1 · La marca «pagar primero» vive junto al interés de cada acreedor
-- ---------------------------------------------------------------------------------
ALTER TABLE fin.plan_caja_mora ADD COLUMN IF NOT EXISTS pagar_primero boolean NOT NULL DEFAULT false;
-- Se puede marcar «pagar primero» sin saber el interés
ALTER TABLE fin.plan_caja_mora ALTER COLUMN tasa_mensual DROP NOT NULL;

DO $c$
DECLARE r record;
BEGIN
    -- El acreedor ahora también puede ser un gasto suelto (sin proveedor ni gasto fijo). Y no quedan filas vacías.
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'fin.plan_caja_mora'::regclass AND contype = 'c'
                AND (pg_get_constraintdef(oid) LIKE '%origen%' OR conname = 'plan_caja_mora_algo_ck') LOOP
        EXECUTE format('ALTER TABLE fin.plan_caja_mora DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ALTER TABLE fin.plan_caja_mora ADD CONSTRAINT plan_caja_mora_origen_ck CHECK (origen IN ('fijo', 'proveedor', 'partida', 'gasto'));
    ALTER TABLE fin.plan_caja_mora ADD CONSTRAINT plan_caja_mora_algo_ck CHECK (tasa_mensual IS NOT NULL OR pagar_primero);
END $c$;

COMMENT ON TABLE fin.plan_caja_mora IS 'Planificador de caja: lo que Gerencia o Finanzas saben de cada acreedor (un contrato en cuotas = fijo, un proveedor, una deuda cargada a mano = partida, o un gasto suelto): el interés por mes (en %) que cobra si se le paga tarde y la marca «pagar primero». Sirve para decidir qué deuda cancelar primero. Solo por funciones.';
COMMENT ON COLUMN fin.plan_caja_mora.pagar_primero IS 'Migración 369: lo marcado va antes que el resto en el reparto de la plata, aunque no cobre interés.';

-- ---------------------------------------------------------------------------------
-- 2 · Apoyo
-- ---------------------------------------------------------------------------------
-- De qué clase es cada salida del plan y a quién se le debe:
--   cuota (leasing, crédito o deuda en cuotas), sueldo, impuesto, proveedor, operativo (combustible y fondos) u otra.
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_clase(p_origen text, p_id bigint)
 RETURNS TABLE (clase text, acreedor_tipo text, acreedor_id bigint, acreedor text, critico boolean, cuota_n integer, cuotas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 ROWS 1
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    c_cuota constant text := '(leasing|cr[eé]dito|pr[eé]stamo)';
    c_no_cuota constant text := '(cr[eé]dito fiscal|nota de cr[eé]dito)';   -- el IVA crédito fiscal y las notas de crédito no son un crédito
    c_sueldo constant text := '(sueldo|remunerac|leyes sociales|imposici|previsi|finiquito)';
    c_impuesto constant text := '(impuesto|\miva\M|\mppm\M|tesorer|contribuci|retenci)';
    c_combustible constant text := '(combustible|gasoil|gas oil|di[eé]sel|petr[oó]leo)';
BEGIN
    IF p_origen = 'gasto' THEN
        RETURN QUERY
        -- A quién se le debe: el contrato (gasto fijo) si es una cuota o si no tiene proveedor; si no, el proveedor;
        -- y si no hay ninguno de los dos, el gasto mismo. En los sueldos no se arma el nombre: llevan el de una persona.
        SELECT x.clase,
               CASE WHEN y.de_fijo THEN 'fijo' WHEN g.proveedor_id IS NOT NULL THEN 'proveedor' ELSE 'gasto' END,
               CASE WHEN y.de_fijo THEN f.id WHEN g.proveedor_id IS NOT NULL THEN g.proveedor_id ELSE g.id END,
               CASE WHEN x.clase = 'sueldo' THEN NULL
                    WHEN y.de_fijo THEN concat_ws(' · ', pr.razon_social, f.nombre)
                    ELSE coalesce(pr.razon_social, nullif(btrim(g.proveedor_nombre), ''), left(g.descripcion, 60)) END,
               x.clase = 'proveedor' AND (coalesce(pr.tipo, '') = 'combustible' OR coalesce(cc.uso, '') = 'COMBUSTIBLE' OR coalesce(cc.nombre, '') ~* c_combustible),
               CASE WHEN f.cuotas IS NOT NULL AND g.periodo IS NOT NULL THEN fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) END,
               f.cuotas::integer
          FROM fin.gasto g
          LEFT JOIN fin.gasto_fijo f ON f.id = g.gasto_fijo_id
          LEFT JOIN fin.cuenta_contable cc ON cc.id = g.cuenta_id
          LEFT JOIN mae.proveedor pr ON pr.id = g.proveedor_id
         -- Los sueldos de la estructura («Sueldo · Área · Persona») van primero: el puesto puede decir «crédito» y no es una cuota
         CROSS JOIN LATERAL (SELECT CASE
                    WHEN coalesce(f.nombre, '') LIKE 'Sueldo · %' THEN 'sueldo'
                    WHEN f.id IS NOT NULL AND (f.cuotas IS NOT NULL OR (to_jsonb(f) ->> 'compra_rodado_id') IS NOT NULL
                                               OR (f.nombre ~* c_cuota AND f.nombre !~* c_no_cuota)) THEN 'cuota'
                    WHEN (coalesce(cc.nombre, '') ~* c_cuota AND cc.nombre !~* c_no_cuota) OR (to_jsonb(g) ->> 'compra_rodado_id') IS NOT NULL THEN 'cuota'
                    WHEN coalesce(cc.uso, '') IN ('REM_CHOFERES', 'LEYES_CHOFERES', 'REM_POR_PAGAR', 'LEYES_SOCIALES')
                         OR coalesce(cc.nombre, '') ~* c_sueldo THEN 'sueldo'
                    WHEN coalesce(cc.uso, '') IN ('IVA_DEBITO', 'IVA_CREDITO', 'RETENCIONES') OR coalesce(cc.nombre, '') ~* c_impuesto THEN 'impuesto'
                    ELSE 'proveedor' END AS clase) x
         CROSS JOIN LATERAL (SELECT (f.id IS NOT NULL AND (x.clase = 'cuota' OR g.proveedor_id IS NULL)) AS de_fijo) y
         WHERE g.id = p_id;
    ELSIF p_origen = 'fijo' THEN
        RETURN QUERY
        SELECT CASE WHEN f.nombre LIKE 'Sueldo · %' THEN 'sueldo'
                    WHEN f.cuotas IS NOT NULL OR (to_jsonb(f) ->> 'compra_rodado_id') IS NOT NULL OR (f.nombre ~* c_cuota AND f.nombre !~* c_no_cuota)
                         OR (coalesce(cc.nombre, '') ~* c_cuota AND cc.nombre !~* c_no_cuota) THEN 'cuota'
                    WHEN coalesce(cc.uso, '') IN ('REM_CHOFERES', 'LEYES_CHOFERES', 'REM_POR_PAGAR', 'LEYES_SOCIALES')
                         OR coalesce(cc.nombre, '') ~* c_sueldo THEN 'sueldo'
                    WHEN coalesce(cc.uso, '') IN ('IVA_DEBITO', 'IVA_CREDITO', 'RETENCIONES') OR coalesce(cc.nombre, '') ~* c_impuesto THEN 'impuesto'
                    ELSE 'proveedor' END,
               'fijo'::text, f.id, CASE WHEN f.nombre LIKE 'Sueldo · %' THEN NULL ELSE concat_ws(' · ', pr.razon_social, f.nombre) END,
               false, NULL::integer, f.cuotas::integer
          FROM fin.gasto_fijo f
          LEFT JOIN fin.cuenta_contable cc ON cc.id = f.cuenta_id
          LEFT JOIN mae.proveedor pr ON pr.id = f.proveedor_id
         WHERE f.id = p_id;
    ELSIF p_origen = 'liquidacion' THEN
        RETURN QUERY SELECT 'sueldo'::text, NULL::text, NULL::bigint, 'Choferes'::text, false, NULL::integer, NULL::integer;
    ELSIF p_origen = 'partida' THEN
        RETURN QUERY
        SELECT CASE p.categoria WHEN 'sueldos' THEN 'sueldo' WHEN 'impuestos' THEN 'impuesto' WHEN 'deuda' THEN 'cuota'
                                WHEN 'combustible' THEN 'operativo' WHEN 'proveedor' THEN 'proveedor' ELSE 'otra' END,
               'partida'::text, coalesce(p.serie_id, p.id),
               CASE WHEN p.categoria = 'sueldos' THEN NULL ELSE coalesce(p.tercero, regexp_replace(p.descripcion, ' \(\d+ de \d+\)$', '')) END,
               p.categoria = 'combustible', NULL::integer, NULL::integer
          FROM fin.plan_caja_partida p WHERE p.id = p_id;
    ELSE
        -- Combustible de Chile por transferir, fondos aprobados a choferes, combustible en cuenta corriente sin factura
        RETURN QUERY SELECT 'operativo'::text, NULL::text, NULL::bigint, NULL::text, true, NULL::integer, NULL::integer;
    END IF;
END $f$;
COMMENT ON FUNCTION fin.fn_plan_caja_clase(text, bigint) IS
    'Migraciones 368 y 369: de qué clase es una salida del plan de caja (cuota, sueldo, impuesto, proveedor, operativo u otra) y a quién se le debe (contrato, proveedor, deuda a mano o el gasto mismo). Interna.';

-- El interés por mes de un contrato o proveedor: el cargado a mano o, si no hay, el que sale de la mora ya pagada
-- (recargos del último año ÷ monto × días de atraso). Una fila que solo tiene la marca «pagar primero» no es un interés.
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_mora_de(p_tipo text, p_id bigint)
 RETURNS TABLE (tasa numeric, fuente text, nota text, recargos numeric, veces integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 ROWS 1
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF p_tipo IS NULL OR p_id IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT m.tasa_mensual::numeric, 'cargada'::text, m.nota, NULL::numeric, NULL::integer
                   FROM fin.plan_caja_mora m WHERE m.origen = p_tipo AND m.origen_id = p_id AND m.tasa_mensual IS NOT NULL;
    IF FOUND OR p_tipo NOT IN ('fijo', 'proveedor') THEN RETURN; END IF;
    RETURN QUERY
    SELECT least(round(sum(r.total) / nullif(sum(o.total * greatest(r.fecha - o.vence, 1)), 0) * 30 * 100, 2), 30),
           'observada'::text, NULL::text, sum(r.total), count(*)::integer
      FROM fin.gasto r
      JOIN fin.gasto o ON o.id = r.recargo_de_id
     WHERE r.recargo_tipo = 'mora' AND r.estado <> 'anulado' AND r.eliminado_en IS NULL AND o.eliminado_en IS NULL
       AND r.fecha > o.vence AND r.fecha >= mae.fn_hoy() - 365 AND r.total > 0 AND o.total > 0
       AND CASE WHEN p_tipo = 'fijo' THEN o.gasto_fijo_id = p_id ELSE o.proveedor_id = p_id END
    HAVING count(*) > 0;
END $f$;
COMMENT ON FUNCTION fin.fn_plan_caja_mora_de(text, bigint) IS
    'Migraciones 368 y 369: interés por mes (en %) de un contrato en cuotas, un proveedor o una deuda: el cargado en fin.plan_caja_mora o, si no hay, el que resulta de los recargos por mora pagados en el último año. Interna.';

-- Las salidas del plan (en pesos chilenos), cada una con su clase, a quién se le debe, los días de atraso, el interés
-- y la marca «pagar primero». El interés y la marca se buscan una vez por acreedor (no una vez por documento).
-- Sin «jit»: son muchas cuentas chicas y compilarlas tarda más que hacerlas.
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_salidas(p_plan jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
    WITH s AS MATERIALIZED (
        SELECT p.clave, p.origen, p.id, p.titulo, p.detalle, p.fecha, p.fecha_base AS vence, p.moneda, p.monto, p.monto_vista AS clp, p.nota,
               k.clase, k.acreedor_tipo, k.acreedor_id, k.acreedor, coalesce(k.critico, false) AS critico, k.cuota_n, k.cuotas
          FROM jsonb_to_recordset(p_plan -> 'partidas') AS p(clave text, origen text, id bigint, sentido text, titulo text, detalle text, fecha date,
                                                             fecha_base date, moneda text, monto numeric, monto_vista numeric, cubo text, nota text)
         CROSS JOIN LATERAL fin.fn_plan_caja_clase(p.origen, p.id) k
         WHERE p.sentido = 'salida' AND p.cubo NOT IN ('no_contar', 'sin_cambio') AND p.monto_vista > 0
    ), a AS MATERIALIZED (
        SELECT DISTINCT s.acreedor_tipo, s.acreedor_id FROM s WHERE s.acreedor_tipo IS NOT NULL AND s.acreedor_id IS NOT NULL
    ), m AS MATERIALIZED (
        SELECT a.acreedor_tipo, a.acreedor_id, t.tasa, t.fuente, pm.nota, coalesce(pm.pagar_primero, false) AS primero
          FROM a
          LEFT JOIN LATERAL fin.fn_plan_caja_mora_de(a.acreedor_tipo, a.acreedor_id) t ON true
          LEFT JOIN fin.plan_caja_mora pm ON pm.origen = a.acreedor_tipo AND pm.origen_id = a.acreedor_id
    )
    SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.clave), '[]'::jsonb)
      FROM (SELECT s.clave, s.origen, s.id, s.titulo, s.detalle, s.fecha, s.vence, s.moneda, s.monto, s.clp, s.nota,
                   s.clase, s.acreedor_tipo, s.acreedor_id, s.acreedor, s.critico, s.cuota_n, s.cuotas,
                   CASE WHEN s.acreedor_tipo IS NOT NULL AND s.acreedor_id IS NOT NULL THEN s.acreedor_tipo || ':' || s.acreedor_id ELSE 'x:' || s.clave END AS acreedor_clave,
                   greatest((p_plan ->> 'hoy')::date - coalesce(s.vence, s.fecha, (p_plan ->> 'hoy')::date), 0) AS dias_atraso,
                   m.tasa, m.fuente AS tasa_fuente, m.nota AS tasa_nota, coalesce(m.primero, false) AS primero
              FROM s
              LEFT JOIN m ON m.acreedor_tipo = s.acreedor_tipo AND m.acreedor_id = s.acreedor_id) z
$f$;
COMMENT ON FUNCTION fin.fn_plan_caja_salidas(jsonb) IS
    'Migraciones 368 y 369: las salidas de un plan de caja armado en pesos chilenos, con su clase, el acreedor, los días de atraso, el interés por mes y la marca «pagar primero». Interna.';

-- ---------------------------------------------------------------------------------
-- 3 · El reparto, con «pagar primero», el disponible y la plata por moneda
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_reparto_calcular(p_opciones jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $function$
DECLARE
    o jsonb := coalesce(p_opciones, '{}'::jsonb);
    v_hoy date := mae.fn_hoy();
    v_orden_g text[]; v_orden text[];
    v_espalda_g numeric := greatest(ref.fn_parametro_num('fin.plan_caja_espalda_clp', 60000000), 0);
    v_dias_s_g integer := least(greatest(ref.fn_parametro_num('fin.plan_caja_reserva_sueldos_dias', 10)::integer, 0), 60);
    v_dias_c_g integer := least(greatest(ref.fn_parametro_num('fin.plan_caja_cuotas_dias', 7)::integer, 0), 60);
    v_espalda numeric; v_dias_s integer; v_dias_c integer;
    v_usar boolean; v_entra numeric; v_mon text; v_tc numeric; v_entra_clp numeric;
    v_plan jsonb; v_caja numeric; v_total numeric; v_resto numeric;
    v_sal jsonb; v_usadas text[] := '{}';
    v_pasos jsonb := '[]'::jsonb; v_items jsonb; v_nec numeric; v_asig numeric; v_extra jsonb; v_titulo text; v_que text;
    v_avisos jsonb := '[]'::jsonb; v_cod text; r record; v_n integer; v_m numeric; v_t text; v_paga boolean;
    v_oper jsonb; v_pronto jsonb; v_pordia numeric; v_sin_tasa integer := 0; v_sin_tasa_clp numeric := 0;
    v_corta numeric; v_sigue numeric;
    v_nec_c numeric := 0; v_nec_s numeric := 0; v_nec_e numeric := 0; v_nec_d numeric := 0; v_prot numeric; v_monedas jsonb;
    c_fmt constant text := 'FM999G999G999G999G990';
BEGIN
    -- ── Las reglas: las guardadas, salvo que quien consulta quiera probar otras ────────
    v_orden_g := coalesce(fin.fn_plan_caja_orden_valido((SELECT valor FROM ref.parametro WHERE codigo = 'fin.plan_caja_orden' AND eliminado_en IS NULL)),
                          ARRAY['cuotas', 'sueldos', 'espalda', 'deudas']);
    v_orden := v_orden_g;
    IF o ? 'orden' AND jsonb_typeof(o -> 'orden') <> 'null' THEN
        v_orden := fin.fn_plan_caja_orden_valido(o -> 'orden');
        IF v_orden IS NULL THEN
            RAISE EXCEPTION 'El orden lleva los cuatro pasos, una vez cada uno: cuotas, sueldos, espalda y deudas' USING ERRCODE = '22023';
        END IF;
    END IF;
    BEGIN
        v_usar := coalesce((o ->> 'usar_caja')::boolean, true);
        v_entra := coalesce(nullif(btrim(o ->> 'entra'), '')::numeric, 0);
        v_espalda := coalesce(nullif(btrim(o ->> 'espalda'), '')::numeric, v_espalda_g);
        v_dias_s := coalesce(nullif(btrim(o ->> 'reserva_sueldos_dias'), '')::integer, v_dias_s_g);
        v_dias_c := coalesce(nullif(btrim(o ->> 'cuotas_dias'), '')::integer, v_dias_c_g);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'Los montos y los días van en números, sin puntos ni letras' USING ERRCODE = '22023';
    END;
    v_mon := upper(coalesce(nullif(btrim(o ->> 'entra_moneda'), ''), 'CLP'));
    IF v_entra < 0 OR v_entra > 999999999999 THEN RAISE EXCEPTION 'La plata que entra va de 0 en adelante' USING ERRCODE = '22023'; END IF;
    IF v_espalda < 0 OR v_espalda > 999999999999 THEN RAISE EXCEPTION 'La espalda va de 0 en adelante' USING ERRCODE = '22023'; END IF;
    IF v_dias_s NOT BETWEEN 0 AND 60 OR v_dias_c NOT BETWEEN 0 AND 60 THEN RAISE EXCEPTION 'Los días van de 0 a 60' USING ERRCODE = '22023'; END IF;
    v_tc := fin.fn_tc_clp_o_null(v_mon, v_hoy);
    IF v_tc IS NULL OR v_tc <= 0 THEN
        RAISE EXCEPTION 'No hay tipo de cambio de % para pasar a pesos chilenos lo que entra: cargalo en Configuración › Monedas y tipos de cambio', v_mon USING ERRCODE = '55000';
    END IF;
    v_entra_clp := round(v_entra * v_tc);

    -- ── La plata y lo que hay que pagar: todo sale del plan de caja ─────────────────────
    v_plan := fin.fn_plan_caja_calcular('{"moneda": "CLP"}'::jsonb);
    v_caja := coalesce((v_plan #>> '{caja,total}')::numeric, 0);
    v_total := CASE WHEN v_usar THEN v_caja ELSE 0 END + v_entra_clp;
    v_resto := greatest(v_total, 0);

    v_sal := fin.fn_plan_caja_salidas(v_plan);

    -- ── Paso por paso, en el orden de las reglas ──────────────────────────────────────
    FOREACH v_cod IN ARRAY v_orden LOOP
        v_items := '[]'::jsonb; v_nec := 0; v_asig := 0; v_extra := '{}'::jsonb;
        IF v_cod = 'cuotas' THEN
            v_titulo := 'Una cuota de cada leasing o crédito';
            v_que := 'La cuota más vieja sin pagar de cada contrato (vencida o que vence en los próximos ' || v_dias_c || ' días): primero los marcados «pagar primero» y después el más atrasado.';
            FOR r IN
                SELECT c.e, c.clp
                  FROM (SELECT DISTINCT ON (e ->> 'acreedor_clave') e, (e ->> 'clp')::numeric AS clp, (e ->> 'dias_atraso')::integer AS atraso
                          FROM jsonb_array_elements(v_sal) e
                         WHERE e ->> 'clase' = 'cuota' AND e ->> 'origen' IN ('gasto', 'fijo', 'partida')
                           AND coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date, v_hoy) <= v_hoy + v_dias_c
                         ORDER BY e ->> 'acreedor_clave', coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date, v_hoy), (e ->> 'clp')::numeric, e ->> 'clave') c
                 ORDER BY coalesce((c.e ->> 'primero')::boolean, false) DESC, c.atraso DESC, c.clp, c.e ->> 'clave'
            LOOP
                SELECT count(*), coalesce(sum((x ->> 'clp')::numeric), 0) INTO v_n, v_m
                  FROM jsonb_array_elements(v_sal) x
                 WHERE x ->> 'clase' = 'cuota' AND x ->> 'acreedor_clave' = r.e ->> 'acreedor_clave' AND x ->> 'clave' <> r.e ->> 'clave'
                   AND (x ->> 'vence')::date < v_hoy;
                v_paga := v_resto >= r.clp;
                IF v_paga THEN v_resto := v_resto - r.clp; v_asig := v_asig + r.clp; END IF;
                v_nec := v_nec + r.clp;
                v_usadas := v_usadas || (r.e ->> 'clave');
                v_items := v_items || jsonb_build_array(r.e || jsonb_build_object('se_paga', v_paga, 'mas_vencidas', v_n, 'mas_vencidas_clp', v_m));
            END LOOP;
        ELSIF v_cod = 'sueldos' THEN
            v_titulo := 'Guardar para los sueldos de los próximos ' || v_dias_s || ' días';
            v_que := 'Los sueldos de choferes y de la oficina que se pagan hasta el ' || to_char(v_hoy + v_dias_s, 'DD/MM') || ', y los que quedaron atrasados. Es plata que se aparta, no un pago de hoy.';
            FOR r IN
                SELECT e, (e ->> 'clp')::numeric AS clp FROM jsonb_array_elements(v_sal) e
                 WHERE e ->> 'clase' = 'sueldo' AND coalesce((e ->> 'fecha')::date, (e ->> 'vence')::date, v_hoy) <= v_hoy + v_dias_s
                 ORDER BY coalesce((e ->> 'fecha')::date, (e ->> 'vence')::date, v_hoy), (e ->> 'clp')::numeric DESC, e ->> 'clave'
            LOOP
                v_nec := v_nec + r.clp;
                v_usadas := v_usadas || (r.e ->> 'clave');
                v_items := v_items || jsonb_build_array(r.e);
            END LOOP;
            v_asig := least(v_resto, v_nec);
            v_resto := v_resto - v_asig;
        ELSIF v_cod = 'espalda' THEN
            v_titulo := 'Espalda para operar';
            v_que := 'Plata que se deja sin tocar para combustible, fondos fijos de los choferes y gastos de aduana.';
            v_nec := v_espalda;
            v_asig := least(v_resto, v_nec);
            v_resto := v_resto - v_asig;
            v_oper := fin.fn_plan_caja_gasto_operativo(30);
            v_pordia := (v_oper ->> 'por_dia')::numeric;
            -- Lo operativo que el plan ya tiene anotado para estos días sale de la espalda
            SELECT coalesce(jsonb_agg(e ORDER BY (e ->> 'clp')::numeric DESC), '[]'::jsonb), coalesce(sum((e ->> 'clp')::numeric), 0) INTO v_items, v_m
              FROM jsonb_array_elements(v_sal) e
             WHERE e ->> 'clase' = 'operativo' AND coalesce((e ->> 'fecha')::date, v_hoy) <= v_hoy + 7;
            v_extra := jsonb_build_object('gasto_operativo', v_oper, 'comprometido', v_m,
                                          'dias_que_cubre', CASE WHEN v_pordia > 0 THEN floor(v_asig / v_pordia) END,
                                          'dias_que_cubriria_completa', CASE WHEN v_pordia > 0 THEN floor(v_nec / v_pordia) END);
        ELSE
            v_titulo := 'Cancelar deudas vencidas';
            v_que := 'Con lo que queda: primero las marcadas «pagar primero», después las que cobran interés (la más cara primero), después los proveedores de combustible y después las más viejas. Se pagan enteras; la que no alcanza se saltea.';
            FOR r IN
                SELECT e, (e ->> 'clp')::numeric AS clp FROM jsonb_array_elements(v_sal) e
                 WHERE e ->> 'clase' IN ('cuota', 'proveedor', 'impuesto', 'otra') AND (e ->> 'vence')::date < v_hoy
                   AND NOT (e ->> 'clave' = ANY (v_usadas))
                 ORDER BY coalesce((e ->> 'primero')::boolean, false) DESC,
                          CASE WHEN (e ->> 'tasa')::numeric > 0 THEN 0 WHEN e ->> 'tasa' IS NULL THEN 1 ELSE 2 END,
                          (e ->> 'tasa')::numeric DESC NULLS LAST, (e ->> 'critico')::boolean DESC, (e ->> 'dias_atraso')::integer DESC,
                          (e ->> 'clp')::numeric, e ->> 'clave'
            LOOP
                v_paga := v_resto >= r.clp;
                IF v_paga THEN v_resto := v_resto - r.clp; v_asig := v_asig + r.clp; END IF;
                v_nec := v_nec + r.clp;
                IF r.e ->> 'tasa' IS NULL THEN v_sin_tasa := v_sin_tasa + 1; v_sin_tasa_clp := v_sin_tasa_clp + r.clp; END IF;
                v_usadas := v_usadas || (r.e ->> 'clave');
                v_items := v_items || jsonb_build_array(r.e || jsonb_build_object('se_paga', v_paga));
            END LOOP;
        END IF;
        IF v_cod = 'cuotas' THEN v_nec_c := v_nec; ELSIF v_cod = 'sueldos' THEN v_nec_s := v_nec; ELSIF v_cod = 'espalda' THEN v_nec_e := v_nec; ELSE v_nec_d := v_nec; END IF;
        v_pasos := v_pasos || jsonb_build_array(jsonb_build_object(
            'codigo', v_cod, 'titulo', v_titulo, 'que_es', v_que, 'necesita', v_nec, 'asignado', v_asig,
            'falta', greatest(v_nec - v_asig, 0), 'queda_despues', v_resto, 'items', v_items) || v_extra);
    END LOOP;

    -- ── Lo que vence en estos días y el reparto no guarda ──────────────────────────────
    SELECT jsonb_build_object('dias', 7, 'monto', coalesce(sum((e ->> 'clp')::numeric), 0), 'cantidad', count(*),
                              'items', coalesce(jsonb_agg(e ORDER BY (e ->> 'vence')::date, (e ->> 'clp')::numeric DESC) FILTER (WHERE true), '[]'::jsonb))
      INTO v_pronto
      FROM jsonb_array_elements(v_sal) e
     WHERE e ->> 'clase' IN ('cuota', 'proveedor', 'impuesto', 'otra') AND (e ->> 'vence')::date BETWEEN v_hoy AND v_hoy + 7
       AND NOT (e ->> 'clave' = ANY (v_usadas));

    -- ── El interés por mes que se corta con estos pagos y el que sigue corriendo (solo donde se conoce la tasa) ──
    SELECT coalesce(round(sum((e ->> 'clp')::numeric * (e ->> 'tasa')::numeric / 100) FILTER (WHERE (e ->> 'se_paga')::boolean)), 0),
           coalesce(round(sum((e ->> 'clp')::numeric * (e ->> 'tasa')::numeric / 100) FILTER (WHERE NOT (e ->> 'se_paga')::boolean)), 0)
      INTO v_corta, v_sigue
      FROM jsonb_array_elements(v_pasos) p, jsonb_array_elements(p -> 'items') e
     WHERE p ->> 'codigo' IN ('cuotas', 'deudas') AND (e ->> 'tasa')::numeric > 0 AND (e ->> 'dias_atraso')::integer > 0;

    -- ── Disponible: la plata menos lo que ya tiene destino (cuotas de estos días, sueldos que vienen y espalda) ──
    v_prot := v_nec_c + v_nec_s + v_nec_e;

    -- ── La plata por moneda: lo que hay y lo que entra, contra lo que este reparto paga o guarda en cada moneda.
    --    La espalda no se cuenta acá: no tiene una moneda fija. ──
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'moneda', z.moneda, 'en_caja', z.en_caja, 'entra', z.entra, 'tiene', z.en_caja + z.entra, 'tiene_clp', z.caja_clp + z.entra_clp,
               'se_usa', round(z.se_usa, 2), 'se_usa_clp', round(z.se_usa_clp), 'diferencia', round(z.en_caja + z.entra - z.se_usa, 2),
               'diferencia_clp', round(z.caja_clp + z.entra_clp - z.se_usa_clp))
               ORDER BY (z.moneda <> 'CLP'), z.caja_clp + z.entra_clp DESC, z.moneda), '[]'::jsonb)
      INTO v_monedas
      FROM (SELECT m.moneda, sum(m.en_caja) AS en_caja, sum(m.caja_clp) AS caja_clp, sum(m.entra) AS entra, sum(m.entra_clp) AS entra_clp,
                   sum(m.se_usa) AS se_usa, sum(m.se_usa_clp) AS se_usa_clp
              FROM (SELECT btrim(c ->> 'moneda') AS moneda, coalesce((c ->> 'saldo')::numeric, 0) AS en_caja, coalesce((c ->> 'saldo_vista')::numeric, 0) AS caja_clp,
                           0::numeric AS entra, 0::numeric AS entra_clp, 0::numeric AS se_usa, 0::numeric AS se_usa_clp
                      FROM jsonb_array_elements(v_plan #> '{caja,cuentas}') c
                     WHERE v_usar
                    UNION ALL
                    SELECT v_mon, 0, 0, v_entra, v_entra_clp, 0, 0 WHERE v_entra > 0
                    UNION ALL
                    -- Lo que se paga (cuotas y deudas que alcanzan) y lo que se aparta para sueldos, en la parte que se llegó a apartar
                    SELECT btrim(e ->> 'moneda'), 0, 0, 0, 0, (e ->> 'monto')::numeric * k.parte, (e ->> 'clp')::numeric * k.parte
                      FROM jsonb_array_elements(v_pasos) p
                     CROSS JOIN LATERAL (SELECT CASE WHEN p ->> 'codigo' = 'sueldos' AND (p ->> 'necesita')::numeric > 0
                                                     THEN (p ->> 'asignado')::numeric / (p ->> 'necesita')::numeric ELSE 1 END AS parte) k
                     CROSS JOIN LATERAL jsonb_array_elements(p -> 'items') e
                     WHERE (p ->> 'codigo' IN ('cuotas', 'deudas') AND (e ->> 'se_paga')::boolean) OR p ->> 'codigo' = 'sueldos') m
             WHERE m.moneda IS NOT NULL AND m.moneda <> ''
             GROUP BY m.moneda) z;

    -- ── Avisos: lo que un gerente financiero miraría antes de decidir ───────────────────
    IF v_total <= 0 THEN
        v_avisos := v_avisos || to_jsonb('No hay plata para repartir: ' || CASE WHEN v_usar THEN 'la caja de hoy está en ' || to_char(v_caja, 'FM999G999G999G990') || ' y no se cargó nada que entre.'
                                                                              ELSE 'no se cargó cuánto entra y la caja de hoy no se está contando.' END);
    END IF;
    FOR r IN SELECT p FROM jsonb_array_elements(v_pasos) p WHERE (p ->> 'falta')::numeric > 0 AND p ->> 'codigo' <> 'deudas' LOOP
        v_avisos := v_avisos || to_jsonb('No alcanza para «' || (r.p ->> 'titulo') || '»: faltan ' || translate(to_char((r.p ->> 'falta')::numeric, 'FM999G999G999G990'), ',', '.') || ' CLP.');
    END LOOP;
    SELECT string_agg(DISTINCT coalesce(e ->> 'acreedor', e ->> 'titulo'), ', '), coalesce(sum((e ->> 'clp')::numeric), 0) INTO v_t, v_m
      FROM jsonb_array_elements(v_pasos) p, jsonb_array_elements(p -> 'items') e
     WHERE p ->> 'codigo' IN ('cuotas', 'deudas') AND coalesce((e ->> 'primero')::boolean, false) AND NOT (e ->> 'se_paga')::boolean;
    IF v_t IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('Marcado «pagar primero» y con esta plata no alcanza: ' || v_t || ' (' || translate(to_char(v_m, c_fmt), ',', '.')
                    || ' CLP). Si no puede esperar, probá con menos espalda o con «cancelar deudas» antes en el orden.');
    END IF;
    SELECT p INTO r FROM jsonb_array_elements(v_pasos) p WHERE p ->> 'codigo' = 'espalda';
    IF (r.p ->> 'dias_que_cubriria_completa') IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('La espalda de ' || translate(to_char(v_espalda, 'FM999G999G999G990'), ',', '.') || ' CLP cubre unos ' || (r.p ->> 'dias_que_cubriria_completa')
                    || ' días de combustible, fondos y aduana al ritmo de los últimos 30 días (' || translate(to_char(v_pordia, 'FM999G999G999G990'), ',', '.') || ' CLP por día, según los pagos anotados en Bancos).');
    ELSE
        v_avisos := v_avisos || to_jsonb('No hay pagos de combustible, fondos ni aduana anotados en los últimos 30 días: no se puede decir cuántos días de operación cubre la espalda.'::text);
    END IF;
    IF v_corta > 0 OR v_sigue > 0 THEN
        v_avisos := v_avisos || to_jsonb(
            CASE WHEN v_corta > 0 THEN 'Con estos pagos se dejan de generar unos ' || translate(to_char(v_corta, 'FM999G999G999G990'), ',', '.') || ' CLP de interés por mes'
                      || CASE WHEN v_sigue > 0 THEN '; lo vencido que queda sin pagar sigue generando unos ' || translate(to_char(v_sigue, 'FM999G999G999G990'), ',', '.') || ' CLP por mes' ELSE '' END
                 ELSE 'Lo vencido que queda sin pagar genera unos ' || translate(to_char(v_sigue, 'FM999G999G999G990'), ',', '.') || ' CLP de interés por mes' END
            || ' (cuenta hecha solo con los intereses que se conocen).');
    END IF;
    IF v_sin_tasa > 0 THEN
        v_avisos := v_avisos || to_jsonb(CASE WHEN v_sin_tasa = 1 THEN 'Hay 1 deuda vencida' ELSE 'Hay ' || v_sin_tasa || ' deudas vencidas' END || ' (' || translate(to_char(v_sin_tasa_clp, 'FM999G999G999G990'), ',', '.')
                    || ' CLP) sin el dato de cuánto cobran de interés: entre ellas el orden es por antigüedad. Cargale el interés por mes a las que cobran mora y el orden se acomoda solo.');
    END IF;
    IF (v_pronto ->> 'cantidad')::integer > 0 THEN
        v_avisos := v_avisos || to_jsonb('En los próximos 7 días vencen además ' || translate(to_char((v_pronto ->> 'monto')::numeric, 'FM999G999G999G990'), ',', '.') || ' CLP ('
                    || (v_pronto ->> 'cantidad') || CASE WHEN (v_pronto ->> 'cantidad')::integer = 1 THEN ' pago' ELSE ' pagos' END || ') que este reparto no guarda: si se usa todo lo que sobra, van a quedar vencidos.');
    END IF;
    SELECT string_agg((e ->> 'acreedor') || ' (' || (1 + (e ->> 'mas_vencidas')::integer) || ' cuotas vencidas)', ', ' ORDER BY (e ->> 'mas_vencidas')::integer DESC) INTO v_t
      FROM jsonb_array_elements(v_pasos) p, jsonb_array_elements(p -> 'items') e
     WHERE p ->> 'codigo' = 'cuotas' AND (e ->> 'mas_vencidas')::integer >= 2 AND (e ->> 'dias_atraso')::integer > 0;
    IF v_t IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('Contratos con 3 o más cuotas vencidas, que son los de más riesgo: ' || v_t || '.');
    END IF;
    -- La otra moneda: lo que falta comprar para pagar, o lo que sobra y está contado como pesos chilenos
    FOR r IN SELECT z ->> 'moneda' AS moneda, (z ->> 'tiene')::numeric AS tiene, (z ->> 'se_usa')::numeric AS usa,
                    (z ->> 'diferencia')::numeric AS dif, (z ->> 'diferencia_clp')::numeric AS dif_clp
               FROM jsonb_array_elements(v_monedas) z WHERE z ->> 'moneda' <> 'CLP' LOOP
        v_t := CASE r.moneda WHEN 'USD' THEN 'dólares' WHEN 'ARS' THEN 'pesos argentinos' ELSE r.moneda END;
        IF r.usa > 0 AND r.dif <= -1 THEN
            v_avisos := v_avisos || to_jsonb('Este reparto paga ' || translate(to_char(r.usa, c_fmt), ',', '.') || ' ' || r.moneda || ' en ' || v_t
                        || CASE WHEN r.tiene >= 1 THEN ' y hay ' || translate(to_char(r.tiene, c_fmt), ',', '.') || ' ' || r.moneda || ': faltan '
                                                         || translate(to_char(-r.dif, c_fmt), ',', '.') || ' ' || r.moneda || ', que hay que comprar.'
                                ELSE ' y no hay ' || v_t || ' en caja: hay que comprarlos.' END);
        ELSIF r.dif_clp >= 1000000 OR (v_total > 0 AND r.dif_clp >= v_total * 0.05) THEN
            v_avisos := v_avisos || to_jsonb('Hay ' || translate(to_char(r.dif, c_fmt), ',', '.') || ' ' || r.moneda || ' (unos ' || translate(to_char(r.dif_clp, c_fmt), ',', '.')
                        || ' CLP al cambio de hoy) que este reparto no usa en ' || v_t || ': están contados como pesos chilenos. Para pagar en pesos hay que venderlos.');
        END IF;
    END LOOP;
    -- Lo que el plan ya avisa y cambia esta cuenta: sueldos sin liquidación, caja que puede no ser la real, monedas sin cambio
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_items FROM jsonb_array_elements_text(v_plan -> 'avisos') a
     WHERE a LIKE 'Sueldos de choferes que todavía no están en el plan%'
        OR (v_usar AND (a LIKE 'El saldo es el del sistema%' OR a LIKE 'Sin ninguna cartola importada%' OR a LIKE 'Hay % del banco sin conciliar%' OR a LIKE 'No se suma a la caja%'))
        OR a LIKE 'Hay partidas en una moneda sin tipo de cambio%' OR a LIKE 'Hay % pagados a cuenta a proveedores%';
    v_avisos := v_avisos || v_items;

    RETURN jsonb_build_object(
        'hoy', v_hoy, 'moneda', 'CLP',
        'dinero', jsonb_build_object('en_caja', v_caja, 'usa_caja', v_usar, 'entra', v_entra, 'entra_moneda', v_mon, 'entra_clp', v_entra_clp, 'total', v_total,
                                     'por_moneda', v_monedas),
        'disponible', jsonb_build_object('monto', v_total - v_prot, 'plata', v_total, 'cuotas', v_nec_c, 'sueldos', v_nec_s, 'espalda', v_nec_e,
                                         'protegido', v_prot, 'deudas_vencidas', v_nec_d, 'vence_7_dias', coalesce((v_pronto ->> 'monto')::numeric, 0)),
        'reglas', jsonb_build_object('orden', to_jsonb(v_orden), 'espalda', v_espalda, 'reserva_sueldos_dias', v_dias_s, 'cuotas_dias', v_dias_c,
                                     'guardadas', jsonb_build_object('orden', to_jsonb(v_orden_g), 'espalda', v_espalda_g, 'reserva_sueldos_dias', v_dias_s_g, 'cuotas_dias', v_dias_c_g)),
        'pasos', v_pasos,
        'repartido', (SELECT coalesce(sum((p ->> 'asignado')::numeric), 0) FROM jsonb_array_elements(v_pasos) p),
        'sobra', v_resto,
        'sin_cubrir', (SELECT coalesce(sum((p ->> 'falta')::numeric), 0) FROM jsonb_array_elements(v_pasos) p),
        'vence_pronto', v_pronto,
        'interes', jsonb_build_object('se_corta_por_mes', v_corta, 'sigue_por_mes', v_sigue),
        'avisos', v_avisos);
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_reparto_calcular(jsonb) IS
    'Migraciones 368 y 369: arma la propuesta de qué hacer con la plata (caja de hoy más lo que entra), paso por paso según las reglas de Gerencia; dice el disponible (la plata menos cuotas, sueldos y espalda) y la plata por moneda. Lo marcado «pagar primero» va antes. Solo propone. Interna: la usan fin.fn_plan_caja_reparto e Iris.';

-- Cargar (o sacar) lo que se sabe de un acreedor: el interés por mes que cobra si se le paga tarde y la marca «pagar primero»
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_mora_guardar(p_tipo text, p_id bigint, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_plan_caja(); d jsonb := coalesce(p_datos, '{}'::jsonb);
    v_tasa numeric; v_existe boolean; v_primero boolean; v_nota text; v_ya fin.plan_caja_mora%ROWTYPE;
BEGIN
    IF p_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('fijo', 'proveedor', 'partida', 'gasto') THEN
        RAISE EXCEPTION 'A esa deuda no se le puede cargar el interés ni la marca' USING ERRCODE = '22023';
    END IF;
    v_existe := CASE p_tipo WHEN 'fijo' THEN EXISTS (SELECT 1 FROM fin.gasto_fijo WHERE id = p_id AND eliminado_en IS NULL)
                            WHEN 'proveedor' THEN EXISTS (SELECT 1 FROM mae.proveedor WHERE id = p_id)
                            WHEN 'gasto' THEN EXISTS (SELECT 1 FROM fin.gasto WHERE id = p_id AND eliminado_en IS NULL)
                            ELSE EXISTS (SELECT 1 FROM fin.plan_caja_partida WHERE id = p_id OR serie_id = p_id) END;
    IF NOT v_existe THEN RAISE EXCEPTION 'Esa deuda ya no existe: volvé a abrir el planificador' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO v_ya FROM fin.plan_caja_mora WHERE origen = p_tipo AND origen_id = p_id;

    -- Lo que no viene queda como estaba; lo que viene vacío se saca
    IF d ? 'tasa_mensual' THEN
        BEGIN
            v_tasa := nullif(btrim(d ->> 'tasa_mensual'), '')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION 'El interés va en número, por ejemplo 2,5' USING ERRCODE = '22023';
        END;
    ELSE
        v_tasa := v_ya.tasa_mensual;
    END IF;
    IF d ? 'pagar_primero' AND jsonb_typeof(d -> 'pagar_primero') <> 'null' THEN
        BEGIN
            v_primero := (d ->> 'pagar_primero')::boolean;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'La marca «pagar primero» va en sí o no' USING ERRCODE = '22023';
        END;
    ELSE
        v_primero := coalesce(v_ya.pagar_primero, false);
    END IF;
    v_nota := CASE WHEN d ? 'nota' THEN nullif(regexp_replace(btrim(coalesce(d ->> 'nota', '')), '\s+', ' ', 'g'), '') ELSE v_ya.nota END;

    IF length(v_nota) > 300 THEN RAISE EXCEPTION 'La nota puede tener hasta 300 letras' USING ERRCODE = '22023'; END IF;
    IF v_tasa IS NOT NULL AND (v_tasa < 0 OR v_tasa > 50) THEN RAISE EXCEPTION 'El interés por mes va de 0 a 50 por ciento' USING ERRCODE = '22023'; END IF;
    IF v_tasa IS NULL AND NOT v_primero THEN
        -- Sin interés y sin marca: se saca lo cargado y vuelve a valer lo que resulte de la mora ya pagada
        DELETE FROM fin.plan_caja_mora WHERE origen = p_tipo AND origen_id = p_id;
        RETURN NULL;
    END IF;
    INSERT INTO fin.plan_caja_mora (origen, origen_id, tasa_mensual, pagar_primero, nota, actualizado_en, actualizado_por)
    VALUES (p_tipo, p_id, round(v_tasa, 3), v_primero, v_nota, now(), v_usr)
    ON CONFLICT (origen, origen_id) DO UPDATE
       SET tasa_mensual = EXCLUDED.tasa_mensual, pagar_primero = EXCLUDED.pagar_primero, nota = EXCLUDED.nota, actualizado_en = now(), actualizado_por = v_usr;
    RETURN jsonb_build_object('tipo', p_tipo, 'id', p_id, 'tasa_mensual', round(v_tasa, 3), 'pagar_primero', v_primero, 'nota', v_nota);
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_mora_guardar(text, bigint, jsonb) IS
    'Migraciones 368 y 369: guarda lo que se sabe de un acreedor (contrato en cuotas, proveedor, deuda a mano o gasto suelto): tasa_mensual (interés por mes en %, vacío lo saca), pagar_primero (va antes en el reparto) y nota. Sin interés y sin marca, borra la fila. Finanzas, Gerencia o TI.';

-- ---------------------------------------------------------------------------------
-- 4 · Prueba con los datos de esta base: si la cuenta falla o no cierra, no queda nada aplicado
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE j jsonb; v_tipo text; v_id bigint; v_mal text;
BEGIN
    j := fin.fn_plan_caja_reparto_calcular('{}'::jsonb);
    IF jsonb_array_length(j -> 'pasos') <> 4 THEN RAISE EXCEPTION 'el reparto no trae los cuatro pasos'; END IF;
    IF (j ->> 'repartido')::numeric + (j ->> 'sobra')::numeric <> greatest((j #>> '{dinero,total}')::numeric, 0) THEN
        RAISE EXCEPTION 'el reparto de la caja de hoy no cierra: % repartido + % que sobra, de %', j ->> 'repartido', j ->> 'sobra', j #>> '{dinero,total}';
    END IF;
    IF (j #>> '{disponible,monto}')::numeric <> (j #>> '{dinero,total}')::numeric
           - (SELECT coalesce(sum((p ->> 'necesita')::numeric), 0) FROM jsonb_array_elements(j -> 'pasos') p WHERE p ->> 'codigo' <> 'deudas') THEN
        RAISE EXCEPTION 'el disponible no cierra: % con % de plata', j #>> '{disponible,monto}', j #>> '{dinero,total}';
    END IF;
    IF abs((SELECT coalesce(sum((z ->> 'tiene_clp')::numeric), 0) FROM jsonb_array_elements(j #> '{dinero,por_moneda}') z) - (j #>> '{dinero,total}')::numeric) > 1 THEN
        RAISE EXCEPTION 'la plata por moneda no suma lo mismo que la caja: %', j #> '{dinero,por_moneda}';
    END IF;
    -- Con plata que entra y otro orden; en dólares si hay tipo de cambio cargado (si no, en pesos)
    j := fin.fn_plan_caja_reparto_calcular(CASE WHEN fin.fn_tc_clp_o_null('USD', mae.fn_hoy()) > 0
                 THEN '{"entra": 100000, "entra_moneda": "USD", "usar_caja": false, "orden": ["espalda", "sueldos", "cuotas", "deudas"]}'
                 ELSE '{"entra": 95000000, "usar_caja": false, "orden": ["espalda", "sueldos", "cuotas", "deudas"]}' END::jsonb);
    IF (j ->> 'repartido')::numeric + (j ->> 'sobra')::numeric <> (j #>> '{dinero,total}')::numeric THEN
        RAISE EXCEPTION 'el reparto de plata que entra no cierra: % repartido + % que sobra, de %', j ->> 'repartido', j ->> 'sobra', j #>> '{dinero,total}';
    END IF;

    -- «Pagar primero»: se marca la última deuda vencida de la lista, se mira que quede antes que las no marcadas y se
    -- deshace (termina en error a propósito: no queda nada guardado).
    j := fin.fn_plan_caja_reparto_calcular('{}'::jsonb);
    SELECT e ->> 'acreedor_tipo', (e ->> 'acreedor_id')::bigint INTO v_tipo, v_id
      FROM jsonb_array_elements(j -> 'pasos') p, jsonb_array_elements(p -> 'items') WITH ORDINALITY t(e, n)
     WHERE p ->> 'codigo' = 'deudas' AND NOT coalesce((e ->> 'primero')::boolean, false) AND e ->> 'acreedor_tipo' IS NOT NULL
     ORDER BY n DESC LIMIT 1;
    IF v_tipo IS NOT NULL THEN
        BEGIN
            INSERT INTO fin.plan_caja_mora (origen, origen_id, tasa_mensual, pagar_primero) VALUES (v_tipo, v_id, NULL, true)
            ON CONFLICT (origen, origen_id) DO UPDATE SET pagar_primero = true;
            j := fin.fn_plan_caja_reparto_calcular('{}'::jsonb);
            SELECT CASE WHEN NOT bool_or((e ->> 'acreedor_tipo') = v_tipo AND (e ->> 'acreedor_id')::bigint = v_id AND (e ->> 'primero')::boolean)
                        THEN 'la deuda marcada no salió marcada'
                        WHEN max(n) FILTER (WHERE (e ->> 'primero')::boolean) > min(n) FILTER (WHERE NOT (e ->> 'primero')::boolean)
                        THEN 'una deuda sin marcar quedó antes que una marcada' END
              INTO v_mal
              FROM jsonb_array_elements(j -> 'pasos') p, jsonb_array_elements(p -> 'items') WITH ORDINALITY t(e, n)
             WHERE p ->> 'codigo' = 'deudas';
            RAISE EXCEPTION 'deshacer la marca de prueba' USING ERRCODE = 'ZZ369';
        EXCEPTION WHEN SQLSTATE 'ZZ369' THEN NULL;
        END;
        IF v_mal IS NOT NULL THEN RAISE EXCEPTION '«pagar primero»: %', v_mal; END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 369 no pasó su prueba con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: el disponible de hoy y cómo está repartida la caja
WITH r AS (SELECT fin.fn_plan_caja_reparto_calcular('{}'::jsonb) AS j)
SELECT 'migración 369 aplicada' AS que,
       (j #>> '{dinero,en_caja}')::numeric AS caja_hoy_clp,
       (j #>> '{disponible,cuotas}')::numeric AS cuotas_de_estos_dias,
       (j #>> '{disponible,sueldos}')::numeric AS sueldos_que_vienen,
       (j #>> '{disponible,espalda}')::numeric AS espalda,
       (j #>> '{disponible,monto}')::numeric AS disponible_hoy_clp,
       (SELECT string_agg(translate(to_char((z ->> 'tiene')::numeric, 'FM999G999G999G999G990'), ',', '.') || ' ' || (z ->> 'moneda'), ' · ')
          FROM jsonb_array_elements(j #> '{dinero,por_moneda}') z WHERE (z ->> 'tiene')::numeric <> 0) AS caja_por_moneda,
       (SELECT count(*) FROM fin.plan_caja_mora WHERE pagar_primero) AS marcados_pagar_primero
  FROM r;
