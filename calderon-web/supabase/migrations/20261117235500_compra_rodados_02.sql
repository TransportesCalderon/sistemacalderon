-- Finanzas · Compra de vehículos 02: también camionetas, autos y otros vehículos que no son de la flota
-- Pedido del 17/11/2026: comprar una camioneta o un auto con pagarés no es lo mismo que el leasing de un tractor.
-- NO cambia web.version_base. Necesita compra_rodados.sql. Se puede correr más de una vez.
--  · La compra puede ser de «otro vehículo»: se identifica con una descripción («Camioneta Hilux ABCD12»), sin estar en Flota.
--  · Esos vehículos entran al activo en una cuenta propia: 1.2.04 «Rodados (camionetas y autos)» (la crea si no existe).
--  · Los tractores y semirremolques siguen en 1.2.01. Las cuotas que faltan pagar aparecen igual, mes a mes, para pagar.

BEGIN;

DO $do$
BEGIN
    IF to_regclass('fin.compra_rodado') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr compra_rodados.sql'; END IF;
END $do$;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fin.rodado_cuenta_activo_otros', '"1.2.04"', 'Código de la cuenta contable donde entra el valor de camionetas, autos y otros vehículos comprados que no son de la flota.')
ON CONFLICT (codigo) DO NOTHING;

DO $do$
DECLARE v_cod text := ref.fn_parametro_texto('fin.rodado_cuenta_activo_otros', '1.2.04'); v_padre smallint; c record;
BEGIN
    SELECT * INTO c FROM fin.cuenta_contable WHERE codigo = v_cod AND eliminado_en IS NULL;
    IF NOT FOUND THEN
        SELECT padre_id INTO v_padre FROM fin.cuenta_contable WHERE codigo = ref.fn_parametro_texto('fin.rodado_cuenta_activo', '1.2.01') AND eliminado_en IS NULL;
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.cuenta_contable (codigo, nombre, tipo, padre_id, imputable, activa)
        VALUES (v_cod, 'Rodados (camionetas y autos)', 'activo', v_padre, true, true);
    ELSIF c.tipo <> 'activo' OR NOT c.imputable THEN
        RAISE EXCEPTION 'La cuenta % ya existe y no es un activo que se pueda usar (%): avisar antes de seguir', v_cod, c.nombre;
    END IF;
END $do$;

ALTER TABLE fin.compra_rodado ADD COLUMN IF NOT EXISTS descripcion text;
COMMENT ON COLUMN fin.compra_rodado.descripcion IS 'Qué vehículo es, cuando no es un tractor ni un semirremolque de la flota (camioneta, auto…).';
ALTER TABLE fin.compra_rodado DROP CONSTRAINT IF EXISTS ck_cr_unidad;
ALTER TABLE fin.compra_rodado ADD CONSTRAINT ck_cr_unidad
    CHECK ((camion_id IS NOT NULL)::int + (semi_id IS NOT NULL)::int + (descripcion IS NOT NULL)::int = 1 AND coalesce(length(descripcion), 3) BETWEEN 3 AND 80);

CREATE OR REPLACE FUNCTION fin.fn_contabilizar_rodado(p_id bigint)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE c fin.compra_rodado%ROWTYPE; v_pat text; v_pagado numeric; v_pend numeric;
BEGIN
    SELECT * INTO c FROM fin.compra_rodado WHERE id = p_id;
    IF NOT FOUND OR c.estado <> 'vigente' THEN PERFORM fin.fn_grabar_asiento('rodado', p_id, current_date, '', '[]'); RETURN; END IF;
    v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = c.camion_id), (SELECT patente FROM mae.semirremolque WHERE id = c.semi_id), c.descripcion);
    v_pagado := fin.fn_rodado_capital_hasta(c, c.documentos_previos) + CASE WHEN c.pie_pagado_antes THEN c.pie ELSE 0 END;
    v_pend := c.valor_neto + c.iva - v_pagado;
    PERFORM fin.fn_grabar_asiento('rodado', c.id, c.fecha, 'Compra de vehículo ' || v_pat, jsonb_build_array(
        fin.fn_linea(fin.fn_rodado_cuenta(CASE WHEN c.camion_id IS NULL AND c.semi_id IS NULL THEN 'activo_otros' ELSE 'activo' END), c.valor_neto, 0, 'Compra ' || v_pat, c.camion_id),
        fin.fn_linea(fin.fn_cuenta_uso('IVA_CREDITO'), c.iva, 0, 'IVA compra ' || v_pat),
        fin.fn_linea(fin.fn_rodado_cuenta('documentos'), 0, v_pend, 'Documentos y pie por pagar ' || v_pat, NULL, 'proveedor', c.proveedor_id),
        fin.fn_linea(fin.fn_cuenta_uso('APERTURA'), 0, v_pagado, 'Pagado antes de cargar la compra ' || v_pat)));
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_contabilizar_depreciacion(p_id bigint)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE d fin.rodado_depreciacion%ROWTYPE; c fin.compra_rodado%ROWTYPE; v_pat text;
BEGIN
    SELECT * INTO d FROM fin.rodado_depreciacion WHERE id = p_id;
    IF FOUND THEN SELECT * INTO c FROM fin.compra_rodado WHERE id = d.compra_id; END IF;
    IF d.id IS NULL OR c.estado IS DISTINCT FROM 'vigente' THEN PERFORM fin.fn_grabar_asiento('depreciacion', p_id, current_date, '', '[]'); RETURN; END IF;
    v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = c.camion_id), (SELECT patente FROM mae.semirremolque WHERE id = c.semi_id), c.descripcion);
    PERFORM fin.fn_grabar_asiento('depreciacion', d.id, (d.periodo + interval '1 month' - interval '1 day')::date,
        'Depreciación ' || v_pat || CASE WHEN d.previa THEN ' · acumulada antes de cargar la compra' ELSE ' · ' || to_char(d.periodo, 'MM/YYYY') END,
        jsonb_build_array(
            fin.fn_linea(CASE WHEN d.previa THEN fin.fn_cuenta_uso('APERTURA') ELSE fin.fn_cuenta_uso('DEPRECIACION') END, d.monto, 0, 'Depreciación ' || v_pat, c.camion_id),
            fin.fn_linea(fin.fn_rodado_cuenta('dep_acum'), 0, d.monto, 'Depreciación ' || v_pat, c.camion_id)));
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_registrar_compra_rodado(p_datos jsonb)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint; c fin.compra_rodado%ROWTYPE; v_pat text; v_fijo bigint; v_tot_docs numeric; v_fin numeric;
    v_camion bigint := nullif(p_datos ->> 'camion_id', '')::bigint; v_semi bigint := nullif(p_datos ->> 'semi_id', '')::bigint;
    v_fecha date := (p_datos ->> 'fecha')::date; v_valor numeric := nullif(p_datos ->> 'valor_neto', '')::numeric;
    v_iva numeric := coalesce(nullif(p_datos ->> 'iva', '')::numeric, 0); v_pie numeric := coalesce(nullif(p_datos ->> 'pie', '')::numeric, 0);
    v_pie_antes boolean := coalesce((p_datos ->> 'pie_pagado_antes')::boolean, false);
    v_docs integer := coalesce(nullif(p_datos ->> 'documentos', '')::integer, 0); v_monto numeric := coalesce(nullif(p_datos ->> 'monto_documento', '')::numeric, 0);
    v_primer date := nullif(p_datos ->> 'primer_vencimiento', '')::date; v_previos integer := coalesce(nullif(p_datos ->> 'documentos_previos', '')::integer, 0);
    v_vida integer := nullif(p_datos ->> 'vida_util_meses', '')::integer; v_res numeric := coalesce(nullif(p_datos ->> 'valor_residual', '')::numeric, 0);
    v_prov bigint := nullif(p_datos ->> 'proveedor_id', '')::bigint;
    v_desc text := nullif(btrim(regexp_replace(coalesce(p_datos ->> 'descripcion', ''), '\s+', ' ', 'g')), '');
BEGIN
    v_usr := fin.fn_exigir_finanzas();
    IF v_camion IS NOT NULL AND v_semi IS NOT NULL THEN RAISE EXCEPTION 'Elegí una sola unidad' USING ERRCODE = '22023'; END IF;
    IF v_camion IS NULL AND v_semi IS NULL THEN
        -- Otro vehículo (camioneta, auto…): no está en la flota, se identifica con su descripción
        IF v_desc IS NULL OR length(v_desc) < 3 THEN RAISE EXCEPTION 'Escribí qué vehículo es (por ejemplo «Camioneta Hilux ABCD12»)' USING ERRCODE = '22023'; END IF;
        IF length(v_desc) > 80 THEN RAISE EXCEPTION 'La descripción del vehículo es muy larga (máximo 80 letras)' USING ERRCODE = '22023'; END IF;
        IF EXISTS (SELECT 1 FROM fin.compra_rodado x WHERE x.estado = 'vigente' AND lower(x.descripcion) = lower(v_desc)) THEN
            RAISE EXCEPTION 'Ya hay una compra cargada con ese nombre: %', v_desc USING ERRCODE = '23505';
        END IF;
        v_pat := v_desc;
        PERFORM fin.fn_rodado_cuenta('activo_otros');
    ELSE
        v_desc := NULL;
        v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = v_camion AND eliminado_en IS NULL), (SELECT patente FROM mae.semirremolque WHERE id = v_semi AND eliminado_en IS NULL));
        IF v_pat IS NULL THEN RAISE EXCEPTION 'La unidad no existe' USING ERRCODE = 'P0002'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM fin.compra_rodado x WHERE x.estado = 'vigente' AND (x.camion_id = v_camion OR x.semi_id = v_semi)) THEN
        RAISE EXCEPTION 'La unidad % ya tiene una compra cargada', v_pat USING ERRCODE = '23505';
    END IF;
    IF upper(coalesce(nullif(p_datos ->> 'moneda', ''), 'CLP')) <> 'CLP' THEN RAISE EXCEPTION 'Por ahora la compra de vehículos se carga en pesos chilenos' USING ERRCODE = '22023'; END IF;
    IF v_fecha IS NULL OR v_fecha > mae.fn_hoy() THEN RAISE EXCEPTION 'Escribí la fecha de la compra (no puede ser futura)' USING ERRCODE = '22023'; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Escribí el valor contado del vehículo (sin IVA)' USING ERRCODE = '22023'; END IF;
    IF v_iva < 0 OR v_pie < 0 THEN RAISE EXCEPTION 'El IVA y el pie no pueden ser negativos' USING ERRCODE = '22023'; END IF;
    IF v_pie > v_valor + v_iva THEN RAISE EXCEPTION 'El pie no puede ser más que el valor del vehículo con IVA' USING ERRCODE = '22023'; END IF;
    IF v_docs NOT BETWEEN 0 AND 240 THEN RAISE EXCEPTION 'La cantidad de documentos va de 0 a 240' USING ERRCODE = '22023'; END IF;
    v_fin := v_valor + v_iva - v_pie;
    IF v_docs = 0 THEN
        IF v_fin <> 0 THEN RAISE EXCEPTION 'Sin documentos, el pie tiene que ser todo el valor con IVA (%)', v_valor + v_iva USING ERRCODE = '22023'; END IF;
        v_monto := 0; v_previos := 0; v_primer := NULL;
    ELSE
        IF v_fin <= 0 THEN RAISE EXCEPTION 'El pie ya cubre todo el valor: no quedan documentos por cargar' USING ERRCODE = '22023'; END IF;
        IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribí el monto de cada documento' USING ERRCODE = '22023'; END IF;
        IF v_primer IS NULL THEN RAISE EXCEPTION 'Escribí el vencimiento del primer documento' USING ERRCODE = '22023'; END IF;
        IF v_primer < v_fecha THEN RAISE EXCEPTION 'El primer documento no puede vencer antes de la compra' USING ERRCODE = '22023'; END IF;
        IF v_previos NOT BETWEEN 0 AND v_docs THEN RAISE EXCEPTION 'Los documentos ya pagados van de 0 a %', v_docs USING ERRCODE = '22023'; END IF;
        v_tot_docs := v_docs * v_monto;
        IF v_tot_docs < v_fin THEN
            RAISE EXCEPTION 'Los documentos suman % y lo financiado es % (valor + IVA − pie): revisá los montos', v_tot_docs, v_fin USING ERRCODE = '22023';
        END IF;
    END IF;
    IF v_vida IS NULL OR v_vida NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Escribí la vida útil en meses (de 1 a 600)' USING ERRCODE = '22023'; END IF;
    IF v_res < 0 OR v_res >= v_valor THEN RAISE EXCEPTION 'El valor residual va de 0 a menos que el valor del vehículo' USING ERRCODE = '22023'; END IF;
    PERFORM fin.fn_rodado_cuenta('activo'), fin.fn_rodado_cuenta('documentos'), fin.fn_rodado_cuenta('intereses'), fin.fn_rodado_cuenta('dep_acum');

    INSERT INTO fin.compra_rodado (camion_id, semi_id, fecha, proveedor_id, valor_neto, iva, pie, pie_pagado_antes, documentos, monto_documento, primer_vencimiento,
                                   documentos_previos, vida_util_meses, valor_residual, alta_mes, observacion, creado_por, descripcion)
    VALUES (v_camion, v_semi, v_fecha, v_prov, v_valor, v_iva, v_pie, v_pie_antes OR v_pie = 0, v_docs, v_monto, v_primer, v_previos, v_vida, v_res,
            least(date_trunc('month', mae.fn_hoy()), date_trunc('month', fin.fn_contabilidad_desde()))::date, nullif(btrim(p_datos ->> 'observacion'), ''), v_usr, v_desc)
    RETURNING * INTO c;

    PERFORM set_config('fin.cont_fn', '1', true);
    PERFORM fin.fn_contabilizar_rodado(c.id);

    -- El pie que todavía no se pagó: un gasto para pagar con «Pagar»
    IF c.pie > 0 AND NOT c.pie_pagado_antes THEN
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.gasto (fecha, proveedor_id, tipo_documento, descripcion, cuenta_id, camion_id, moneda, exento, neto, iva, retencion, total, tc_clp, vence, compra_rodado_id)
        VALUES (c.fecha, c.proveedor_id, 'sin_documento', 'Pie de la compra de ' || v_pat, fin.fn_rodado_cuenta('documentos'), c.camion_id, 'CLP', c.pie, 0, 0, 0, c.pie, 1, c.fecha, c.id);
    END IF;

    -- Los documentos: un gasto fijo con cuotas (cada mes aparece el documento para pagar)
    IF c.documentos > 0 THEN
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.gasto_fijo (nombre, proveedor_id, cuenta_id, tipo_documento, moneda, monto, dia_vence, camion_id, desde, hasta, activo, observacion, cuotas, cuotas_previas, compra_rodado_id)
        VALUES ('Documentos compra ' || v_pat, c.proveedor_id, fin.fn_rodado_cuenta('documentos'), 'sin_documento', 'CLP', c.monto_documento,
                least(extract(day FROM c.primer_vencimiento)::integer, 28), c.camion_id, date_trunc('month', c.primer_vencimiento)::date,
                (date_trunc('month', c.primer_vencimiento) + make_interval(months => c.documentos::integer) - interval '1 day')::date, true,
                'Creado al registrar la compra del vehículo', c.documentos, c.documentos_previos, c.id)
        RETURNING id INTO v_fijo;
        IF c.semi_id IS NOT NULL THEN INSERT INTO fin.gasto_fijo_equipo (gasto_fijo_id, semi_id, creado_por) VALUES (v_fijo, c.semi_id, v_usr); END IF;
        UPDATE fin.compra_rodado SET gasto_fijo_id = v_fijo WHERE id = c.id;
        PERFORM fin.fn_generar_gastos_fijos_mes(mae.fn_hoy()); -- el documento de este mes y los ya vencidos que faltan pagar
        PERFORM fin.fn_gasto_fijo_prever_pagos(v_fijo);
    END IF;

    PERFORM fin.fn_rodado_depreciar(c.id);
    RETURN c.id;
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_compras_rodados()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN jsonb_build_object(
        'tractores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'patente', t.patente) ORDER BY t.patente), '[]'::jsonb) FROM mae.camion t
                       WHERE t.eliminado_en IS NULL AND NOT EXISTS (SELECT 1 FROM fin.compra_rodado x WHERE x.camion_id = t.id AND x.estado = 'vigente')),
        'semis', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'patente', s.patente) ORDER BY s.patente), '[]'::jsonb) FROM mae.semirremolque s
                   WHERE s.eliminado_en IS NULL AND NOT EXISTS (SELECT 1 FROM fin.compra_rodado x WHERE x.semi_id = s.id AND x.estado = 'vigente')),
        'compras', coalesce((
            SELECT jsonb_agg(to_jsonb(q) ORDER BY q.patente) FROM (
                SELECT c.id, CASE WHEN c.camion_id IS NOT NULL THEN 'tractor' WHEN c.semi_id IS NOT NULL THEN 'semi' ELSE 'otro' END AS tipo, coalesce(t.patente, s.patente, c.descripcion) AS patente,
                       c.fecha, p.razon_social AS proveedor, c.valor_neto, c.iva, c.pie, c.pie_pagado_antes, c.documentos, c.monto_documento, c.primer_vencimiento,
                       c.documentos_previos, c.vida_util_meses, c.valor_residual, c.gasto_fijo_id, c.observacion,
                       greatest(c.documentos * c.monto_documento - fin.fn_rodado_financiado(c), 0) AS interes_total,
                       d.acum AS depreciacion_acumulada, c.valor_neto - d.acum AS valor_libro,
                       round((c.valor_neto - c.valor_residual) / c.vida_util_meses, 0) AS depreciacion_mes,
                       pg.docs AS documentos_pagados,
                       -- lo que falta pagar: documentos que no aparecieron todavía + saldo de los que sí + pie sin pagar
                       (c.documentos - c.documentos_previos - pg.generados) * c.monto_documento + pg.saldo AS falta_pagar,
                       pg.vencido
                  FROM fin.compra_rodado c
                  LEFT JOIN mae.camion t ON t.id = c.camion_id LEFT JOIN mae.semirremolque s ON s.id = c.semi_id LEFT JOIN mae.proveedor p ON p.id = c.proveedor_id
                  CROSS JOIN LATERAL (SELECT coalesce(sum(x.monto), 0) AS acum FROM fin.rodado_depreciacion x WHERE x.compra_id = c.id) d
                  CROSS JOIN LATERAL (
                      SELECT c.documentos_previos + count(*) FILTER (WHERE g.gasto_fijo_id IS NOT NULL AND fin.fn_saldo_gasto(g.id) <= 0) AS docs,
                             count(*) FILTER (WHERE g.gasto_fijo_id IS NOT NULL) AS generados,
                             coalesce(sum(fin.fn_saldo_gasto(g.id)), 0) AS saldo,
                             coalesce(sum(fin.fn_saldo_gasto(g.id)) FILTER (WHERE g.vence < mae.fn_hoy()), 0) AS vencido
                        FROM fin.gasto g
                       WHERE (g.compra_rodado_id = c.id OR g.gasto_fijo_id = c.gasto_fijo_id) AND g.estado <> 'anulado' AND g.eliminado_en IS NULL) pg
                 WHERE c.estado = 'vigente') q), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION fin.fn_costo_fijo_equipos(p_mes date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
    WITH m AS (SELECT date_trunc('month', coalesce(p_mes, mae.fn_hoy()))::date AS mes),
    u AS (
        SELECT f.id AS fijo, f.nombre, e.camion_id, e.semi_id FROM fin.gasto_fijo f JOIN fin.gasto_fijo_equipo e ON e.gasto_fijo_id = f.id
         WHERE f.compra_rodado_id IS NULL
        UNION ALL
        SELECT f.id, f.nombre, f.camion_id, NULL::bigint FROM fin.gasto_fijo f
         WHERE f.camion_id IS NOT NULL AND f.compra_rodado_id IS NULL AND NOT EXISTS (SELECT 1 FROM fin.gasto_fijo_equipo e WHERE e.gasto_fijo_id = f.id)),
    p AS (
        SELECT u.fijo, u.nombre, u.camion_id, u.semi_id, round(f.monto * fin.fn_tc_clp_o_null(f.moneda, mae.fn_hoy()) / count(*) OVER (PARTITION BY u.fijo), 0) AS clp
          FROM u JOIN fin.gasto_fijo f ON f.id = u.fijo, m
         WHERE f.activo AND f.eliminado_en IS NULL AND fin.fn_gasto_fijo_corresponde(f.id, m.mes)
        UNION ALL
        SELECT NULL::bigint, 'Depreciación e intereses de la compra', c.camion_id, c.semi_id,
               fin.fn_rodado_dep_mes(c, m.mes)
               + CASE WHEN c.gasto_fijo_id IS NOT NULL THEN fin.fn_rodado_interes_doc(c, fin.fn_gasto_fijo_cuota_de(c.gasto_fijo_id, m.mes)) ELSE 0 END
          FROM fin.compra_rodado c, m
         WHERE c.estado = 'vigente' AND (c.camion_id IS NOT NULL OR c.semi_id IS NOT NULL)
           AND fin.fn_rodado_dep_mes(c, m.mes) + CASE WHEN c.gasto_fijo_id IS NOT NULL THEN fin.fn_rodado_interes_doc(c, fin.fn_gasto_fijo_cuota_de(c.gasto_fijo_id, m.mes)) ELSE 0 END > 0),
    t AS (SELECT tc.tasa FROM fin.tipo_cambio tc WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.fecha <= mae.fn_hoy() ORDER BY tc.fecha DESC LIMIT 1)
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.tipo DESC, q.patente), '[]') FROM (
        SELECT CASE WHEN p.camion_id IS NOT NULL THEN 'tractor' ELSE 'semi' END AS tipo, coalesce(p.camion_id, p.semi_id) AS id,
               coalesce(c.patente, s.patente) AS patente, sum(p.clp) AS clp_mes,
               round(sum(p.clp) / nullif((SELECT tasa FROM t), 0)) AS usd_mes, round(sum(p.clp) / nullif((SELECT tasa FROM t), 0) / 30.4, 1) AS usd_dia,
               string_agg(p.nombre, ' · ' ORDER BY p.nombre) AS de
          FROM p LEFT JOIN mae.camion c ON c.id = p.camion_id LEFT JOIN mae.semirremolque s ON s.id = p.semi_id
         GROUP BY 1, 2, 3) q
$function$;

COMMIT;
