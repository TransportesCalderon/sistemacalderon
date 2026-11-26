-- =====================================================================================
-- Migración 367 · Planificador de caja
-- =====================================================================================
-- Pedido de Gerencia (26/11/2026): las cuentas están casi en cero, las cobranzas vienen atrasadas y hace falta saber
-- qué hacer con la caja: cuánta plata hay, qué entra y qué sale cada semana, y poder proyectar las cobranzas que
-- vienen (lo de Dorinka y las ventas del semirremolque, el tractor y los 2 generadores).
-- Decisiones del usuario: el plan usa solo lo que está cargado en el sistema y lo que se agregue a mano (no estima
-- gastos con lo que salió del banco), y las ventas de activos se cargan como entradas previstas.
--
--   · fin.plan_caja_partida: entradas y salidas previstas que se cargan a mano (venta de un activo, cobranza
--     acordada, impuestos, sueldos…), con fecha, monto, moneda y qué tan seguras son.
--   · fin.plan_caja_ajuste: la fecha en que se espera cobrar una factura o pagar un gasto (o cualquier otra partida
--     del plan), si se cuenta o no, y qué tan segura es. No toca la factura ni el gasto.
--   · fin.fn_plan_caja(opciones): el plan. Caja de hoy por cuenta y, semana por semana, lo que entra, lo que sale y
--     el saldo, en pesos chilenos o en dólares. Arma el plan con:
--       entradas: facturas emitidas con saldo, prefacturas sin emitir, viajes sin facturar y lo cargado a mano;
--       salidas: gastos por pagar, gastos fijos y cuotas que vienen, sueldos de choferes (liquidaciones), combustible
--       de Chile por transferir, fondos aprobados a choferes y lo cargado a mano.
--     Lo vencido sin fecha (por cobrar o por pagar) no entra en ninguna semana hasta que alguien le pone fecha.
--     Da dos saldos: el esperado, y el prudente (solo entra lo seguro y sale todo).
--   · fin.fn_plan_caja_ajustar, fin.fn_guardar_partida_caja y fin.fn_cerrar_partida_caja: lo cambian Finanzas,
--     Gerencia o TI.
--   · Cuenta contable «Venta de activos» (ingreso), si no existe: para anotar la plata desde la cartola cuando entra.
-- No cambia datos ni web.version_base. Se puede correr más de una vez. Antes de terminar prueba el cálculo con los
-- datos de la base: si falla, no deja nada aplicado.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_saldo_gasto(bigint)') IS NULL OR to_regprocedure('fin.fn_saldo_factura(bigint)') IS NULL
       OR to_regprocedure('fin.fn_saldo_cuenta_dinero(bigint, date)') IS NULL OR to_regprocedure('fin.fn_tc_clp_o_null(text, date)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las funciones de Finanzas (bancos, por cobrar y por pagar): avisar antes de seguir';
    END IF;
    IF to_regprocedure('fin.fn_gasto_fijo_corresponde(bigint, date)') IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'gasto' AND column_name = 'pago_previsto') THEN
        RAISE EXCEPTION 'Faltan las migraciones de los gastos fijos con cuotas (gasto_fijo_cuotas_02 y 03): aplicarlas antes';
    END IF;
    IF to_regprocedure('ven.fn_precio_servicio(bigint)') IS NULL OR to_regprocedure('ven.fn_factura_de_servicio(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las funciones de Ventas (precio de la operación y factura de la operación): avisar antes de seguir';
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
-- 1 · Configuración
-- ---------------------------------------------------------------------------------
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('fin.plan_caja_semanas', '13'::jsonb, 'Planificador de caja: cuántas semanas muestra si no se elige (de 4 a 26).'),
    ('fin.plan_caja_dias_para_facturar', '5'::jsonb, 'Planificador de caja: días que pasan entre que se entrega un viaje y sale su factura. Se usa para estimar cuándo se cobra lo que todavía no se facturó.'),
    ('fin.plan_caja_dias_sueldos', '4'::jsonb, 'Planificador de caja: días después del cierre del período en que se transfieren los sueldos de los choferes.'),
    ('fin.plan_caja_viajes_dias', '60'::jsonb, 'Planificador de caja: los viajes sin facturar de más de estos días no se cuentan (suelen estar facturados por fuera).')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- ---------------------------------------------------------------------------------
-- 2 · Tablas (solo por funciones)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin.plan_caja_partida (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo            text NOT NULL CHECK (tipo IN ('entrada', 'salida')),
    categoria       text NOT NULL,
    descripcion     text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 3 AND 200),
    tercero         text CHECK (tercero IS NULL OR length(tercero) <= 120),
    fecha           date NOT NULL,
    moneda          char(3) NOT NULL REFERENCES ref.moneda (codigo),
    monto           numeric(16,2) NOT NULL CHECK (monto > 0),
    certeza         text NOT NULL DEFAULT 'probable' CHECK (certeza IN ('segura', 'probable', 'dudosa')),
    estado          text NOT NULL DEFAULT 'prevista' CHECK (estado IN ('prevista', 'cumplida', 'anulada')),
    cerrada_en      date,
    serie_id        bigint,
    nota            text CHECK (nota IS NULL OR length(nota) <= 300),
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      bigint REFERENCES seg.usuario (id),
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint REFERENCES seg.usuario (id),
    version_fila    integer NOT NULL DEFAULT 1,
    CHECK ((estado = 'prevista') = (cerrada_en IS NULL))
);
COMMENT ON TABLE fin.plan_caja_partida IS 'Planificador de caja: entradas y salidas previstas cargadas a mano (venta de un activo, cobranza acordada, impuestos…). No son movimientos de plata: cuando la plata entra o sale se anota en Bancos y acá se marca cumplida. Solo por funciones.';
CREATE INDEX IF NOT EXISTS ix_plan_caja_partida_estado ON fin.plan_caja_partida (estado, fecha);

CREATE TABLE IF NOT EXISTS fin.plan_caja_ajuste (
    origen          text NOT NULL CHECK (origen IN ('factura', 'prefactura', 'servicio', 'gasto', 'fijo', 'liquidacion', 'pago_carga', 'pedido_fondo', 'cargas_proveedor')),
    origen_id       bigint NOT NULL,
    fecha           date,
    contar          boolean NOT NULL DEFAULT true,
    certeza         text CHECK (certeza IS NULL OR certeza IN ('segura', 'probable', 'dudosa')),
    nota            text CHECK (nota IS NULL OR length(nota) <= 300),
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint REFERENCES seg.usuario (id),
    PRIMARY KEY (origen, origen_id)
);
COMMENT ON TABLE fin.plan_caja_ajuste IS 'Planificador de caja: para una factura, un gasto u otra partida del plan, la fecha en que se espera cobrar o pagar, si se cuenta y qué tan segura es. No cambia la factura ni el gasto. Solo por funciones.';

DO $r$
DECLARE r record; t regclass;
BEGIN
    FOREACH t IN ARRAY ARRAY['fin.plan_caja_partida'::regclass, 'fin.plan_caja_ajuste'::regclass] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
        FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                    AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = t) LOOP
            EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', t, r.rolname);
        END LOOP;
    END LOOP;
END $r$;

-- ---------------------------------------------------------------------------------
-- 3 · Cuenta contable para la plata de las ventas de activos (si no hay una)
-- ---------------------------------------------------------------------------------
DO $do$
DECLARE
    v_cod text := ref.fn_parametro_texto('fin.plan_caja_cuenta_venta_activos', '');
    c fin.cuenta_contable%ROWTYPE; v_padre fin.cuenta_contable%ROWTYPE; v_n integer;
BEGIN
    IF v_cod <> '' AND EXISTS (SELECT 1 FROM fin.cuenta_contable WHERE codigo = v_cod AND eliminado_en IS NULL) THEN RETURN; END IF;
    SELECT * INTO c FROM fin.cuenta_contable
     WHERE eliminado_en IS NULL AND imputable AND activa AND tipo = 'ingreso' AND uso IS NULL AND nombre ~* 'venta.*activo'
     ORDER BY codigo LIMIT 1;
    IF NOT FOUND THEN
        -- Debajo de «otros ingresos» si el plan lo tiene; si no, en el grupo de los ingresos por fletes
        SELECT * INTO v_padre FROM fin.cuenta_contable
         WHERE eliminado_en IS NULL AND NOT imputable AND tipo = 'ingreso' AND uso IS NULL AND nombre ~* 'otros' AND codigo ~ '\.'
         ORDER BY length(codigo) DESC, codigo LIMIT 1;
        IF NOT FOUND THEN
            SELECT p.* INTO v_padre FROM fin.cuenta_contable v JOIN fin.cuenta_contable p ON p.id = v.padre_id
             WHERE v.uso = 'VENTAS' AND v.eliminado_en IS NULL AND p.eliminado_en IS NULL AND p.uso IS NULL;
        END IF;
        IF v_padre.id IS NULL THEN
            RAISE NOTICE 'No encontré dónde crear la cuenta «Venta de activos»: creala en Configuración › Plan de cuentas (es un ingreso)';
            RETURN;
        END IF;
        SELECT min(n) INTO v_n FROM generate_series(1, 99) n
         WHERE NOT EXISTS (SELECT 1 FROM fin.cuenta_contable x WHERE x.codigo = v_padre.codigo || '.' || lpad(n::text, 2, '0'));
        IF v_n IS NULL OR (v_padre.codigo || '.' || lpad(v_n::text, 2, '0')) !~ '^[1-6](\.[0-9]{1,3}){1,3}$' THEN
            RAISE NOTICE 'No hay un código libre debajo de % para la cuenta «Venta de activos»: creala en Configuración › Plan de cuentas', v_padre.codigo;
            RETURN;
        END IF;
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.cuenta_contable (codigo, nombre, tipo, padre_id, imputable, activa)
        VALUES (v_padre.codigo || '.' || lpad(v_n::text, 2, '0'), 'Venta de activos (tractores, semirremolques y equipos)', 'ingreso', v_padre.id, true, true)
        RETURNING * INTO c;
    END IF;
    IF EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'fin.plan_caja_cuenta_venta_activos') THEN
        UPDATE ref.parametro SET valor = to_jsonb(c.codigo) WHERE codigo = 'fin.plan_caja_cuenta_venta_activos';
    ELSE
        INSERT INTO ref.parametro (codigo, valor, descripcion)
        VALUES ('fin.plan_caja_cuenta_venta_activos', to_jsonb(c.codigo),
                'Planificador de caja: código de la cuenta contable donde se anota la plata de las ventas de activos (desde la cartola, como otro ingreso).');
    END IF;
END $do$;

-- ---------------------------------------------------------------------------------
-- 4 · Apoyo
-- ---------------------------------------------------------------------------------
-- Qué se puede cargar a mano
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_categorias()
 RETURNS TABLE (codigo text, tipo text, nombre text, orden integer)
 LANGUAGE sql IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    VALUES ('venta_activo', 'entrada', 'Venta de un activo (tractor, semirremolque, equipo)', 1),
           ('cobranza', 'entrada', 'Cobranza acordada con un cliente', 2),
           ('aporte', 'entrada', 'Aporte o préstamo que entra', 3),
           ('otra_entrada', 'entrada', 'Otra entrada', 4),
           ('impuestos', 'salida', 'Impuestos e imposiciones', 1),
           ('sueldos', 'salida', 'Sueldos', 2),
           ('proveedor', 'salida', 'Pago a un proveedor', 3),
           ('deuda', 'salida', 'Cuota de un préstamo o de una deuda', 4),
           ('combustible', 'salida', 'Combustible', 5),
           ('otra_salida', 'salida', 'Otra salida', 6)
$f$;

-- Quién cambia el plan
CREATE OR REPLACE FUNCTION fin.fn_exigir_plan_caja()
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'gerencia', 'ti')) THEN
        RAISE EXCEPTION 'El plan de caja lo cambian Finanzas, Gerencia o TI' USING ERRCODE = '42501';
    END IF;
    RETURN v_usr;
END $f$;

-- Cuántos días después del vencimiento suele pagar un cliente (facturas cobradas del último año; de 0 a 60)
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_atraso(p_cliente bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN count(*) >= 2 THEN least(greatest(round(avg(f.cobrada_en - f.vence))::integer, 0), 60) ELSE 0 END
      FROM ven.factura f
     WHERE f.cliente_id = p_cliente AND f.estado = 'cobrada' AND f.eliminado_en IS NULL
       AND f.cobrada_en IS NOT NULL AND f.vence IS NOT NULL AND f.cobrada_en >= mae.fn_hoy() - 365
$f$;

-- ---------------------------------------------------------------------------------
-- 5 · El plan
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_calcular(p_opciones jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_hoy date := mae.fn_hoy();
    v_lunes date := date_trunc('week', mae.fn_hoy()::timestamp)::date;
    v_mon text := upper(coalesce(nullif(btrim(p_opciones ->> 'moneda'), ''), 'CLP'));
    v_dud boolean := coalesce((p_opciones ->> 'con_dudosas')::boolean, false);
    v_via boolean := coalesce((p_opciones ->> 'con_viajes')::boolean, true);
    v_sem integer; v_fin date; v_dec integer; v_tc numeric;
    v_dias_fact integer := greatest(ref.fn_parametro_num('fin.plan_caja_dias_para_facturar', 5)::integer, 0);
    v_dias_sueldo integer := greatest(ref.fn_parametro_num('fin.plan_caja_dias_sueldos', 4)::integer, 0);
    v_dias_viajes integer := greatest(ref.fn_parametro_num('fin.plan_caja_viajes_dias', 60)::integer, 7);
    v_items jsonb := '[]'::jsonb; v_j jsonb; v_cuentas jsonb; v_caja numeric; v_res jsonb;
    v_avisos jsonb := '[]'::jsonb; v_n integer; v_m numeric; v_t text; v_cta jsonb;
BEGIN
    IF v_mon NOT IN ('CLP', 'USD') THEN
        RAISE EXCEPTION 'El plan se ve en pesos chilenos (CLP) o en dólares (USD)' USING ERRCODE = '22023';
    END IF;
    v_sem := least(greatest(coalesce((p_opciones ->> 'semanas')::integer, ref.fn_parametro_num('fin.plan_caja_semanas', 13)::integer), 4), 26);
    v_fin := v_lunes + (v_sem * 7 - 1);
    v_dec := CASE WHEN v_mon = 'CLP' THEN 0 ELSE 2 END;
    v_tc := fin.fn_tc_clp_o_null(v_mon, v_hoy);
    IF v_tc IS NULL OR v_tc <= 0 THEN
        RAISE EXCEPTION 'Falta el valor del dólar para ver el plan en dólares: cargalo en Configuración › Monedas y tipos de cambio' USING ERRCODE = '55000';
    END IF;

    -- ── La caja de hoy: bancos y cajas activos ─────────────────────────────────────
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'moneda', c.moneda, 'saldo', s.saldo,
               'saldo_vista', round(s.saldo * s.tc / v_tc, v_dec),
               'cartola_fecha', (SELECT max(l.fecha) FROM fin.cartola_linea l WHERE l.cuenta_dinero_id = c.id),
               'cartola_saldo', (SELECT l.saldo FROM fin.cartola_linea l WHERE l.cuenta_dinero_id = c.id AND l.saldo IS NOT NULL ORDER BY l.fecha DESC, l.id DESC LIMIT 1),
               'por_conciliar', (SELECT count(*) FROM fin.cartola_linea l WHERE l.cuenta_dinero_id = c.id AND l.movimiento_id IS NULL AND NOT l.ignorada))
               ORDER BY c.tipo, c.nombre), '[]'::jsonb),
           coalesce(sum(round(s.saldo * s.tc / v_tc, v_dec)), 0)
      INTO v_cuentas, v_caja
      FROM fin.cuenta_dinero c
     CROSS JOIN LATERAL (SELECT fin.fn_saldo_cuenta_dinero(c.id) AS saldo, fin.fn_tc_clp_o_null(c.moneda, v_hoy) AS tc) s
     WHERE c.activa AND c.eliminado_en IS NULL;

    -- ── Entradas ───────────────────────────────────────────────────────────────────
    -- Facturas emitidas con saldo. Sin fecha cargada: su vencimiento más lo que suele tardar el cliente.
    -- Si esa fecha ya pasó, queda «sin fecha» hasta que alguien cargue cuándo va a pagar.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'factura', 'id', f.id, 'sentido', 'entrada', 'grupo', 'facturas',
               'titulo', c.razon_social || ' · ' || coalesce(f.numero_fiscal, f.numero),
               'detalle', 'Factura del ' || to_char(f.fecha_emision, 'DD/MM/YYYY') || ', vence el ' || to_char(f.vence, 'DD/MM/YYYY')
                          || CASE WHEN f.vence < v_hoy THEN ' (vencida hace ' || (v_hoy - f.vence) || CASE WHEN v_hoy - f.vence = 1 THEN ' día)' ELSE ' días)' END ELSE '' END,
               'fecha', x.fecha, 'fecha_base', f.vence,
               'supuesto', CASE WHEN a.fecha >= v_hoy THEN 'Fecha cargada en el plan'
                                WHEN a.fecha IS NOT NULL THEN 'La fecha cargada (' || to_char(a.fecha, 'DD/MM') || ') ya pasó y no se cobró: falta una fecha nueva'
                                WHEN x.fecha IS NULL THEN 'Vencida: falta cargar cuándo va a pagar'
                                WHEN t.dias > 0 THEN 'Su vencimiento más ' || t.dias || ' días: lo que suele tardar este cliente'
                                ELSE 'Por su vencimiento' END,
               'moneda', f.moneda, 'monto', s.saldo, 'certeza', coalesce(a.certeza, 'probable'),
               'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
      INTO v_j
      FROM ven.factura f
      JOIN mae.cliente c ON c.id = f.cliente_id
     CROSS JOIN LATERAL (SELECT fin.fn_saldo_factura(f.id) AS saldo) s
     CROSS JOIN LATERAL (SELECT fin.fn_plan_caja_atraso(f.cliente_id) AS dias) t
      LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'factura' AND a.origen_id = f.id
     CROSS JOIN LATERAL (SELECT CASE WHEN a.fecha >= v_hoy THEN a.fecha WHEN a.fecha IS NOT NULL THEN NULL
                                     WHEN f.vence + t.dias >= v_hoy THEN f.vence + t.dias END AS fecha) x
     WHERE f.estado = 'emitida' AND f.eliminado_en IS NULL AND s.saldo > 0;
    v_items := v_items || v_j;

    -- Prefacturas sin emitir: se facturan en unos días y se cobran en el plazo del cliente
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'prefactura', 'id', f.id, 'sentido', 'entrada', 'grupo', 'por_facturar',
               'titulo', c.razon_social || ' · ' || f.numero || ' (prefactura sin emitir)',
               'detalle', 'Todavía no se emitió. Plazo del cliente: ' || coalesce(c.condicion_pago_dias, 0) || ' días',
               'fecha', coalesce(CASE WHEN a.fecha >= v_hoy THEN a.fecha END, v_hoy + v_dias_fact + coalesce(c.condicion_pago_dias, 0) + fin.fn_plan_caja_atraso(f.cliente_id)),
               'fecha_base', NULL,
               'supuesto', CASE WHEN a.fecha >= v_hoy THEN 'Fecha cargada en el plan'
                                ELSE 'Estimada: ' || v_dias_fact || ' días para facturar más el plazo del cliente' END,
               'moneda', f.moneda, 'monto', f.total, 'certeza', coalesce(a.certeza, 'probable'),
               'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
      INTO v_j
      FROM ven.factura f
      JOIN mae.cliente c ON c.id = f.cliente_id
      LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'prefactura' AND a.origen_id = f.id
     WHERE f.estado = 'borrador' AND f.eliminado_en IS NULL AND f.total > 0;
    v_items := v_items || v_j;

    -- Viajes sin facturar (entregados, en curso o planificados): con el precio de la operación o de la tarifa
    IF v_via THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'origen', 'servicio', 'id', s.id, 'sentido', 'entrada', 'grupo', 'por_facturar',
                   'titulo', c.razon_social || ' · Op. ' || coalesce(s.numero_operacion::text, s.numero_servicio::text)
                             || CASE s.estado WHEN 'entregado' THEN ' (entregada, sin facturar)' WHEN 'en_curso' THEN ' (en curso)' ELSE ' (planificada)' END,
                   'detalle', concat_ws(' · ', ven.fn_nombre_linea(s.linea_id), 'del ' || to_char(d.fecha, 'DD/MM/YYYY'),
                                        'plazo del cliente: ' || coalesce(c.condicion_pago_dias, 0) || ' días'),
                   'fecha', coalesce(CASE WHEN a.fecha >= v_hoy THEN a.fecha END, greatest(d.fecha, v_hoy) + v_dias_fact + coalesce(c.condicion_pago_dias, 0) + fin.fn_plan_caja_atraso(s.cliente_id)),
                   'fecha_base', d.fecha,
                   'supuesto', CASE WHEN a.fecha >= v_hoy THEN 'Fecha cargada en el plan'
                                    ELSE 'Estimada: ' || v_dias_fact || ' días para facturar más el plazo del cliente' END,
                   'moneda', 'USD', 'monto', p.importe,
                   'certeza', coalesce(a.certeza, CASE WHEN s.estado = 'entregado' THEN 'probable' ELSE 'dudosa' END),
                   'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb),
               count(*) FILTER (WHERE p.importe IS NULL)
          INTO v_j, v_n
          FROM ops.servicio_comercial s
          JOIN mae.cliente c ON c.id = s.cliente_id
         CROSS JOIN LATERAL (SELECT coalesce((s.fecha_real_fin AT TIME ZONE 'America/Argentina/Mendoza')::date, s.fecha_operacion, s.creado_en::date) AS fecha) d
         CROSS JOIN LATERAL (SELECT nullif((ven.fn_precio_servicio(s.id) ->> 'importe')::numeric, 0) AS importe) p
          LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'servicio' AND a.origen_id = s.id
         WHERE s.estado IN ('planificado', 'en_curso', 'entregado') AND s.eliminado_en IS NULL
           AND d.fecha >= v_hoy - v_dias_viajes
           AND ven.fn_factura_de_servicio(s.id) IS NULL;
        -- (los que no tienen precio no se pueden contar)
        SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_j FROM jsonb_array_elements(v_j) e WHERE e ->> 'monto' IS NOT NULL;
        v_items := v_items || v_j;
        IF v_n > 0 THEN
            v_avisos := v_avisos || to_jsonb(CASE WHEN v_n = 1 THEN 'Hay 1 viaje sin facturar que no tiene precio: no se cuenta. Cargale el precio en la operación.'
                                                  ELSE 'Hay ' || v_n || ' viajes sin facturar que no tienen precio: no se cuentan. Cargales el precio en la operación.' END);
        END IF;
        SELECT count(*) INTO v_n FROM ops.servicio_comercial s
         WHERE s.estado IN ('planificado', 'en_curso', 'entregado') AND s.eliminado_en IS NULL
           AND coalesce((s.fecha_real_fin AT TIME ZONE 'America/Argentina/Mendoza')::date, s.fecha_operacion, s.creado_en::date) < v_hoy - v_dias_viajes
           AND ven.fn_factura_de_servicio(s.id) IS NULL;
        IF v_n > 0 THEN
            v_avisos := v_avisos || to_jsonb(CASE WHEN v_n = 1 THEN 'No se cuenta 1 viaje sin facturar' ELSE 'No se cuentan ' || v_n || ' viajes sin facturar' END
                                             || ' de hace más de ' || v_dias_viajes || ' días. Si alguno se va a cobrar, facturalo o cargalo a mano como cobranza.');
        END IF;
    END IF;

    -- Entradas y salidas previstas cargadas a mano
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'partida', 'id', p.id, 'sentido', p.tipo, 'grupo', CASE WHEN p.tipo = 'entrada' THEN 'previstas_entrada' ELSE 'previstas_salida' END,
               'titulo', p.descripcion || CASE WHEN p.tercero IS NOT NULL THEN ' · ' || p.tercero ELSE '' END,
               'detalle', k.nombre || CASE WHEN p.fecha < v_hoy THEN ' · la fecha ya pasó: marcá si ' || CASE WHEN p.tipo = 'entrada' THEN 'ya entró' ELSE 'ya se pagó' END || ' o cambiala' ELSE '' END,
               'fecha', p.fecha, 'fecha_base', p.fecha, 'supuesto', 'Cargada a mano',
               'moneda', p.moneda, 'monto', p.monto, 'certeza', p.certeza, 'contar', true, 'nota', p.nota,
               'ajustada', false, 'ajustable', false, 'categoria', p.categoria, 'tercero', p.tercero, 'descripcion', p.descripcion,
               'version', p.version_fila, 'atrasada', p.fecha < v_hoy)), '[]'::jsonb),
           count(*) FILTER (WHERE p.fecha < v_hoy)
      INTO v_j, v_n
      FROM fin.plan_caja_partida p
      JOIN fin.fn_plan_caja_categorias() k ON k.codigo = p.categoria
     WHERE p.estado = 'prevista';
    v_items := v_items || v_j;
    IF v_n > 0 THEN
        v_avisos := v_avisos || to_jsonb(CASE WHEN v_n = 1 THEN 'Hay 1 entrada o salida prevista con la fecha pasada: se cuenta en esta semana. Marcá si ya se cumplió o cambiale la fecha.'
                                              ELSE 'Hay ' || v_n || ' entradas o salidas previstas con la fecha pasada: se cuentan en esta semana. Marcá si ya se cumplieron o cambiales la fecha.' END);
    END IF;

    -- ── Salidas ────────────────────────────────────────────────────────────────────
    -- Gastos por pagar (facturas de proveedores, cuotas ya generadas). Fecha: la cargada en el plan, el pago previsto
    -- de la cuota o el vencimiento. Si ya pasó, queda «sin fecha» hasta decidir cuándo se paga.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'gasto', 'id', g.id, 'sentido', 'salida', 'grupo', CASE WHEN g.gasto_fijo_id IS NOT NULL THEN 'fijos' ELSE 'proveedores' END,
               'titulo', concat_ws(' · ', coalesce(pr.razon_social, g.proveedor_nombre), left(g.descripcion, 90)),
               'detalle', g.numero || ' · vence el ' || to_char(g.vence, 'DD/MM/YYYY')
                          || CASE WHEN g.vence < v_hoy THEN ' (vencido hace ' || (v_hoy - g.vence) || CASE WHEN v_hoy - g.vence = 1 THEN ' día)' ELSE ' días)' END ELSE '' END,
               'fecha', x.fecha, 'fecha_base', g.vence,
               'supuesto', CASE WHEN a.fecha >= v_hoy THEN 'Fecha cargada en el plan'
                                WHEN a.fecha IS NOT NULL THEN 'La fecha de pago cargada (' || to_char(a.fecha, 'DD/MM') || ') ya pasó: se cuenta para esta semana'
                                WHEN x.fecha IS NULL THEN 'Vencido: falta decidir cuándo se paga'
                                WHEN x.fecha = g.vence THEN 'Por su vencimiento'
                                ELSE 'Pago previsto de la cuota' END,
               'moneda', g.moneda, 'monto', s.saldo, 'certeza', coalesce(a.certeza, 'segura'),
               'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
      INTO v_j
      FROM fin.gasto g
      LEFT JOIN mae.proveedor pr ON pr.id = g.proveedor_id
     CROSS JOIN LATERAL (SELECT fin.fn_saldo_gasto(g.id) AS saldo) s
      LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'gasto' AND a.origen_id = g.id
     CROSS JOIN LATERAL (SELECT CASE WHEN a.fecha IS NOT NULL THEN greatest(a.fecha, v_hoy)
                                     WHEN g.vence >= v_hoy THEN greatest(g.vence, coalesce(g.pago_previsto, g.vence))
                                     WHEN g.pago_previsto >= v_hoy THEN g.pago_previsto END AS fecha) x
     WHERE g.estado = 'vigente' AND g.eliminado_en IS NULL AND s.saldo > 0;
    v_items := v_items || v_j;

    -- Gastos fijos y cuotas de los meses que vienen, que todavía no se generaron
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'fijo', 'id', f.id, 'periodo', to_char(m.mes, 'YYYY-MM'), 'sentido', 'salida', 'grupo', 'fijos',
               'titulo', concat_ws(' · ', pr.razon_social, f.nombre || ' · ' || to_char(m.mes, 'MM/YYYY')
                         || CASE WHEN f.cuotas IS NOT NULL THEN ' · cuota ' || fin.fn_gasto_fijo_cuota_de(f.id, m.mes) || ' de ' || f.cuotas ELSE '' END),
               'detalle', 'Gasto fijo: vence el día ' || f.dia_vence || ' de cada mes',
               'fecha', greatest(m.mes + (f.dia_vence - 1), v_hoy), 'fecha_base', m.mes + (f.dia_vence - 1),
               'supuesto', 'Gasto fijo que todavía no se generó', 'moneda', f.moneda, 'monto', f.monto, 'certeza', coalesce(a.certeza, 'segura'),
               'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true, 'solo_contar', true)), '[]'::jsonb)
      INTO v_j
      FROM fin.gasto_fijo f
      LEFT JOIN mae.proveedor pr ON pr.id = f.proveedor_id
      LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'fijo' AND a.origen_id = f.id
     CROSS JOIN LATERAL (SELECT gs::date AS mes FROM generate_series(date_trunc('month', v_hoy::timestamp), date_trunc('month', v_fin::timestamp), interval '1 month') gs) m
     WHERE f.activo AND f.eliminado_en IS NULL AND f.monto > 0
       AND fin.fn_gasto_fijo_corresponde(f.id, m.mes)
       AND NOT EXISTS (SELECT 1 FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.periodo = m.mes AND g.estado <> 'anulado' AND g.eliminado_en IS NULL);
    v_items := v_items || v_j;

    -- Sueldos de choferes: liquidaciones aprobadas (por transferir) y las que se están preparando
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origen', 'liquidacion', 'id', l.id, 'sentido', 'salida', 'grupo', 'sueldos',
               'titulo', 'Sueldo ' || to_char(l.periodo, 'MM/YYYY') || ' · ' || ops.fn_nombre_chofer(l.chofer_id),
               'detalle', l.numero || CASE WHEN l.estado = 'aprobada' THEN ' · aprobada, por transferir' ELSE ' · en preparación: el monto puede cambiar' END,
               'fecha', greatest(v_hoy, coalesce(a.fecha, l.hasta + v_dias_sueldo)), 'fecha_base', l.hasta + v_dias_sueldo,
               'supuesto', CASE WHEN a.fecha >= v_hoy THEN 'Fecha cargada en el plan'
                                WHEN a.fecha IS NOT NULL THEN 'La fecha cargada (' || to_char(a.fecha, 'DD/MM') || ') ya pasó: se cuenta para esta semana'
                                ELSE v_dias_sueldo || ' días después del cierre del período (' || to_char(l.hasta, 'DD/MM') || ')' END,
               'moneda', l.moneda, 'monto', x.a_pagar,
               'certeza', coalesce(a.certeza, CASE WHEN l.estado = 'aprobada' THEN 'segura' ELSE 'probable' END),
               'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
      INTO v_j
      FROM fin.liquidacion_mensual l
      LEFT JOIN fin.liquidacion_legal g ON g.liquidacion_id = l.id AND g.eliminado_en IS NULL
      LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'liquidacion' AND a.origen_id = l.id
     CROSS JOIN LATERAL (SELECT CASE WHEN l.estado = 'aprobada' AND g.calculo ->> 'a_pagar' IS NOT NULL THEN (g.calculo ->> 'a_pagar')::numeric
                                     WHEN to_jsonb(g) ->> 'col_liquido' IS NOT NULL
                                     THEN (to_jsonb(g) ->> 'col_liquido')::numeric - l.descuentos
                                          + coalesce((SELECT sum(r.importe) FROM fin.liquidacion_renglon r
                                                       WHERE r.liquidacion_id = l.id AND r.codigo = 'REINTEGRO' AND r.tipo <> 'descuento' AND r.eliminado_en IS NULL), 0)
                                     ELSE l.neto END AS a_pagar) x
     WHERE l.eliminado_en IS NULL AND x.a_pagar > 0
       AND (l.estado = 'aprobada' OR (l.estado = 'borrador' AND l.periodo >= (date_trunc('month', v_hoy::timestamp) - interval '1 month')::date));
    v_items := v_items || v_j;

    -- Los sueldos entran al plan cuando se prepara la liquidación. Si el período cierra en estos días (o cerró hace poco)
    -- y hay choferes sin liquidación, se avisa: esa plata todavía no está en el plan.
    IF to_regprocedure('fin.fn_rango_periodo(date)') IS NOT NULL THEN
        EXECUTE $q$
            SELECT string_agg(x.n || CASE WHEN x.n = 1 THEN ' chofer' ELSE ' choferes' END || ' del período ' || to_char(x.periodo, 'MM/YYYY')
                              || CASE WHEN x.hasta < $1 THEN ' (cerró el ' ELSE ' (cierra el ' END || to_char(x.hasta, 'DD/MM') || ')', ' y ' ORDER BY x.periodo)
              FROM (SELECT p.periodo, r.hasta,
                           (SELECT count(*) FROM mae.chofer c
                             WHERE c.eliminado_en IS NULL AND c.fecha_ingreso <= r.hasta AND (c.fecha_egreso IS NULL OR c.fecha_egreso >= r.desde)
                               AND NOT EXISTS (SELECT 1 FROM fin.liquidacion_mensual l
                                                WHERE l.chofer_id = c.id AND l.periodo = p.periodo AND l.estado <> 'anulada' AND l.eliminado_en IS NULL)) AS n
                      FROM (SELECT (date_trunc('month', $1::timestamp) + make_interval(months => k))::date AS periodo FROM generate_series(-1, 1) k) p
                     CROSS JOIN LATERAL fin.fn_rango_periodo(p.periodo) r
                     WHERE r.hasta BETWEEN $1 - 14 AND $1 + 7) x
             WHERE x.n > 0
        $q$ INTO v_t USING v_hoy;
        IF v_t IS NOT NULL THEN
            v_avisos := v_avisos || to_jsonb('Sueldos de choferes que todavía no están en el plan: ' || v_t
                                             || ', sin liquidación preparada. Se preparan en Administración › Liquidaciones; mientras tanto, cargá el monto como salida prevista.');
        END IF;
    END IF;

    -- Combustible de Chile por transferir (si está esa parte del sistema)
    IF to_regclass('fin.pago_carga') IS NOT NULL THEN
        EXECUTE $q$
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'origen', 'pago_carga', 'id', g.id, 'sentido', 'salida', 'grupo', 'combustible',
                       'titulo', 'Combustible · ' || e.nombre || ' · ' || o.numero,
                       'detalle', 'Carga de Chile por ' || CASE g.medio WHEN 'tarjeta' THEN 'tarjeta de flota' ELSE 'transferencia' END || ': falta el pago',
                       'fecha', greatest(coalesce(a.fecha, $1), $1), 'fecha_base', g.creado_en::date,
                       'supuesto', CASE WHEN a.fecha >= $1 THEN 'Fecha cargada en el plan' ELSE 'Está pendiente: se cuenta para esta semana' END,
                       'moneda', g.moneda, 'monto', coalesce(g.importe, (to_jsonb(g) ->> 'importe_max')::numeric),
                       'certeza', coalesce(a.certeza, 'segura'), 'contar', coalesce(a.contar, true), 'nota', a.nota,
                       'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
              FROM fin.pago_carga g
              JOIN fue.orden_carga o ON o.id = g.orden_id
              JOIN mae.estacion_servicio e ON e.id = g.estacion_id
              LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'pago_carga' AND a.origen_id = g.id
             WHERE g.estado = 'pendiente' AND coalesce(g.importe, (to_jsonb(g) ->> 'importe_max')::numeric) > 0
        $q$ INTO v_j USING v_hoy;
        v_items := v_items || v_j;
    END IF;

    -- Fondos aprobados a choferes que todavía no se depositaron
    IF to_regclass('fin.pedido_fondo') IS NOT NULL THEN
        EXECUTE $q$
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'origen', 'pedido_fondo', 'id', p.id, 'sentido', 'salida', 'grupo', 'combustible',
                       'titulo', 'Fondo a chofer · ' || ops.fn_nombre_chofer(p.chofer_id) || ' · ' || p.numero,
                       'detalle', 'Pedido de fondo aprobado: falta depositarlo',
                       'fecha', greatest(coalesce(a.fecha, $1), $1), 'fecha_base', p.pedido_en::date,
                       'supuesto', CASE WHEN a.fecha >= $1 THEN 'Fecha cargada en el plan' ELSE 'Está aprobado: se cuenta para esta semana' END,
                       'moneda', p.moneda, 'monto', p.importe, 'certeza', coalesce(a.certeza, 'segura'),
                       'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
              FROM fin.pedido_fondo p
              LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'pedido_fondo' AND a.origen_id = p.id
             WHERE p.estado = 'aprobado' AND p.importe > 0
        $q$ INTO v_j USING v_hoy;
        v_items := v_items || v_j;
    END IF;

    -- Combustible en cuenta corriente sin factura: se paga cuando llega la factura (sin fecha hasta que se cargue una)
    IF to_regprocedure('fin.fn_proveedor_de_carga(bigint, text)') IS NOT NULL AND to_regprocedure('fin.fn_medio_de_carga(text, bigint)') IS NOT NULL
       AND to_regclass('fin.gasto_carga') IS NOT NULL THEN
        EXECUTE $q$
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'origen', 'cargas_proveedor', 'id', k.proveedor_id, 'periodo', k.moneda, 'sentido', 'salida', 'grupo', 'combustible',
                       'titulo', pr.razon_social || ' · combustible en cuenta corriente sin factura',
                       'detalle', k.n || CASE WHEN k.n = 1 THEN ' carga' ELSE ' cargas' END || ' que todavía no tienen la factura del proveedor',
                       'fecha', CASE WHEN a.fecha IS NOT NULL THEN greatest(a.fecha, $1) END, 'fecha_base', NULL,
                       'supuesto', CASE WHEN a.fecha >= $1 THEN 'Fecha cargada en el plan'
                                        WHEN a.fecha IS NOT NULL THEN 'La fecha cargada ya pasó: se cuenta para esta semana'
                                        ELSE 'Se paga cuando llega la factura: falta cargar cuándo' END,
                       'moneda', k.moneda, 'monto', k.importe, 'certeza', coalesce(a.certeza, 'segura'),
                       'contar', coalesce(a.contar, true), 'nota', a.nota, 'ajustada', a.origen IS NOT NULL, 'fecha_cargada', a.fecha, 'certeza_cargada', a.certeza, 'ajustable', true)), '[]'::jsonb)
              FROM (SELECT fin.fn_proveedor_de_carga(e.id, c.medio_pago) AS proveedor_id, c.moneda::text AS moneda, count(*) AS n,
                           coalesce(sum(c.importe_original), 0) AS importe
                      FROM fue.carga_combustible c JOIN mae.estacion_servicio e ON e.id = c.estacion_id
                     WHERE fin.fn_proveedor_de_carga(e.id, c.medio_pago) IS NOT NULL AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
                       AND (fin.fn_medio_de_carga(c.medio_pago, fin.fn_proveedor_de_carga(e.id, c.medio_pago))).tipo = 'factura_posterior'
                       AND NOT EXISTS (SELECT 1 FROM fin.gasto_carga gc WHERE gc.carga_id = c.id)
                     GROUP BY 1, 2) k
              JOIN mae.proveedor pr ON pr.id = k.proveedor_id
              LEFT JOIN fin.plan_caja_ajuste a ON a.origen = 'cargas_proveedor' AND a.origen_id = k.proveedor_id
             WHERE k.importe > 0
        $q$ INTO v_j USING v_hoy;
        v_items := v_items || v_j;
    END IF;
    -- Lo pagado a cuenta a proveedores baja lo que de verdad hay que pagar
    IF to_regclass('fin.orden_pago') IS NOT NULL AND to_regprocedure('fin.fn_orden_pago_disponible(bigint)') IS NOT NULL THEN
        EXECUTE $q$ SELECT coalesce(sum(round(fin.fn_orden_pago_disponible(o.id) * fin.fn_tc_clp_o_null(o.moneda::text, $1) / $2, $3)), 0)
                      FROM fin.orden_pago o WHERE o.estado = 'vigente' AND fin.fn_orden_pago_disponible(o.id) > 0 $q$
           INTO v_m USING v_hoy, v_tc, v_dec;
        IF v_m > 0 THEN
            v_avisos := v_avisos || to_jsonb('Hay ' || translate(to_char(v_m, CASE WHEN v_dec = 0 THEN 'FM999G999G999G990' ELSE 'FM999G999G999G990D00' END), ',.', '.,') || ' ' || v_mon
                                             || ' pagados a cuenta a proveedores que todavía no se aplicaron a ninguna factura: lo que falta pagar es menos que lo que muestra el plan.');
        END IF;
    END IF;

    -- ── Avisos de la caja ──────────────────────────────────────────────────────────
    SELECT string_agg('«' || (c ->> 'nombre') || '» (' || to_char((c ->> 'cartola_fecha')::date, 'DD/MM') || ')', ', ' ORDER BY c ->> 'nombre')
      INTO v_t FROM jsonb_array_elements(v_cuentas) c
     WHERE c ->> 'tipo' = 'banco' AND (c ->> 'cartola_fecha')::date < v_hoy - 3;
    IF v_t IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('El saldo es el del sistema. La última cartola importada es vieja en: ' || v_t || '. Importá la cartola para que la caja de hoy sea la real.');
    END IF;
    SELECT string_agg('«' || (c ->> 'nombre') || '»', ', ' ORDER BY c ->> 'nombre') INTO v_t FROM jsonb_array_elements(v_cuentas) c
     WHERE c ->> 'tipo' = 'banco' AND c ->> 'cartola_fecha' IS NULL;
    IF v_t IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('Sin ninguna cartola importada: ' || v_t || '. Su saldo sale solo de lo anotado en el sistema.');
    END IF;
    SELECT string_agg('«' || (c ->> 'nombre') || '» (' || (c ->> 'moneda') || ')', ', ' ORDER BY c ->> 'nombre') INTO v_t FROM jsonb_array_elements(v_cuentas) c
     WHERE c ->> 'saldo_vista' IS NULL;
    IF v_t IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb('No se suma a la caja por falta del tipo de cambio: ' || v_t || '. Cargalo en Configuración › Monedas y tipos de cambio.');
    END IF;
    SELECT coalesce(sum((c ->> 'por_conciliar')::integer), 0) INTO v_n FROM jsonb_array_elements(v_cuentas) c;
    IF v_n > 0 THEN
        v_avisos := v_avisos || to_jsonb('Hay ' || v_n || CASE WHEN v_n = 1 THEN ' línea del banco sin conciliar' ELSE ' líneas del banco sin conciliar' END
                                         || ': hasta conciliarlas, el saldo del sistema puede no ser el del banco.');
    END IF;

    -- ── El plan por semana ─────────────────────────────────────────────────────────
    WITH it AS (
        SELECT x.*, round(x.monto * fin.fn_tc_clp_o_null(x.moneda, v_hoy) / v_tc, v_dec) AS monto_vista
          FROM jsonb_to_recordset(v_items) AS x(origen text, id bigint, periodo text, sentido text, grupo text, titulo text, detalle text,
                                                fecha date, fecha_base date, supuesto text, moneda text, monto numeric, certeza text,
                                                contar boolean, nota text, ajustada boolean, ajustable boolean, categoria text, tercero text,
                                                descripcion text, version integer, atrasada boolean, solo_contar boolean,
                                                fecha_cargada date, certeza_cargada text)
    ), cl AS (
        SELECT it.*,
               CASE WHEN NOT it.contar THEN 'no_contar' WHEN it.monto_vista IS NULL THEN 'sin_cambio' WHEN it.fecha IS NULL THEN 'sin_fecha'
                    WHEN it.fecha > v_fin THEN 'despues' ELSE 'semana' END AS cubo,
               CASE WHEN it.contar AND it.monto_vista IS NOT NULL AND it.fecha IS NOT NULL AND it.fecha <= v_fin THEN greatest((it.fecha - v_lunes) / 7, 0) END AS semana,
               (it.contar AND it.monto_vista IS NOT NULL AND (it.certeza <> 'dudosa' OR v_dud)) AS cuenta
          FROM it
    ), sem AS (
        SELECT n, v_lunes + n * 7 AS desde, v_lunes + n * 7 + 6 AS hasta,
               coalesce((SELECT sum(monto_vista) FROM cl WHERE semana = n AND sentido = 'entrada' AND cuenta), 0) AS entradas,
               coalesce((SELECT sum(monto_vista) FROM cl WHERE semana = n AND sentido = 'entrada' AND certeza = 'segura'), 0) AS entradas_seguras,
               coalesce((SELECT sum(monto_vista) FROM cl WHERE semana = n AND sentido = 'salida' AND cuenta), 0) AS salidas,
               coalesce((SELECT sum(monto_vista) FROM cl WHERE semana = n AND sentido = 'salida'), 0) AS salidas_todas
          FROM generate_series(0, v_sem - 1) n
    ), acu AS (
        SELECT s.*, v_caja + sum(s.entradas - s.salidas) OVER (ORDER BY s.n) AS saldo,
               v_caja + sum(s.entradas_seguras - s.salidas_todas) OVER (ORDER BY s.n) AS saldo_prudente
          FROM sem s
    )
    SELECT jsonb_build_object(
        'hoy', v_hoy, 'moneda', v_mon, 'semanas', v_sem, 'hasta', v_fin, 'con_dudosas', v_dud, 'con_viajes', v_via,
        'cambio', jsonb_build_object('USD', fin.fn_tc_clp_o_null('USD', v_hoy), 'ARS', fin.fn_tc_clp_o_null('ARS', v_hoy)),
        'caja', jsonb_build_object('total', v_caja, 'cuentas', v_cuentas),
        'plan', (SELECT jsonb_agg(jsonb_build_object('n', a.n, 'desde', greatest(a.desde, v_hoy), 'hasta', a.hasta, 'entradas', a.entradas, 'salidas', a.salidas,
                                                     'neto', a.entradas - a.salidas, 'saldo', a.saldo, 'saldo_prudente', a.saldo_prudente) ORDER BY a.n) FROM acu a),
        'resumen', jsonb_build_object(
            'entradas', (SELECT coalesce(sum(entradas), 0) FROM acu),
            'salidas', (SELECT coalesce(sum(salidas), 0) FROM acu),
            'saldo_final', (SELECT saldo FROM acu ORDER BY n DESC LIMIT 1),
            'saldo_minimo', (SELECT jsonb_build_object('n', n, 'desde', greatest(desde, v_hoy), 'hasta', hasta, 'saldo', saldo) FROM acu ORDER BY saldo, n LIMIT 1),
            'primera_negativa', (SELECT jsonb_build_object('n', n, 'desde', greatest(desde, v_hoy), 'hasta', hasta, 'falta', -saldo) FROM acu WHERE saldo < 0 ORDER BY n LIMIT 1),
            'prudente_minimo', (SELECT jsonb_build_object('n', n, 'desde', greatest(desde, v_hoy), 'hasta', hasta, 'saldo', saldo_prudente) FROM acu ORDER BY saldo_prudente, n LIMIT 1),
            'prudente_primera_negativa', (SELECT jsonb_build_object('n', n, 'desde', greatest(desde, v_hoy), 'hasta', hasta, 'falta', -saldo_prudente) FROM acu WHERE saldo_prudente < 0 ORDER BY n LIMIT 1),
            'sin_fecha_cobrar', (SELECT jsonb_build_object('monto', coalesce(sum(monto_vista), 0), 'cantidad', count(*)) FROM cl WHERE cubo = 'sin_fecha' AND sentido = 'entrada'),
            'sin_fecha_pagar', (SELECT jsonb_build_object('monto', coalesce(sum(monto_vista), 0), 'cantidad', count(*)) FROM cl WHERE cubo = 'sin_fecha' AND sentido = 'salida'),
            'despues_entradas', (SELECT coalesce(sum(monto_vista), 0) FROM cl WHERE cubo = 'despues' AND sentido = 'entrada'),
            'despues_salidas', (SELECT coalesce(sum(monto_vista), 0) FROM cl WHERE cubo = 'despues' AND sentido = 'salida'),
            'dudosas_sin_contar', (SELECT jsonb_build_object('entradas', coalesce(sum(monto_vista) FILTER (WHERE sentido = 'entrada'), 0),
                                                           'salidas', coalesce(sum(monto_vista) FILTER (WHERE sentido = 'salida'), 0), 'cantidad', count(*))
                                     FROM cl WHERE cubo = 'semana' AND NOT cuenta),
            'no_contar', (SELECT jsonb_build_object('entradas', coalesce(sum(monto_vista) FILTER (WHERE sentido = 'entrada'), 0),
                                                  'salidas', coalesce(sum(monto_vista) FILTER (WHERE sentido = 'salida'), 0), 'cantidad', count(*))
                            FROM cl WHERE cubo = 'no_contar')),
        'partidas', coalesce((SELECT jsonb_agg(jsonb_build_object(
                        'clave', cl.origen || ':' || cl.id || coalesce(':' || cl.periodo, ''), 'origen', cl.origen, 'id', cl.id, 'sentido', cl.sentido,
                        'grupo', cl.grupo, 'titulo', cl.titulo, 'detalle', cl.detalle, 'fecha', cl.fecha, 'fecha_base', cl.fecha_base,
                        'supuesto', cl.supuesto, 'moneda', cl.moneda, 'monto', cl.monto, 'monto_vista', cl.monto_vista, 'certeza', cl.certeza,
                        'cubo', cl.cubo, 'semana', cl.semana, 'cuenta', cl.cuenta, 'nota', cl.nota, 'ajustada', coalesce(cl.ajustada, false),
                        'ajustable', coalesce(cl.ajustable, false), 'categoria', cl.categoria, 'tercero', cl.tercero, 'descripcion', cl.descripcion,
                        'version', cl.version, 'atrasada', coalesce(cl.atrasada, false), 'solo_contar', coalesce(cl.solo_contar, false),
                        'fecha_cargada', cl.fecha_cargada, 'certeza_cargada', cl.certeza_cargada)
                        ORDER BY cl.fecha NULLS LAST, cl.monto_vista DESC NULLS LAST, cl.titulo) FROM cl), '[]'::jsonb))
      INTO v_res;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'partidas') p WHERE p ->> 'cubo' = 'sin_cambio') THEN
        v_avisos := v_avisos || to_jsonb('Hay partidas en una moneda sin tipo de cambio cargado: no se cuentan. Cargalo en Configuración › Monedas y tipos de cambio.'::text);
    END IF;

    SELECT jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre) INTO v_cta FROM fin.cuenta_contable c
     WHERE c.codigo = ref.fn_parametro_texto('fin.plan_caja_cuenta_venta_activos', '') AND c.eliminado_en IS NULL AND c.activa;

    RETURN v_res || jsonb_build_object(
        'avisos', v_avisos,
        'cuenta_venta_activos', v_cta,
        'categorias', (SELECT jsonb_agg(jsonb_build_object('codigo', k.codigo, 'tipo', k.tipo, 'nombre', k.nombre) ORDER BY k.tipo, k.orden) FROM fin.fn_plan_caja_categorias() k),
        'cerradas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'descripcion', p.descripcion, 'tercero', p.tercero, 'fecha', p.fecha,
                                                                 'moneda', p.moneda, 'monto', p.monto, 'estado', p.estado, 'cerrada_en', p.cerrada_en)
                                               ORDER BY p.cerrada_en DESC, p.id DESC)
                                FROM (SELECT * FROM fin.plan_caja_partida WHERE estado <> 'prevista' AND cerrada_en >= v_hoy - 45
                                       ORDER BY cerrada_en DESC, id DESC LIMIT 30) p), '[]'::jsonb));
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_calcular(jsonb) IS
    'Migración 367: arma el plan de caja (caja de hoy, entradas y salidas por semana, saldos). Interna: la usa fin.fn_plan_caja, que controla quién lo ve.';

CREATE OR REPLACE FUNCTION fin.fn_plan_caja(p_opciones jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint;
BEGIN
    v_usr := fin.fn_exigir_lectura_finanzas();
    RETURN fin.fn_plan_caja_calcular(coalesce(p_opciones, '{}'::jsonb))
        || jsonb_build_object('puede_editar', EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'gerencia', 'ti')));
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja(jsonb) IS
    'Migración 367 · Planificador de caja: caja de hoy y, por semana, lo que entra, lo que sale y el saldo. Opciones: moneda (CLP o USD), semanas (4 a 26), con_viajes, con_dudosas. Lo ven los que ven Finanzas.';

-- ---------------------------------------------------------------------------------
-- 6 · Cambiar el plan
-- ---------------------------------------------------------------------------------
-- Fecha esperada, si se cuenta y qué tan segura es una partida que sale del sistema (factura, gasto, sueldo…)
CREATE OR REPLACE FUNCTION fin.fn_plan_caja_ajustar(p_origen text, p_id bigint, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_plan_caja();
    v_hoy date := mae.fn_hoy();
    v_fecha date := nullif(btrim(p_datos ->> 'fecha'), '')::date;
    v_contar boolean := coalesce((p_datos ->> 'contar')::boolean, true);
    v_certeza text := nullif(btrim(p_datos ->> 'certeza'), '');
    v_nota text := nullif(regexp_replace(btrim(coalesce(p_datos ->> 'nota', '')), '\s+', ' ', 'g'), '');
    v_existe boolean;
BEGIN
    IF p_id IS NULL OR p_origen IS NULL OR p_origen NOT IN ('factura', 'prefactura', 'servicio', 'gasto', 'fijo', 'liquidacion', 'pago_carga', 'pedido_fondo', 'cargas_proveedor') THEN
        RAISE EXCEPTION 'Esa partida del plan no se puede cambiar' USING ERRCODE = '22023';
    END IF;
    CASE p_origen
        WHEN 'factura' THEN v_existe := EXISTS (SELECT 1 FROM ven.factura WHERE id = p_id AND estado = 'emitida' AND eliminado_en IS NULL);
        WHEN 'prefactura' THEN v_existe := EXISTS (SELECT 1 FROM ven.factura WHERE id = p_id AND estado = 'borrador' AND eliminado_en IS NULL);
        WHEN 'servicio' THEN v_existe := EXISTS (SELECT 1 FROM ops.servicio_comercial WHERE id = p_id AND eliminado_en IS NULL);
        WHEN 'gasto' THEN v_existe := EXISTS (SELECT 1 FROM fin.gasto WHERE id = p_id AND estado = 'vigente' AND eliminado_en IS NULL);
        WHEN 'fijo' THEN v_existe := EXISTS (SELECT 1 FROM fin.gasto_fijo WHERE id = p_id AND activo AND eliminado_en IS NULL);
        WHEN 'liquidacion' THEN v_existe := EXISTS (SELECT 1 FROM fin.liquidacion_mensual WHERE id = p_id AND estado IN ('borrador', 'aprobada') AND eliminado_en IS NULL);
        WHEN 'cargas_proveedor' THEN v_existe := EXISTS (SELECT 1 FROM mae.proveedor WHERE id = p_id);
        ELSE
            IF to_regclass('fin.' || p_origen) IS NULL THEN v_existe := false;
            ELSE EXECUTE format('SELECT EXISTS (SELECT 1 FROM fin.%I WHERE id = $1)', p_origen) INTO v_existe USING p_id;
            END IF;
    END CASE;
    IF NOT v_existe THEN
        RAISE EXCEPTION 'Esa partida ya no está en el plan (se cobró, se pagó o se anuló): volvé a abrir el planificador' USING ERRCODE = 'P0002';
    END IF;
    IF p_origen = 'fijo' AND v_fecha IS NOT NULL THEN
        RAISE EXCEPTION 'A un gasto fijo que todavía no se generó no se le cambia la fecha acá: el día de vencimiento se cambia en Finanzas › Gastos fijos' USING ERRCODE = '22023';
    END IF;
    IF v_fecha IS NOT NULL AND (v_fecha < v_hoy OR v_fecha > v_hoy + 730) THEN
        RAISE EXCEPTION 'La fecha esperada va de hoy en adelante (hasta 2 años)' USING ERRCODE = '22023';
    END IF;
    IF v_certeza IS NOT NULL AND v_certeza NOT IN ('segura', 'probable', 'dudosa') THEN
        RAISE EXCEPTION 'Elegí si es segura, probable o dudosa' USING ERRCODE = '22023';
    END IF;
    IF length(v_nota) > 300 THEN RAISE EXCEPTION 'La nota puede tener hasta 300 letras' USING ERRCODE = '22023'; END IF;

    -- Sin fecha, sin nota, contando y sin cambiar la certeza: vuelve a lo que calcula el sistema
    IF v_fecha IS NULL AND v_contar AND v_certeza IS NULL AND v_nota IS NULL THEN
        DELETE FROM fin.plan_caja_ajuste WHERE origen = p_origen AND origen_id = p_id;
        RETURN NULL;
    END IF;
    INSERT INTO fin.plan_caja_ajuste (origen, origen_id, fecha, contar, certeza, nota, actualizado_en, actualizado_por)
    VALUES (p_origen, p_id, v_fecha, v_contar, v_certeza, v_nota, now(), v_usr)
    ON CONFLICT (origen, origen_id) DO UPDATE
       SET fecha = EXCLUDED.fecha, contar = EXCLUDED.contar, certeza = EXCLUDED.certeza, nota = EXCLUDED.nota,
           actualizado_en = now(), actualizado_por = v_usr;
    RETURN jsonb_build_object('origen', p_origen, 'id', p_id, 'fecha', v_fecha, 'contar', v_contar, 'certeza', v_certeza, 'nota', v_nota);
END $function$;
COMMENT ON FUNCTION fin.fn_plan_caja_ajustar(text, bigint, jsonb) IS
    'Migración 367: carga para una partida del plan de caja (factura, gasto, sueldo…) la fecha esperada, si se cuenta y qué tan segura es. Con todo vacío vuelve a lo automático. Finanzas, Gerencia o TI.';

-- Alta o cambio de una entrada o salida prevista (p_id NULL = nueva). Al crearla se puede repetir (cuotas).
CREATE OR REPLACE FUNCTION fin.fn_guardar_partida_caja(p_id bigint, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr bigint := fin.fn_exigir_plan_caja();
    v_hoy date := mae.fn_hoy();
    p fin.plan_caja_partida%ROWTYPE;
    v_tipo text := nullif(btrim(p_datos ->> 'tipo'), '');
    v_cat text := nullif(btrim(p_datos ->> 'categoria'), '');
    v_desc text := regexp_replace(btrim(coalesce(p_datos ->> 'descripcion', '')), '\s+', ' ', 'g');
    v_ter text := nullif(regexp_replace(btrim(coalesce(p_datos ->> 'tercero', '')), '\s+', ' ', 'g'), '');
    v_fecha date := nullif(btrim(p_datos ->> 'fecha'), '')::date;
    v_mon text := upper(nullif(btrim(p_datos ->> 'moneda'), ''));
    v_monto numeric := (p_datos ->> 'monto')::numeric;
    v_cer text := coalesce(nullif(btrim(p_datos ->> 'certeza'), ''), 'probable');
    v_nota text := nullif(regexp_replace(btrim(coalesce(p_datos ->> 'nota', '')), '\s+', ' ', 'g'), '');
    v_cada text := coalesce(nullif(btrim(p_datos #>> '{repetir,cada}'), ''), 'no');
    v_veces integer := coalesce((p_datos #>> '{repetir,veces}')::integer, 1);
    v_serie bigint; v_ids bigint[] := '{}'; v_idn bigint; i integer; v_f date;
BEGIN
    IF v_tipo IS NULL OR v_tipo NOT IN ('entrada', 'salida') THEN RAISE EXCEPTION 'Elegí si es una entrada o una salida' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM fin.fn_plan_caja_categorias() k WHERE k.codigo = v_cat AND k.tipo = v_tipo) THEN
        RAISE EXCEPTION 'Elegí de qué se trata' USING ERRCODE = '22023';
    END IF;
    IF length(v_desc) < 3 OR length(v_desc) > 200 THEN RAISE EXCEPTION 'Escribí qué es (de 3 a 200 letras)' USING ERRCODE = '22023'; END IF;
    IF length(v_ter) > 120 THEN RAISE EXCEPTION 'El nombre de quién paga o cobra puede tener hasta 120 letras' USING ERRCODE = '22023'; END IF;
    IF v_fecha IS NULL OR v_fecha > v_hoy + 730 THEN RAISE EXCEPTION 'Elegí la fecha en que se espera (hasta 2 años)' USING ERRCODE = '22023'; END IF;
    IF v_mon IS NULL OR NOT EXISTS (SELECT 1 FROM ref.moneda m WHERE m.codigo = v_mon AND m.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí la moneda' USING ERRCODE = '22023';
    END IF;
    IF v_monto IS NULL OR v_monto <= 0 OR v_monto > 99999999999 THEN RAISE EXCEPTION 'Escribí el monto (mayor que 0)' USING ERRCODE = '22023'; END IF;
    IF v_cer NOT IN ('segura', 'probable', 'dudosa') THEN RAISE EXCEPTION 'Elegí si es segura, probable o dudosa' USING ERRCODE = '22023'; END IF;
    IF length(v_nota) > 300 THEN RAISE EXCEPTION 'La nota puede tener hasta 300 letras' USING ERRCODE = '22023'; END IF;
    v_monto := round(v_monto, 2);

    IF p_id IS NOT NULL THEN
        SELECT * INTO p FROM fin.plan_caja_partida WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Esa partida no existe' USING ERRCODE = 'P0002'; END IF;
        IF p.estado <> 'prevista' THEN RAISE EXCEPTION 'Esa partida ya está %: reabrila para cambiarla', p.estado USING ERRCODE = '55000'; END IF;
        IF (p_datos ->> 'version') IS NOT NULL AND (p_datos ->> 'version')::integer <> p.version_fila THEN
            RAISE EXCEPTION 'La partida cambió mientras la mirabas: volvé a abrirla' USING ERRCODE = '40001';
        END IF;
        IF v_fecha < v_hoy AND v_fecha <> p.fecha THEN RAISE EXCEPTION 'La fecha esperada va de hoy en adelante' USING ERRCODE = '22023'; END IF;
        UPDATE fin.plan_caja_partida
           SET tipo = v_tipo, categoria = v_cat, descripcion = v_desc, tercero = v_ter, fecha = v_fecha, moneda = v_mon, monto = v_monto,
               certeza = v_cer, nota = v_nota, actualizado_en = now(), actualizado_por = v_usr, version_fila = version_fila + 1
         WHERE id = p_id;
        RETURN jsonb_build_object('ids', jsonb_build_array(p_id));
    END IF;

    IF v_fecha < v_hoy THEN RAISE EXCEPTION 'La fecha esperada va de hoy en adelante' USING ERRCODE = '22023'; END IF;
    IF v_cada NOT IN ('no', 'semana', 'quincena', 'mes') THEN RAISE EXCEPTION 'Elegí cada cuánto se repite' USING ERRCODE = '22023'; END IF;
    IF v_cada = 'no' THEN v_veces := 1; END IF;
    IF v_veces < 1 OR v_veces > 24 THEN RAISE EXCEPTION 'Se puede repetir hasta 24 veces' USING ERRCODE = '22023'; END IF;
    FOR i IN 0 .. v_veces - 1 LOOP
        v_f := CASE v_cada WHEN 'semana' THEN v_fecha + i * 7 WHEN 'quincena' THEN v_fecha + i * 14
                           WHEN 'mes' THEN (v_fecha + make_interval(months => i))::date ELSE v_fecha END;
        INSERT INTO fin.plan_caja_partida (tipo, categoria, descripcion, tercero, fecha, moneda, monto, certeza, nota, serie_id, creado_por, actualizado_por)
        VALUES (v_tipo, v_cat, left(v_desc || CASE WHEN v_veces > 1 THEN ' (' || (i + 1) || ' de ' || v_veces || ')' ELSE '' END, 200),
                v_ter, v_f, v_mon, v_monto, v_cer, v_nota, v_serie, v_usr, v_usr)
        RETURNING id INTO v_idn;
        IF i = 0 AND v_veces > 1 THEN
            v_serie := v_idn;
            UPDATE fin.plan_caja_partida SET serie_id = v_serie WHERE id = v_idn;
        END IF;
        v_ids := v_ids || v_idn;
    END LOOP;
    RETURN jsonb_build_object('ids', to_jsonb(v_ids));
END $function$;
COMMENT ON FUNCTION fin.fn_guardar_partida_caja(bigint, jsonb) IS
    'Migración 367: alta o cambio de una entrada o salida prevista del plan de caja (venta de un activo, cobranza acordada, impuestos…). Al crearla se puede repetir por semana, quincena o mes. Finanzas, Gerencia o TI.';

-- Cerrar una partida prevista: ya se cumplió (entró o se pagó), no va más, o volver a abrirla
CREATE OR REPLACE FUNCTION fin.fn_cerrar_partida_caja(p_id bigint, p_accion text, p_fecha date DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint := fin.fn_exigir_plan_caja(); v_hoy date := mae.fn_hoy(); p fin.plan_caja_partida%ROWTYPE; v_estado text;
BEGIN
    SELECT * INTO p FROM fin.plan_caja_partida WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esa partida no existe' USING ERRCODE = 'P0002'; END IF;
    IF p_accion = 'cumplida' THEN
        IF p.estado <> 'prevista' THEN RAISE EXCEPTION 'Esa partida ya está %', p.estado USING ERRCODE = '55000'; END IF;
        IF coalesce(p_fecha, v_hoy) > v_hoy THEN RAISE EXCEPTION 'La fecha en que se cumplió no puede ser futura' USING ERRCODE = '22023'; END IF;
        v_estado := 'cumplida';
    ELSIF p_accion = 'anulada' THEN
        IF p.estado <> 'prevista' THEN RAISE EXCEPTION 'Esa partida ya está %', p.estado USING ERRCODE = '55000'; END IF;
        v_estado := 'anulada';
    ELSIF p_accion = 'reabrir' THEN
        IF p.estado = 'prevista' THEN RAISE EXCEPTION 'Esa partida ya está abierta' USING ERRCODE = '55000'; END IF;
        v_estado := 'prevista';
    ELSE
        RAISE EXCEPTION 'Elegí qué hacer con la partida' USING ERRCODE = '22023';
    END IF;
    UPDATE fin.plan_caja_partida
       SET estado = v_estado,
           cerrada_en = CASE v_estado WHEN 'cumplida' THEN coalesce(p_fecha, v_hoy) WHEN 'anulada' THEN v_hoy END,
           actualizado_en = now(), actualizado_por = v_usr, version_fila = version_fila + 1
     WHERE id = p_id;
    RETURN v_estado;
END $function$;
COMMENT ON FUNCTION fin.fn_cerrar_partida_caja(bigint, text, date) IS
    'Migración 367: cierra una entrada o salida prevista del plan de caja: cumplida (la plata ya entró o salió y está anotada en Bancos), anulada o reabrir. Finanzas, Gerencia o TI.';

-- ---------------------------------------------------------------------------------
-- 7 · Permisos: los de «Por cobrar» (quien ve Finanzas); quién cambia el plan lo decide cada función
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_plan_caja(jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_plan_caja_ajustar(text, bigint, jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_guardar_partida_caja(bigint, jsonb)');
SELECT pg_temp.fn_copiar_permisos('fin.fn_por_cobrar()', 'fin.fn_cerrar_partida_caja(bigint, text, date)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_calcular(jsonb)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_atraso(bigint)');
SELECT pg_temp.fn_solo_interna('fin.fn_plan_caja_categorias()');
SELECT pg_temp.fn_solo_interna('fin.fn_exigir_plan_caja()');

-- ---------------------------------------------------------------------------------
-- 8 · Prueba con los datos de esta base: si el cálculo falla, no queda nada aplicado
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE j jsonb;
BEGIN
    j := fin.fn_plan_caja_calcular('{}'::jsonb);
    IF jsonb_array_length(j -> 'plan') <> (j ->> 'semanas')::integer THEN
        RAISE EXCEPTION 'el plan no trae todas las semanas';
    END IF;
    IF fin.fn_tc_clp_o_null('USD', mae.fn_hoy()) IS NOT NULL THEN
        j := fin.fn_plan_caja_calcular('{"moneda": "USD", "semanas": 8, "con_dudosas": true, "con_viajes": false}'::jsonb);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'El planificador no pudo calcular con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: cómo queda el plan hoy (en pesos chilenos, 13 semanas)
WITH p AS (SELECT fin.fn_plan_caja_calcular('{}'::jsonb) AS j)
SELECT 'migración 367 aplicada' AS que,
       (j -> 'caja' ->> 'total')::numeric AS caja_hoy_clp,
       jsonb_array_length(j -> 'caja' -> 'cuentas') AS cuentas,
       (j -> 'resumen' ->> 'entradas')::numeric AS entradas_13_semanas,
       (j -> 'resumen' ->> 'salidas')::numeric AS salidas_13_semanas,
       (j -> 'resumen' -> 'saldo_minimo' ->> 'saldo')::numeric AS saldo_minimo,
       (j -> 'resumen' -> 'saldo_minimo' ->> 'desde') AS semana_del_minimo,
       (j -> 'resumen' -> 'sin_fecha_cobrar' ->> 'monto')::numeric AS vencido_por_cobrar_sin_fecha,
       (j -> 'resumen' -> 'sin_fecha_pagar' ->> 'monto')::numeric AS por_pagar_sin_fecha,
       jsonb_array_length(j -> 'partidas') AS partidas,
       coalesce(j -> 'cuenta_venta_activos' ->> 'codigo', 'FALTA CREARLA') || ' ' || coalesce(j -> 'cuenta_venta_activos' ->> 'nombre', '') AS cuenta_venta_de_activos,
       jsonb_array_length(j -> 'avisos') AS avisos
  FROM p;
