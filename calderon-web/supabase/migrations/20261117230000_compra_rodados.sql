-- Finanzas · Compra de vehículos (rodados) con documentos: el activo y la deuda se arman solos
-- Pedido del 17/11/2026. NO cambia web.version_base. Necesita gasto_fijo_cuotas_04.sql. Se puede correr más de una vez.
--
-- Se carga la compra UNA vez (unidad, valor contado, IVA, pie, documentos) y el sistema:
--   1) da de alta el vehículo en el activo (1.2.01) por su valor contado;
--   2) deja la deuda en «Documentos por pagar por compra de vehículos» (2.1.10, cuenta nueva) por el capital que falta pagar;
--      lo que ya se había pagado antes de cargarla (pie y documentos viejos) va contra «Saldos de apertura»;
--   3) crea los documentos como un gasto fijo con cuotas: cada mes aparece el documento para pagar, igual que una cuota de leasing
--      (se paga con «Pagar», con mora si hubo atraso). Al aparecer, su parte de capital sale de 2.1.10 y su parte de interés va a 6.1.09;
--   4) registra la depreciación de cada mes terminado (6.1.10 contra 1.2.03). La de meses anteriores al inicio de la contabilidad
--      (o al mes de la carga, si la contabilidad no tiene fecha de inicio) va contra «Saldos de apertura».
-- Interés = suma de los documentos − (valor contado + IVA − pie), repartido en partes iguales entre los documentos.
-- Por ahora solo en pesos chilenos y una unidad por compra.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fin.fn_gasto_fijo_ajustar_cuotas(bigint)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas_04.sql'; END IF;
    IF to_regclass('fin.gasto_fijo_equipo') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr gasto_fijo_equipos.sql'; END IF;
END $do$;

-- ───────────── Cuentas ─────────────
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('fin.rodado_cuenta_activo',     '"1.2.01"', 'Código de la cuenta contable donde entra el valor de los vehículos comprados.'),
 ('fin.rodado_cuenta_documentos', '"2.1.10"', 'Código de la cuenta contable de los documentos por pagar por compra de vehículos.'),
 ('fin.rodado_cuenta_intereses',  '"6.1.09"', 'Código de la cuenta contable de los intereses de los documentos de compra de vehículos.'),
 ('fin.rodado_cuenta_dep_acum',   '"1.2.03"', 'Código de la cuenta contable de la depreciación acumulada de los vehículos.')
ON CONFLICT (codigo) DO NOTHING;

DO $do$
DECLARE v_cod text := ref.fn_parametro_texto('fin.rodado_cuenta_documentos', '2.1.10'); v_padre smallint; c record;
BEGIN
    SELECT * INTO c FROM fin.cuenta_contable WHERE codigo = v_cod AND eliminado_en IS NULL;
    IF NOT FOUND THEN
        SELECT padre_id INTO v_padre FROM fin.cuenta_contable WHERE uso = 'CXP' AND eliminado_en IS NULL;
        PERFORM set_config('fin.cont_fn', '1', true);
        INSERT INTO fin.cuenta_contable (codigo, nombre, tipo, padre_id, imputable, activa)
        VALUES (v_cod, 'Documentos por pagar por compra de vehículos', 'pasivo', v_padre, true, true);
    ELSIF c.tipo <> 'pasivo' OR NOT c.imputable THEN
        RAISE EXCEPTION 'La cuenta % ya existe y no es un pasivo que se pueda usar (%): avisar antes de seguir', v_cod, c.nombre;
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION fin.fn_rodado_cuenta_o_null(p_cual text)
 RETURNS smallint LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT c.id FROM fin.cuenta_contable c
     WHERE c.eliminado_en IS NULL AND c.imputable
       AND c.codigo = ref.fn_parametro_texto('fin.rodado_cuenta_' || p_cual, '')
$f$;

CREATE OR REPLACE FUNCTION fin.fn_rodado_cuenta(p_cual text)
 RETURNS smallint LANGUAGE plpgsql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v smallint := fin.fn_rodado_cuenta_o_null(p_cual);
BEGIN
    IF v IS NULL THEN RAISE EXCEPTION 'Falta la cuenta contable para la compra de vehículos (parámetro fin.rodado_cuenta_%)', p_cual USING ERRCODE = 'P0002'; END IF;
    RETURN v;
END $f$;

-- ───────────── Tablas ─────────────
CREATE TABLE IF NOT EXISTS fin.compra_rodado (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id          bigint REFERENCES mae.camion(id),
    semi_id            bigint REFERENCES mae.semirremolque(id),
    fecha              date NOT NULL,
    proveedor_id       bigint REFERENCES mae.proveedor(id),
    moneda             char(3) NOT NULL DEFAULT 'CLP',
    valor_neto         numeric(16,2) NOT NULL,
    iva                numeric(16,2) NOT NULL DEFAULT 0,
    pie                numeric(16,2) NOT NULL DEFAULT 0,
    pie_pagado_antes   boolean NOT NULL DEFAULT false,
    documentos         smallint NOT NULL DEFAULT 0,
    monto_documento    numeric(16,2) NOT NULL DEFAULT 0,
    primer_vencimiento date,
    documentos_previos smallint NOT NULL DEFAULT 0,
    vida_util_meses    smallint NOT NULL,
    valor_residual     numeric(16,2) NOT NULL DEFAULT 0,
    alta_mes           date NOT NULL,
    gasto_fijo_id      bigint REFERENCES fin.gasto_fijo(id),
    observacion        text,
    estado             text NOT NULL DEFAULT 'vigente',
    motivo             text,
    creado_en          timestamptz NOT NULL DEFAULT now(),
    creado_por         bigint,
    anulado_en         timestamptz,
    anulado_por        bigint,
    CONSTRAINT ck_cr_unidad CHECK ((camion_id IS NULL) <> (semi_id IS NULL)),
    CONSTRAINT ck_cr_estado CHECK (estado IN ('vigente', 'anulada')),
    CONSTRAINT ck_cr_montos CHECK (valor_neto > 0 AND iva >= 0 AND pie >= 0 AND pie <= valor_neto + iva AND documentos BETWEEN 0 AND 240
                                   AND monto_documento >= 0 AND documentos_previos BETWEEN 0 AND documentos
                                   AND vida_util_meses BETWEEN 1 AND 600 AND valor_residual >= 0 AND valor_residual < valor_neto),
    CONSTRAINT ck_cr_textos CHECK (coalesce(length(observacion), 0) <= 500 AND coalesce(length(motivo), 0) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cr_camion ON fin.compra_rodado (camion_id) WHERE camion_id IS NOT NULL AND estado = 'vigente';
CREATE UNIQUE INDEX IF NOT EXISTS ux_cr_semi ON fin.compra_rodado (semi_id) WHERE semi_id IS NOT NULL AND estado = 'vigente';
COMMENT ON TABLE fin.compra_rodado IS 'Compra de un vehículo (tractor o semirremolque) con sus documentos. De acá salen el activo, la deuda, los intereses y la depreciación.';

CREATE TABLE IF NOT EXISTS fin.rodado_depreciacion (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    compra_id bigint NOT NULL REFERENCES fin.compra_rodado(id),
    periodo   date NOT NULL,
    monto     numeric(16,2) NOT NULL,
    previa    boolean NOT NULL DEFAULT false,
    creado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ux_rd UNIQUE (compra_id, periodo)
);
COMMENT ON TABLE fin.rodado_depreciacion IS 'Depreciación de cada mes de un vehículo comprado. «previa» = todo lo acumulado antes de cargar la compra en el sistema.';
REVOKE ALL ON fin.compra_rodado, fin.rodado_depreciacion FROM PUBLIC;

ALTER TABLE fin.gasto_fijo ADD COLUMN IF NOT EXISTS compra_rodado_id bigint REFERENCES fin.compra_rodado(id);
ALTER TABLE fin.gasto ADD COLUMN IF NOT EXISTS compra_rodado_id bigint REFERENCES fin.compra_rodado(id);
COMMENT ON COLUMN fin.gasto_fijo.compra_rodado_id IS 'Si este gasto fijo son los documentos de una compra de vehículo.';
COMMENT ON COLUMN fin.gasto.compra_rodado_id IS 'Si este gasto es el pie de una compra de vehículo.';

-- Los asientos nuevos: compra y depreciación
DO $do$
DECLARE v_def text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conname = 'ck_as_origen' AND conrelid = 'fin.asiento'::regclass;
    IF v_def IS NULL THEN RAISE EXCEPTION 'No encontré la regla ck_as_origen de fin.asiento: no es la que esperaba esta migración'; END IF;
    IF position('''rodado''' IN v_def) = 0 THEN
        IF position('''insumo''::text])' IN v_def) = 0 THEN RAISE EXCEPTION 'La regla ck_as_origen no es la que esperaba esta migración'; END IF;
        v_def := replace(v_def, '''insumo''::text])', '''insumo''::text, ''rodado''::text, ''depreciacion''::text])');
        ALTER TABLE fin.asiento DROP CONSTRAINT ck_as_origen;
        EXECUTE 'ALTER TABLE fin.asiento ADD CONSTRAINT ck_as_origen ' || v_def;
    END IF;
END $do$;

-- ───────────── Cálculos ─────────────
-- Interés total de la compra y capital que se financia con documentos
CREATE OR REPLACE FUNCTION fin.fn_rodado_financiado(c fin.compra_rodado) RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$ SELECT c.valor_neto + c.iva - c.pie $f$;

-- Interés del documento número k (el último absorbe el redondeo)
CREATE OR REPLACE FUNCTION fin.fn_rodado_interes_doc(c fin.compra_rodado, k integer) RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$
    SELECT CASE WHEN c.documentos = 0 OR k NOT BETWEEN 1 AND c.documentos THEN 0
                WHEN k = c.documentos THEN i.total - (c.documentos - 1) * round(i.total / c.documentos, 0)
                ELSE round(i.total / c.documentos, 0) END
      FROM (SELECT greatest(c.documentos * c.monto_documento - (c.valor_neto + c.iva - c.pie), 0) AS total) i
$f$;

-- Capital de los documentos 1..k
CREATE OR REPLACE FUNCTION fin.fn_rodado_capital_hasta(c fin.compra_rodado, k integer) RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$
    SELECT coalesce(sum(c.monto_documento - fin.fn_rodado_interes_doc(c, n)), 0) FROM generate_series(1, least(k, c.documentos::integer)) n
$f$;

-- Interés (en pesos) dentro de un gasto: 0 si el gasto no es un documento de compra de vehículo
CREATE OR REPLACE FUNCTION fin.fn_rodado_interes_gasto(p_gasto bigint)
 RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce((
        SELECT least(fin.fn_rodado_interes_doc(c, fin.fn_gasto_fijo_cuota_de(f.id, g.periodo)), g.total)
          FROM fin.gasto g JOIN fin.gasto_fijo f ON f.id = g.gasto_fijo_id JOIN fin.compra_rodado c ON c.id = f.compra_rodado_id
         WHERE g.id = p_gasto AND c.estado = 'vigente'), 0)
$f$;

-- Depreciación de un mes (mes 1 = el de la compra; el último absorbe el redondeo)
CREATE OR REPLACE FUNCTION fin.fn_rodado_dep_mes(c fin.compra_rodado, p_mes date) RETURNS numeric LANGUAGE sql IMMUTABLE
AS $f$
    SELECT CASE WHEN k.n NOT BETWEEN 1 AND c.vida_util_meses THEN 0
                WHEN k.n = c.vida_util_meses THEN (c.valor_neto - c.valor_residual) - (c.vida_util_meses - 1) * round((c.valor_neto - c.valor_residual) / c.vida_util_meses, 0)
                ELSE round((c.valor_neto - c.valor_residual) / c.vida_util_meses, 0) END
      FROM (SELECT ((extract(year FROM p_mes) - extract(year FROM c.fecha)) * 12 + extract(month FROM p_mes) - extract(month FROM c.fecha))::integer + 1 AS n) k
$f$;

-- ───────────── Asientos ─────────────
CREATE OR REPLACE FUNCTION fin.fn_contabilizar_rodado(p_id bigint)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE c fin.compra_rodado%ROWTYPE; v_pat text; v_pagado numeric; v_pend numeric;
BEGIN
    SELECT * INTO c FROM fin.compra_rodado WHERE id = p_id;
    IF NOT FOUND OR c.estado <> 'vigente' THEN PERFORM fin.fn_grabar_asiento('rodado', p_id, current_date, '', '[]'); RETURN; END IF;
    v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = c.camion_id), (SELECT patente FROM mae.semirremolque WHERE id = c.semi_id));
    v_pagado := fin.fn_rodado_capital_hasta(c, c.documentos_previos) + CASE WHEN c.pie_pagado_antes THEN c.pie ELSE 0 END;
    v_pend := c.valor_neto + c.iva - v_pagado;
    PERFORM fin.fn_grabar_asiento('rodado', c.id, c.fecha, 'Compra de vehículo ' || v_pat, jsonb_build_array(
        fin.fn_linea(fin.fn_rodado_cuenta('activo'), c.valor_neto, 0, 'Compra ' || v_pat, c.camion_id),
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
    v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = c.camion_id), (SELECT patente FROM mae.semirremolque WHERE id = c.semi_id));
    PERFORM fin.fn_grabar_asiento('depreciacion', d.id, (d.periodo + interval '1 month' - interval '1 day')::date,
        'Depreciación ' || v_pat || CASE WHEN d.previa THEN ' · acumulada antes de cargar la compra' ELSE ' · ' || to_char(d.periodo, 'MM/YYYY') END,
        jsonb_build_array(
            fin.fn_linea(CASE WHEN d.previa THEN fin.fn_cuenta_uso('APERTURA') ELSE fin.fn_cuenta_uso('DEPRECIACION') END, d.monto, 0, 'Depreciación ' || v_pat, c.camion_id),
            fin.fn_linea(fin.fn_rodado_cuenta('dep_acum'), 0, d.monto, 'Depreciación ' || v_pat, c.camion_id)));
END $function$;

-- Registra la depreciación de los meses TERMINADOS que falten (todas las compras, o una)
CREATE OR REPLACE FUNCTION fin.fn_rodado_depreciar(p_compra bigint DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE c fin.compra_rodado%ROWTYPE; v_este date := date_trunc('month', mae.fn_hoy())::date; v_mes date; v_fin date; v_monto numeric; v_id bigint; n integer := 0;
BEGIN
    FOR c IN SELECT * FROM fin.compra_rodado WHERE estado = 'vigente' AND (p_compra IS NULL OR id = p_compra) ORDER BY id LOOP
        v_fin := (date_trunc('month', c.fecha) + make_interval(months => c.vida_util_meses::integer - 1))::date;   -- último mes con depreciación
        -- Lo acumulado antes del mes en que se cargó la compra: un solo renglón, contra saldos de apertura
        IF date_trunc('month', c.fecha)::date < c.alta_mes
           AND NOT EXISTS (SELECT 1 FROM fin.rodado_depreciacion d WHERE d.compra_id = c.id AND d.previa) THEN
            SELECT coalesce(sum(fin.fn_rodado_dep_mes(c, m::date)), 0) INTO v_monto
              FROM generate_series(date_trunc('month', c.fecha), least(c.alta_mes - interval '1 month', v_fin), interval '1 month') m;
            IF v_monto > 0 THEN
                INSERT INTO fin.rodado_depreciacion (compra_id, periodo, monto, previa)
                VALUES (c.id, (c.alta_mes - interval '1 month')::date, v_monto, true) RETURNING id INTO v_id;
                PERFORM fin.fn_contabilizar_depreciacion(v_id); n := n + 1;
            END IF;
        END IF;
        FOR v_mes IN SELECT m::date FROM generate_series(greatest(c.alta_mes, date_trunc('month', c.fecha)::date)::timestamp, least(v_este - interval '1 month', v_fin), interval '1 month') m LOOP
            CONTINUE WHEN EXISTS (SELECT 1 FROM fin.rodado_depreciacion d WHERE d.compra_id = c.id AND d.periodo = v_mes);
            v_monto := fin.fn_rodado_dep_mes(c, v_mes);
            CONTINUE WHEN v_monto <= 0;
            INSERT INTO fin.rodado_depreciacion (compra_id, periodo, monto) VALUES (c.id, v_mes, v_monto) RETURNING id INTO v_id;
            PERFORM fin.fn_contabilizar_depreciacion(v_id); n := n + 1;
        END LOOP;
    END LOOP;
    RETURN n;
END $function$;

-- El gasto que es un documento de compra separa el interés (6.1.09) del capital (2.1.10)
DO $do$
DECLARE v_def text := pg_get_functiondef('fin.fn_contabilizar_gasto(bigint)'::regprocedure);
        v_ancla text := 'l := l || fin.fn_linea(g.cuenta_id, v_adj, 0, g.descripcion, g.camion_id);';
BEGIN
    IF position('fn_rodado_interes_gasto' IN v_def) > 0 THEN RETURN; END IF;
    IF (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 THEN
        RAISE EXCEPTION 'fin.fn_contabilizar_gasto no es la que esperaba esta migración (ancla del renglón de la cuenta)';
    END IF;
    EXECUTE replace(v_def, v_ancla,
        'l := l || fin.fn_linea(g.cuenta_id, v_adj - fin.fn_rodado_interes_gasto(g.id), 0, g.descripcion, g.camion_id)'
        || ' || fin.fn_linea(coalesce(fin.fn_rodado_cuenta_o_null(''intereses''), g.cuenta_id), fin.fn_rodado_interes_gasto(g.id), 0, ''Intereses del documento'', g.camion_id);');
END $do$;

-- «Rehacer la contabilidad» también rehace compras y depreciaciones
DO $do$
DECLARE v_def text := pg_get_functiondef('fin.fn_recontabilizar_todo()'::regprocedure);
        v_a1 text := 'UNION ALL SELECT ''insumo'', id FROM mae.movimiento_insumo LOOP';
        v_a2 text := 'ELSIF r.o = ''insumo'' THEN PERFORM fin.fn_contabilizar_insumo(r.id);';
BEGIN
    IF position('fn_contabilizar_rodado' IN v_def) > 0 THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 THEN RAISE EXCEPTION 'fin.fn_recontabilizar_todo no es la que esperaba esta migración'; END IF;
    v_def := replace(v_def, v_a1, 'UNION ALL SELECT ''insumo'', id FROM mae.movimiento_insumo
             UNION ALL SELECT ''rodado'', id FROM fin.compra_rodado
             UNION ALL SELECT ''depreciacion'', id FROM fin.rodado_depreciacion LOOP');
    v_def := replace(v_def, v_a2, v_a2 || '
            ELSIF r.o = ''rodado'' THEN PERFORM fin.fn_contabilizar_rodado(r.id);
            ELSIF r.o = ''depreciacion'' THEN PERFORM fin.fn_contabilizar_depreciacion(r.id);');
    EXECUTE v_def;
END $do$;

-- Los documentos de una compra no se editan desde Gastos fijos (se anula la compra y se carga de nuevo)
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_de_compra()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    IF OLD.compra_rodado_id IS NOT NULL AND coalesce(current_setting('fin.rodado_fn', true), '') <> '1'
       AND (NEW.monto, NEW.cuotas, NEW.cuotas_previas, NEW.desde, NEW.cuenta_id, NEW.moneda, NEW.activo, NEW.tipo_documento, NEW.compra_rodado_id)
           IS DISTINCT FROM (OLD.monto, OLD.cuotas, OLD.cuotas_previas, OLD.desde, OLD.cuenta_id, OLD.moneda, OLD.activo, OLD.tipo_documento, OLD.compra_rodado_id) THEN
        RAISE EXCEPTION 'Estos son los documentos de una compra de vehículo: para cambiarlos, anulá la compra y cargala de nuevo' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS tg_15_de_compra ON fin.gasto_fijo;
CREATE TRIGGER tg_15_de_compra BEFORE UPDATE ON fin.gasto_fijo FOR EACH ROW EXECUTE FUNCTION fin.fn_gasto_fijo_de_compra();

-- ───────────── Registrar y anular ─────────────
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
BEGIN
    v_usr := fin.fn_exigir_finanzas();
    IF (v_camion IS NULL) = (v_semi IS NULL) THEN RAISE EXCEPTION 'Elegí la unidad comprada (un tractor o un semirremolque)' USING ERRCODE = '22023'; END IF;
    v_pat := coalesce((SELECT patente FROM mae.camion WHERE id = v_camion AND eliminado_en IS NULL), (SELECT patente FROM mae.semirremolque WHERE id = v_semi AND eliminado_en IS NULL));
    IF v_pat IS NULL THEN RAISE EXCEPTION 'La unidad no existe' USING ERRCODE = 'P0002'; END IF;
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
                                   documentos_previos, vida_util_meses, valor_residual, alta_mes, observacion, creado_por)
    VALUES (v_camion, v_semi, v_fecha, v_prov, v_valor, v_iva, v_pie, v_pie_antes OR v_pie = 0, v_docs, v_monto, v_primer, v_previos, v_vida, v_res,
            least(date_trunc('month', mae.fn_hoy()), date_trunc('month', fin.fn_contabilidad_desde()))::date, nullif(btrim(p_datos ->> 'observacion'), ''), v_usr)
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

CREATE OR REPLACE FUNCTION fin.fn_anular_compra_rodado(p_id bigint, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_usr bigint; c fin.compra_rodado%ROWTYPE; r record;
BEGIN
    v_usr := fin.fn_exigir_finanzas();
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    SELECT * INTO c FROM fin.compra_rodado WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF c.estado = 'anulada' THEN RAISE EXCEPTION 'La compra ya está anulada' USING ERRCODE = '55000'; END IF;
    IF EXISTS (SELECT 1 FROM fin.gasto g WHERE (g.compra_rodado_id = c.id OR g.gasto_fijo_id = c.gasto_fijo_id) AND g.eliminado_en IS NULL AND fin.fn_pagado_gasto(g.id) > 0) THEN
        RAISE EXCEPTION 'La compra tiene pagos registrados: anulá primero los pagos' USING ERRCODE = '55000';
    END IF;
    UPDATE fin.compra_rodado SET estado = 'anulada', motivo = btrim(p_motivo), anulado_en = now(), anulado_por = v_usr WHERE id = c.id;
    PERFORM set_config('fin.cont_fn', '1', true);
    PERFORM set_config('fin.rodado_fn', '1', true);
    UPDATE fin.gasto g SET estado = 'anulado', motivo = 'Se anuló la compra del vehículo: ' || btrim(p_motivo)
     WHERE (g.compra_rodado_id = c.id OR g.gasto_fijo_id = c.gasto_fijo_id) AND g.estado <> 'anulado' AND g.eliminado_en IS NULL;
    UPDATE fin.gasto_fijo SET activo = false WHERE id = c.gasto_fijo_id;
    PERFORM set_config('fin.rodado_fn', '', true);
    PERFORM fin.fn_contabilizar_rodado(c.id);
    FOR r IN SELECT id FROM fin.rodado_depreciacion WHERE compra_id = c.id LOOP PERFORM fin.fn_contabilizar_depreciacion(r.id); END LOOP;
END $function$;

-- ───────────── Lectura para la pantalla ─────────────
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
                SELECT c.id, CASE WHEN c.camion_id IS NOT NULL THEN 'tractor' ELSE 'semi' END AS tipo, coalesce(t.patente, s.patente) AS patente,
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

-- El costo fijo por unidad: los documentos de una compra no son costo; el costo es la depreciación más el interés del mes
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
         WHERE c.estado = 'vigente'
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

-- ───────────── Permisos y tarea diaria ─────────────
REVOKE ALL ON FUNCTION fin.fn_registrar_compra_rodado(jsonb), fin.fn_anular_compra_rodado(bigint, text), fin.fn_compras_rodados(), fin.fn_rodado_depreciar(bigint) FROM PUBLIC;
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'fin.fn_guardar_gasto_fijo(bigint, jsonb)', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_registrar_compra_rodado(jsonb), fin.fn_anular_compra_rodado(bigint, text) TO %I', r.rolname);
    END LOOP;
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'fin.fn_gastos_fijos()', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_compras_rodados() TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_admin', 'fin.fn_registrar_compra_rodado(jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('tc_admin', 'fin.fn_compras_rodados()', 'EXECUTE') THEN RAISE EXCEPTION 'Faltó el permiso de la web'; END IF;
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') AND to_regproc('cron.schedule') IS NOT NULL THEN
        PERFORM cron.schedule('rodados_depreciacion', '15 6 1 * *', 'SELECT fin.fn_rodado_depreciar()');
    END IF;
END $do$;

COMMIT;
