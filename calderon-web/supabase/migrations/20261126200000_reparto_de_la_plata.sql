-- =====================================================================================
-- Migración 368 · El planificador propone qué hacer con la plata
-- =====================================================================================
-- Pedido de Gerencia (26/11/2026): «el planificador debe ser extremadamente inteligente… proponer qué hacer con la
-- plata: entran 150 millones; con eso paguemos una cuota de cada leasing, guardemos para los sueldos de la próxima
-- semana y dejemos una espalda de 60 millones para poder operar (combustible, fondos fijos y gastos de aduana). El
-- resto, para cancelar deudas y no seguir generando intereses».
--
--   · Reglas del reparto (las pone Gerencia y se cambian desde el planificador): el orden de los cuatro pasos, la
--     espalda para operar, cuántos días de sueldos se guardan y qué cuotas entran.
--   · fin.plan_caja_mora: cuánto cobra de interés por mes cada contrato o proveedor cuando se le paga tarde. Si no
--     está cargado, se usa lo que ya cobró de mora (los recargos pagados en el último año).
--   · fin.fn_plan_caja_reparto(opciones): con la plata que hay en caja y la que entra, propone paso por paso qué
--     pagar y qué guardar, dice qué queda sin cubrir, cuánto sobra y qué mirar antes de decidir.
--     SOLO PROPONE: no registra ningún pago ni cambia ningún documento.
--   · fin.fn_plan_caja_reglas_guardar y fin.fn_plan_caja_mora_guardar: los usan Finanzas, Gerencia o TI.
-- Necesita la migración 367 (planificador de caja). No cambia datos ni web.version_base. Se puede correr más de una
-- vez. Antes de terminar prueba la cuenta con los datos de la base: si falla, no deja nada aplicado.
-- Lo de Iris (que conteste de finanzas con esta propuesta) va aparte, en iris_19, que se corre después de esta.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_plan_caja_calcular(jsonb)') IS NULL OR to_regclass('fin.plan_caja_partida') IS NULL
       OR to_regclass('fin.plan_caja_ajuste') IS NULL OR to_regprocedure('fin.fn_exigir_plan_caja()') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 367 (20261126190000_planificador_de_caja.sql): correrla antes que esta';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'gasto' AND column_name = 'recargo_de_id') THEN
        RAISE EXCEPTION 'Falta la migración del pago con recargos (pago_con_recargos): aplicarla antes';
    END IF;
END $v$;

-- Permisos: los mismos que una función vecina (sin PUBLIC)
CREATE OR REPLACE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE OR REPLACE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- ---------------------------------------------------------------------------------
-- 1 · Las reglas del reparto (las define Gerencia)
-- ---------------------------------------------------------------------------------
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('fin.plan_caja_orden', '["cuotas", "sueldos", "espalda", "deudas"]'::jsonb,
     'Planificador de caja · reparto: en qué orden se usa la plata. cuotas = una cuota de cada leasing o crédito; sueldos = guardar para los sueldos que vienen; espalda = plata para operar; deudas = cancelar deudas vencidas. Se cambia desde el planificador.'),
    ('fin.plan_caja_espalda_clp', '60000000'::jsonb,
     'Planificador de caja · reparto: plata que se deja sin tocar para poder operar (combustible, fondos fijos y gastos de aduana), en pesos chilenos.'),
    ('fin.plan_caja_reserva_sueldos_dias', '10'::jsonb,
     'Planificador de caja · reparto: se guarda la plata de los sueldos que se pagan en los próximos días (este número).'),
    ('fin.plan_caja_cuotas_dias', '7'::jsonb,
     'Planificador de caja · reparto: en «una cuota de cada leasing o crédito» entran las cuotas vencidas y las que vencen en los próximos días (este número).')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- ---------------------------------------------------------------------------------
-- 2 · Cuánto cobra de interés cada contrato o proveedor si se le paga tarde
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.plan_caja_mora (
    origen          text NOT NULL CHECK (origen IN ('fijo', 'proveedor', 'partida')),
    origen_id       bigint NOT NULL,
    tasa_mensual    numeric(6,3) NOT NULL CHECK (tasa_mensual >= 0 AND tasa_mensual <= 50),
    nota            text CHECK (nota IS NULL OR length(nota) <= 300),
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint REFERENCES seg.usuario (id),
    PRIMARY KEY (origen, origen_id)
);
COMMENT ON TABLE fin.plan_caja_mora IS 'Planificador de caja: interés por mes (en %) que cobra un contrato en cuotas (fijo), un proveedor o una deuda cargada a mano (partida) cuando se le paga tarde. Lo carga Gerencia o Finanzas; sirve para decidir qué deuda cancelar primero. Solo por funciones.';

DO $r$
DECLARE r record; t regclass := 'fin.plan_caja_mora'::regclass;
BEGIN
    EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = t) LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', t, r.rolname);
    END LOOP;
END $r$;

-- ---------------------------------------------------------------------------------
-- 3 · Apoyo
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
        SELECT x.clase,
               CASE WHEN x.clase = 'cuota' AND f.id IS NOT NULL THEN 'fijo' WHEN g.proveedor_id IS NOT NULL THEN 'proveedor' END,
               CASE WHEN x.clase = 'cuota' AND f.id IS NOT NULL THEN f.id ELSE g.proveedor_id END,
               CASE WHEN x.clase = 'cuota' AND f.id IS NOT NULL THEN concat_ws(' · ', pr.razon_social, f.nombre)
                    ELSE coalesce(pr.razon_social, g.proveedor_nombre) END,
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
               'fijo'::text, f.id, concat_ws(' · ', pr.razon_social, f.nombre), false, NULL::integer, f.cuotas::integer
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
               coalesce(p.tercero, regexp_replace(p.descripcion, ' \(\d+ de \d+\)$', '')),
               p.categoria = 'combustible', NULL::integer, NULL::integer
          FROM fin.plan_caja_partida p WHERE p.id = p_id;
    ELSE
        -- Combustible de Chile por transferir, fondos aprobados a choferes, combustible en cuenta corriente sin factura
        RETURN QUERY SELECT 'operativo'::text, NULL::text, NULL::bigint, NULL::text, true, NULL::integer, NULL::integer;
    END IF;
END $f$;
COMMENT ON FUNCTION fin.fn_plan_caja_clase(text, bigint) IS
    'Migración 368: de qué clase es una salida del plan de caja (cuota, sueldo, impuesto, proveedor, operativo u otra) y a quién se le debe. Interna.';

-- El interés por mes de un contrato o proveedor: el cargado a mano o, si no hay, el que sale de la mora ya pagada
-- (recargos del último año ÷ monto × días de atraso).
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
                   FROM fin.plan_caja_mora m WHERE m.origen = p_tipo AND m.origen_id = p_id;
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
    'Migración 368: interés por mes (en %) de un contrato en cuotas, un proveedor o una deuda a mano: el cargado en fin.plan_caja_mora o, si no hay, el que resulta de los recargos por mora pagados en el último año. Interna.';

-- Cuánto se gastó en operar (combustible, fondos a choferes y aduana) en los últimos días, según los pagos anotados
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_gasto_operativo(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_hoy date := mae.fn_hoy(); v_dias integer := least(greatest(coalesce(p_dias, 30), 7), 120);
    v_comb numeric; v_fondos numeric; v_aduana numeric; v_n integer;
BEGIN
    SELECT coalesce(sum(x.clp) FILTER (WHERE x.que = 'combustible'), 0), coalesce(sum(x.clp) FILTER (WHERE x.que = 'fondos'), 0),
           coalesce(sum(x.clp) FILTER (WHERE x.que = 'aduana'), 0), count(*) FILTER (WHERE x.que IS NOT NULL)
      INTO v_comb, v_fondos, v_aduana, v_n
      FROM (SELECT round(m.monto * fin.fn_tc_clp_o_null(cd.moneda::text, v_hoy)) AS clp,
                   CASE WHEN m.origen = 'fondo' OR coalesce(cg.uso, ce.uso, '') = 'FONDOS_CHOFERES' THEN 'fondos'
                        WHEN concat_ws(' ', cg.nombre, ce.nombre, g.descripcion, m.descripcion) ~* '(aduan|despachante)' THEN 'aduana'
                        WHEN m.origen = 'carga' OR coalesce(pr.tipo, '') = 'combustible' OR coalesce(cg.uso, ce.uso, '') = 'COMBUSTIBLE'
                             OR concat_ws(' ', cg.nombre, ce.nombre) ~* '(combustible|gasoil|gas oil|di[eé]sel|petr[oó]leo)' THEN 'combustible' END AS que
              FROM fin.movimiento m
              JOIN fin.cuenta_dinero cd ON cd.id = m.cuenta_dinero_id
              LEFT JOIN fin.gasto g ON g.id = m.gasto_id
              LEFT JOIN fin.cuenta_contable cg ON cg.id = g.cuenta_id
              LEFT JOIN mae.proveedor pr ON pr.id = g.proveedor_id
              LEFT JOIN fin.cuenta_contable ce ON ce.id = m.cuenta_id
             WHERE m.estado = 'vigente' AND m.eliminado_en IS NULL AND m.tipo IN ('pago', 'egreso')
               AND m.fecha > v_hoy - v_dias AND m.fecha <= v_hoy) x;
    RETURN jsonb_build_object('dias', v_dias, 'combustible', v_comb, 'fondos', v_fondos, 'aduana', v_aduana,
                              'total', v_comb + v_fondos + v_aduana, 'por_dia', round((v_comb + v_fondos + v_aduana) / v_dias), 'pagos', v_n);
END $f$;
COMMENT ON FUNCTION fin.fn_plan_caja_gasto_operativo(integer) IS
    'Migración 368: lo pagado en combustible, fondos a choferes y aduana en los últimos días (según Bancos › Movimientos), en pesos chilenos de hoy. Sirve para saber cuántos días de operación cubre la espalda. Interna.';

-- Las salidas del plan (en pesos chilenos), cada una con su clase, a quién se le debe, los días de atraso y el interés.
-- El interés se busca una vez por acreedor (no una vez por documento). Sin «jit»: son muchas cuentas chicas y
-- compilarlas tarda más que hacerlas.
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
    ), m AS MATERIALIZED (
        SELECT a.acreedor_tipo, a.acreedor_id, t.tasa, t.fuente, t.nota
          FROM (SELECT DISTINCT s.acreedor_tipo, s.acreedor_id FROM s WHERE s.acreedor_tipo IS NOT NULL AND s.acreedor_id IS NOT NULL) a
         CROSS JOIN LATERAL fin.fn_plan_caja_mora_de(a.acreedor_tipo, a.acreedor_id) t
    )
    SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.clave), '[]'::jsonb)
      FROM (SELECT s.clave, s.origen, s.id, s.titulo, s.detalle, s.fecha, s.vence, s.moneda, s.monto, s.clp, s.nota,
                   s.clase, s.acreedor_tipo, s.acreedor_id, s.acreedor, s.critico, s.cuota_n, s.cuotas,
                   CASE WHEN s.acreedor_tipo IS NOT NULL AND s.acreedor_id IS NOT NULL THEN s.acreedor_tipo || ':' || s.acreedor_id ELSE 'x:' || s.clave END AS acreedor_clave,
                   greatest((p_plan ->> 'hoy')::date - coalesce(s.vence, s.fecha, (p_plan ->> 'hoy')::date), 0) AS dias_atraso,
                   m.tasa, m.fuente AS tasa_fuente, m.nota AS tasa_nota
              FROM s
              LEFT JOIN m ON m.acreedor_tipo = s.acreedor_tipo AND m.acreedor_id = s.acreedor_id) z
$f$;
COMMENT ON FUNCTION fin.fn_plan_caja_salidas(jsonb) IS
    'Migración 368: las salidas de un plan de caja armado en pesos chilenos, con su clase, el acreedor, los días de atraso y el interés por mes. Interna.';

-- Los contratos en cuotas (leasing, créditos, vehículos): qué tienen vencido, qué viene y cuánto falta pagar en total
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_contratos()
 RETURNS TABLE (id bigint, contrato text, proveedor text, moneda text, cuota numeric, cuota_clp numeric, cuotas integer, cuota_actual integer,
                vencidas integer, vencido_clp numeric, mas_vieja date, por_vencer_clp numeric, proxima date, faltan integer, saldo_clp numeric,
                tasa numeric, tasa_fuente text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 ROWS 30
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
    SELECT f.id, f.nombre, pr.razon_social, f.moneda::text, f.monto, round(f.monto * tc.v),
           f.cuotas::integer, least(greatest(fin.fn_gasto_fijo_cuota_de(f.id, d.mes), 0), f.cuotas)::integer,
           coalesce(g.vencidas, 0)::integer, coalesce(g.vencido, 0), g.mas_vieja, coalesce(g.por_vencer, 0), g.proxima,
           fut.n::integer, coalesce(g.vencido, 0) + coalesce(g.por_vencer, 0) + coalesce(round(fut.n * f.monto * tc.v), 0),
           m.tasa, m.fuente
      FROM fin.gasto_fijo f
      LEFT JOIN mae.proveedor pr ON pr.id = f.proveedor_id
     CROSS JOIN (SELECT date_trunc('month', mae.fn_hoy()::timestamp)::date AS mes, mae.fn_hoy() AS hoy) d
     CROSS JOIN LATERAL (SELECT fin.fn_tc_clp_o_null(f.moneda::text, d.hoy) AS v) tc
      LEFT JOIN LATERAL (
            SELECT count(*) FILTER (WHERE x.vence < d.hoy) AS vencidas,
                   sum(round(s.saldo * tc.v)) FILTER (WHERE x.vence < d.hoy) AS vencido, min(x.vence) FILTER (WHERE x.vence < d.hoy) AS mas_vieja,
                   sum(round(s.saldo * tc.v)) FILTER (WHERE x.vence >= d.hoy) AS por_vencer, min(x.vence) FILTER (WHERE x.vence >= d.hoy) AS proxima
              FROM fin.gasto x
             CROSS JOIN LATERAL (SELECT fin.fn_saldo_gasto(x.id) AS saldo) s
             WHERE x.gasto_fijo_id = f.id AND x.estado = 'vigente' AND x.eliminado_en IS NULL AND s.saldo > 0) g ON true
     -- Las cuotas que todavía no se generaron, de este mes en adelante
     CROSS JOIN LATERAL (
            SELECT count(*) AS n
              FROM generate_series(greatest(d.mes, date_trunc('month', f.desde::timestamp)::date)::timestamp,
                                   date_trunc('month', f.desde::timestamp) + make_interval(months => f.cuotas - 1), interval '1 month') q(mm)
             WHERE fin.fn_gasto_fijo_corresponde(f.id, q.mm::date)
               AND NOT EXISTS (SELECT 1 FROM fin.gasto x WHERE x.gasto_fijo_id = f.id AND x.periodo = q.mm::date AND x.estado <> 'anulado' AND x.eliminado_en IS NULL)) fut
      LEFT JOIN LATERAL fin.fn_plan_caja_mora_de('fijo', f.id) m ON true
     WHERE f.cuotas IS NOT NULL AND f.activo AND f.eliminado_en IS NULL
$f$;
COMMENT ON FUNCTION fin.fn_plan_caja_contratos() IS
    'Migración 368: los contratos en cuotas activos (leasing, créditos, vehículos) con lo vencido, lo que viene, las cuotas que faltan y el saldo que queda por pagar, en pesos chilenos de hoy. Interna.';

-- ---------------------------------------------------------------------------------
-- 4 · El reparto: qué hacer con la plata
-- ---------------------------------------------------------------------------------
-- El orden de los pasos, si viene bien escrito (los cuatro, una vez cada uno)
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_orden_valido(p_orden jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN jsonb_typeof(p_orden) = 'array'
                 AND (SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(p_orden) x) = ARRAY['cuotas', 'deudas', 'espalda', 'sueldos']
                THEN (SELECT array_agg(x ORDER BY i) FROM jsonb_array_elements_text(p_orden) WITH ORDINALITY t(x, i)) END
$f$;

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
            v_que := 'La cuota más vieja sin pagar de cada contrato (vencida o que vence en los próximos ' || v_dias_c || ' días), empezando por el más atrasado.';
            FOR r IN
                SELECT c.e, c.clp
                  FROM (SELECT DISTINCT ON (e ->> 'acreedor_clave') e, (e ->> 'clp')::numeric AS clp, (e ->> 'dias_atraso')::integer AS atraso
                          FROM jsonb_array_elements(v_sal) e
                         WHERE e ->> 'clase' = 'cuota' AND e ->> 'origen' IN ('gasto', 'fijo', 'partida')
                           AND coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date, v_hoy) <= v_hoy + v_dias_c
                         ORDER BY e ->> 'acreedor_clave', coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date, v_hoy), (e ->> 'clp')::numeric, e ->> 'clave') c
                 ORDER BY c.atraso DESC, c.clp, c.e ->> 'clave'
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
            v_que := 'Con lo que queda: primero las que cobran interés (la más cara primero), después los proveedores de combustible y después las más viejas. Se pagan enteras; la que no alcanza se saltea.';
            FOR r IN
                SELECT e, (e ->> 'clp')::numeric AS clp FROM jsonb_array_elements(v_sal) e
                 WHERE e ->> 'clase' IN ('cuota', 'proveedor', 'impuesto', 'otra') AND (e ->> 'vence')::date < v_hoy
                   AND NOT (e ->> 'clave' = ANY (v_usadas))
                 ORDER BY CASE WHEN (e ->> 'tasa')::numeric > 0 THEN 0 WHEN e ->> 'tasa' IS NULL THEN 1 ELSE 2 END,
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

    -- ── Avisos: lo que un gerente financiero miraría antes de decidir ───────────────────
    IF v_total <= 0 THEN
        v_avisos := v_avisos || to_jsonb('No hay plata para repartir: ' || CASE WHEN v_usar THEN 'la caja de hoy está en ' || to_char(v_caja, 'FM999G999G999G990') || ' y no se cargó nada que entre.'
                                                                              ELSE 'no se cargó cuánto entra y la caja de hoy no se está contando.' END);
    END IF;
    FOR r IN SELECT p FROM jsonb_array_elements(v_pasos) p WHERE (p ->> 'falta')::numeric > 0 AND p ->> 'codigo' <> 'deudas' LOOP
        v_avisos := v_avisos || to_jsonb('No alcanza para «' || (r.p ->> 'titulo') || '»: faltan ' || translate(to_char((r.p ->> 'falta')::numeric, 'FM999G999G999G990'), ',', '.') || ' CLP.');
    END LOOP;
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
    -- Lo que el plan ya avisa y cambia esta cuenta: sueldos sin liquidación, caja que puede no ser la real, monedas sin cambio
    SELECT coalesce(jsonb_agg(a), '[]'::jsonb) INTO v_items FROM jsonb_array_elements_text(v_plan -> 'avisos') a
     WHERE a LIKE 'Sueldos de choferes que todavía no están en el plan%'
        OR (v_usar AND (a LIKE 'El saldo es el del sistema%' OR a LIKE 'Sin ninguna cartola importada%' OR a LIKE 'Hay % del banco sin conciliar%' OR a LIKE 'No se suma a la caja%'))
        OR a LIKE 'Hay partidas en una moneda sin tipo de cambio%' OR a LIKE 'Hay % pagados a cuenta a proveedores%';
    v_avisos := v_avisos || v_items;

    RETURN jsonb_build_object(
        'hoy', v_hoy, 'moneda', 'CLP',
        'dinero', jsonb_build_object('en_caja', v_caja, 'usa_caja', v_usar, 'entra', v_entra, 'entra_moneda', v_mon, 'entra_clp', v_entra_clp, 'total', v_total),
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
    'Migración 368: arma la propuesta de qué hacer con la plata (caja de hoy más lo que entra), paso por paso según las reglas de Gerencia. Solo propone. Interna: la usan fin.fn_plan_caja_reparto e Iris.';

CREATE OR REPLACE FUNCTION fin.fn_plan_caja_reparto(p_opciones jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint;
BEGIN
    v_usr := fin.fn_exigir_lectura_finanzas();
    RETURN fin.fn_plan_caja_reparto_calcular(coalesce(p_opciones, '{}'::jsonb))
        || jsonb_build_object('puede_editar', EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'gerencia', 'ti')));
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_reparto(jsonb) IS
    'Migración 368 · Planificador de caja: propuesta de qué hacer con la plata. Opciones: entra (monto), entra_moneda, usar_caja, y para probar: espalda, reserva_sueldos_dias, cuotas_dias, orden. Lo ven los que ven Finanzas. Solo propone: no registra pagos.';

-- Guardar las reglas del reparto (Finanzas, Gerencia o TI)
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_reglas_guardar(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fin.fn_exigir_plan_caja(); d jsonb := coalesce(p_datos, '{}'::jsonb); v_orden text[]; v_num numeric; v_cod text; v_clave text;
BEGIN
    IF d ? 'orden' THEN
        v_orden := fin.fn_plan_caja_orden_valido(d -> 'orden');
        IF v_orden IS NULL THEN
            RAISE EXCEPTION 'El orden lleva los cuatro pasos, una vez cada uno: cuotas, sueldos, espalda y deudas' USING ERRCODE = '22023';
        END IF;
        UPDATE ref.parametro SET valor = to_jsonb(v_orden) WHERE codigo = 'fin.plan_caja_orden' AND eliminado_en IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'Falta el parámetro fin.plan_caja_orden: avisar a TI' USING ERRCODE = 'P0002'; END IF;
    END IF;
    FOR v_clave, v_cod IN SELECT * FROM (VALUES ('espalda', 'fin.plan_caja_espalda_clp'), ('reserva_sueldos_dias', 'fin.plan_caja_reserva_sueldos_dias'),
                                                ('cuotas_dias', 'fin.plan_caja_cuotas_dias')) x LOOP
        CONTINUE WHEN NOT d ? v_clave;
        BEGIN
            v_num := nullif(btrim(d ->> v_clave), '')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN v_num := NULL;
        END;
        IF v_num IS NULL OR v_num < 0 THEN RAISE EXCEPTION 'Escribí un número de 0 en adelante' USING ERRCODE = '22023'; END IF;
        IF v_clave = 'espalda' AND v_num > 999999999999 THEN RAISE EXCEPTION 'La espalda es demasiado grande' USING ERRCODE = '22023'; END IF;
        IF v_clave <> 'espalda' AND (v_num > 60 OR v_num <> trunc(v_num)) THEN RAISE EXCEPTION 'Los días van de 0 a 60, sin decimales' USING ERRCODE = '22023'; END IF;
        UPDATE ref.parametro SET valor = to_jsonb(CASE WHEN v_clave = 'espalda' THEN round(v_num) ELSE v_num END) WHERE codigo = v_cod AND eliminado_en IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'Falta el parámetro %: avisar a TI', v_cod USING ERRCODE = 'P0002'; END IF;
    END LOOP;
    RETURN jsonb_build_object('orden', (SELECT valor FROM ref.parametro WHERE codigo = 'fin.plan_caja_orden'),
                              'espalda', ref.fn_parametro_num('fin.plan_caja_espalda_clp', 60000000),
                              'reserva_sueldos_dias', ref.fn_parametro_num('fin.plan_caja_reserva_sueldos_dias', 10),
                              'cuotas_dias', ref.fn_parametro_num('fin.plan_caja_cuotas_dias', 7));
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_reglas_guardar(jsonb) IS
    'Migración 368: guarda las reglas del reparto de la plata (orden de los pasos, espalda, días de sueldos, días de cuotas). Finanzas, Gerencia o TI.';

-- Cargar (o sacar) el interés por mes que cobra un contrato, un proveedor o una deuda cargada a mano
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_mora_guardar(p_tipo text, p_id bigint, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_plan_caja(); v_tasa numeric; v_existe boolean;
    v_nota text := nullif(regexp_replace(btrim(coalesce(p_datos ->> 'nota', '')), '\s+', ' ', 'g'), '');
BEGIN
    IF p_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('fijo', 'proveedor', 'partida') THEN
        RAISE EXCEPTION 'A esa deuda no se le puede cargar el interés' USING ERRCODE = '22023';
    END IF;
    v_existe := CASE p_tipo WHEN 'fijo' THEN EXISTS (SELECT 1 FROM fin.gasto_fijo WHERE id = p_id AND eliminado_en IS NULL)
                            WHEN 'proveedor' THEN EXISTS (SELECT 1 FROM mae.proveedor WHERE id = p_id)
                            ELSE EXISTS (SELECT 1 FROM fin.plan_caja_partida WHERE id = p_id OR serie_id = p_id) END;
    IF NOT v_existe THEN RAISE EXCEPTION 'Esa deuda ya no existe: volvé a abrir el planificador' USING ERRCODE = 'P0002'; END IF;
    BEGIN
        v_tasa := nullif(btrim(p_datos ->> 'tasa_mensual'), '')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'El interés va en número, por ejemplo 2,5' USING ERRCODE = '22023';
    END;
    IF length(v_nota) > 300 THEN RAISE EXCEPTION 'La nota puede tener hasta 300 letras' USING ERRCODE = '22023'; END IF;
    IF v_tasa IS NULL THEN
        -- Sin número: se saca lo cargado y vuelve a valer lo que resulte de la mora ya pagada
        DELETE FROM fin.plan_caja_mora WHERE origen = p_tipo AND origen_id = p_id;
        RETURN NULL;
    END IF;
    IF v_tasa < 0 OR v_tasa > 50 THEN RAISE EXCEPTION 'El interés por mes va de 0 a 50 por ciento' USING ERRCODE = '22023'; END IF;
    INSERT INTO fin.plan_caja_mora (origen, origen_id, tasa_mensual, nota, actualizado_en, actualizado_por)
    VALUES (p_tipo, p_id, round(v_tasa, 3), v_nota, now(), v_usr)
    ON CONFLICT (origen, origen_id) DO UPDATE
       SET tasa_mensual = EXCLUDED.tasa_mensual, nota = EXCLUDED.nota, actualizado_en = now(), actualizado_por = v_usr;
    RETURN jsonb_build_object('tipo', p_tipo, 'id', p_id, 'tasa_mensual', round(v_tasa, 3), 'nota', v_nota);
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_mora_guardar(text, bigint, jsonb) IS
    'Migración 368: carga cuánto cobra de interés por mes (en %) un contrato en cuotas, un proveedor o una deuda a mano cuando se le paga tarde; vacío lo saca. Finanzas, Gerencia o TI.';

-- ---------------------------------------------------------------------------------
-- 5 · Permisos: los del planificador (quien ve Finanzas); quién cambia las reglas lo decide cada función
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_copiar_permisos('fin.fn_plan_caja(jsonb)', 'fin.fn_plan_caja_reparto(jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_plan_caja(jsonb)', 'fin.fn_plan_caja_reglas_guardar(jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_plan_caja(jsonb)', 'fin.fn_plan_caja_mora_guardar(text, bigint, jsonb)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_reparto_calcular(jsonb)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_salidas(jsonb)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_contratos()');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_clase(text, bigint)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_mora_de(text, bigint)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_gasto_operativo(integer)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_orden_valido(jsonb)');

-- ---------------------------------------------------------------------------------
-- 6 · Prueba con los datos de esta base: si la cuenta falla o no cierra, no queda nada aplicado
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE j jsonb;
BEGIN
    j := fin.fn_plan_caja_reparto_calcular('{}'::jsonb);
    IF jsonb_array_length(j -> 'pasos') <> 4 THEN RAISE EXCEPTION 'el reparto no trae los cuatro pasos'; END IF;
    IF (j ->> 'repartido')::numeric + (j ->> 'sobra')::numeric <> greatest((j #>> '{dinero,total}')::numeric, 0) THEN
        RAISE EXCEPTION 'el reparto de la caja de hoy no cierra: % repartido + % que sobra, de %', j ->> 'repartido', j ->> 'sobra', j #>> '{dinero,total}';
    END IF;
    j := fin.fn_plan_caja_reparto_calcular('{"entra": 150000000, "usar_caja": false, "orden": ["espalda", "sueldos", "cuotas", "deudas"]}'::jsonb);
    IF (j ->> 'repartido')::numeric + (j ->> 'sobra')::numeric <> 150000000 THEN
        RAISE EXCEPTION 'el reparto de 150 millones no cierra: % repartido + % que sobra', j ->> 'repartido', j ->> 'sobra';
    END IF;
    PERFORM count(*) FROM fin.fn_plan_caja_contratos();
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'El reparto no pudo calcular con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: qué pide cada paso hoy y hasta dónde llega la caja de hoy
WITH r AS (SELECT fin.fn_plan_caja_reparto_calcular('{}'::jsonb) AS j)
SELECT 'migración 368 aplicada' AS que,
       (j #>> '{dinero,en_caja}')::numeric AS caja_hoy_clp,
       (SELECT (p ->> 'necesita')::numeric FROM jsonb_array_elements(j -> 'pasos') p WHERE p ->> 'codigo' = 'cuotas') AS una_cuota_de_cada_contrato,
       (SELECT (p ->> 'necesita')::numeric FROM jsonb_array_elements(j -> 'pasos') p WHERE p ->> 'codigo' = 'sueldos') AS sueldos_que_vienen,
       (j #>> '{reglas,espalda}')::numeric AS espalda,
       (SELECT (p ->> 'necesita')::numeric FROM jsonb_array_elements(j -> 'pasos') p WHERE p ->> 'codigo' = 'deudas') AS deudas_vencidas,
       (j ->> 'sin_cubrir')::numeric AS sin_cubrir_con_la_caja_de_hoy,
       (SELECT count(*) FROM fin.fn_plan_caja_contratos()) AS contratos_en_cuotas,
       (SELECT coalesce(sum(c.vencidas), 0) FROM fin.fn_plan_caja_contratos() c) AS cuotas_vencidas,
       (SELECT (p #>> '{gasto_operativo,por_dia}')::numeric FROM jsonb_array_elements(j -> 'pasos') p WHERE p ->> 'codigo' = 'espalda') AS gasto_de_operar_por_dia,
       jsonb_array_length(j -> 'avisos') AS avisos
  FROM r;
