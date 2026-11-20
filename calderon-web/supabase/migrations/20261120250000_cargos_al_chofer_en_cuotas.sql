-- =====================================================================================
-- Migración 289 · Gastos que paga la empresa y se le cobran al chofer en cuotas (por ejemplo, la visa)
-- =====================================================================================
-- Pedido (20/11/2026): la empresa paga la visa de trabajo de los choferes argentinos para trabajar en Chile; ese gasto
-- se le atribuye al chofer y él lo devuelve en cuotas.
--
--   · fin.cargo_chofer (CC-000001): chofer, concepto, fecha, moneda, total, cuántas cuotas y desde qué mes.
--     Puede apuntar al gasto de Finanzas con que se pagó (número GA-…).
--   · La liquidación del chofer descuenta sola la cuota del mes (renglón «CARGO»: «Visa de trabajo (cuota 2 de 6)»).
--   · Contabilidad: al cargarlo, lo pagado deja de ser gasto y pasa a «Cargos a cobrar al personal» (activo nueva);
--     cada cuota descontada en la liquidación baja esa cuenta (antes un descuento «otro» bajaba Remuneraciones).
--     Si se condona lo que falta, eso vuelve a ser gasto.
--   · fin.fn_registrar_cargo_chofer, fin.fn_terminar_cargo_chofer (anular si no se descontó nada; si no, condonar
--     lo que falta), fin.fn_cargos_chofer (lista con cuotas descontadas y saldo). Los usan RRHH, Finanzas, Gerencia y TI.
--   · Se cambian dos funciones por reemplazo con control sobre la definición viva: fin.fn_preparar_liquidacion
--     (agrega las cuotas) y fin.fn_contabilizar_liquidacion (las cuotas van a la cuenta nueva).
-- No cambia datos existentes. web.version_base = 289.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 288 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 288 (cuenta del chofer en el perfil). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

-- ------------------------------------------------------------------ 1 · cuenta contable y origen de asiento
DO $c$
DECLARE v_padre smallint; v_cod text; v_def text;
BEGIN
    PERFORM set_config('fin.cont_fn', '1', true);
    IF NOT EXISTS (SELECT 1 FROM fin.cuenta_contable WHERE uso = 'CARGOS_PERSONAL' AND eliminado_en IS NULL) THEN
        SELECT id INTO v_padre FROM fin.cuenta_contable WHERE codigo = '1.1' AND eliminado_en IS NULL;
        IF v_padre IS NULL THEN RAISE EXCEPTION 'No encontré la cuenta 1.1 (activo corriente): avisar antes de seguir'; END IF;
        SELECT '1.1.' || lpad((coalesce(max(split_part(codigo, '.', 3)::int), 0) + 1)::text, 2, '0') INTO v_cod
          FROM fin.cuenta_contable WHERE codigo ~ '^1\.1\.[0-9]+$';
        INSERT INTO fin.cuenta_contable (codigo, nombre, tipo, padre_id, imputable, uso)
        VALUES (v_cod, 'Cargos a cobrar al personal (visas y otros, en cuotas)', 'activo', v_padre, true, 'CARGOS_PERSONAL');
    END IF;
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conrelid = 'fin.asiento'::regclass AND conname = 'ck_as_origen';
    IF v_def IS NULL OR v_def NOT LIKE '%''movimiento''::text%' THEN RAISE EXCEPTION 'No encontré la lista de orígenes de asiento que se espera: avisar antes de seguir'; END IF;
    IF v_def NOT LIKE '%''cargo_chofer''%' THEN
        ALTER TABLE fin.asiento DROP CONSTRAINT ck_as_origen;
        EXECUTE 'ALTER TABLE fin.asiento ADD CONSTRAINT ck_as_origen ' || replace(v_def, '''movimiento''::text', '''movimiento''::text, ''cargo_chofer''::text');
    END IF;
END $c$;

-- ------------------------------------------------------------------ 2 · el cargo
CREATE SEQUENCE IF NOT EXISTS fin.seq_cargo_chofer;
CREATE TABLE IF NOT EXISTS fin.cargo_chofer (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero      text NOT NULL DEFAULT 'CC-' || lpad(nextval('fin.seq_cargo_chofer')::text, 6, '0') UNIQUE,
    chofer_id   bigint NOT NULL REFERENCES mae.chofer (id),
    concepto    text NOT NULL CHECK (length(btrim(concepto)) BETWEEN 3 AND 120),
    fecha       date NOT NULL,
    moneda      char(3) NOT NULL,
    total       numeric(14,2) NOT NULL CHECK (total > 0),
    cuotas      smallint NOT NULL CHECK (cuotas BETWEEN 1 AND 36),
    desde       date NOT NULL CHECK (desde = date_trunc('month', desde)::date),
    gasto_id    bigint REFERENCES fin.gasto (id),
    cuenta_id   smallint NOT NULL REFERENCES fin.cuenta_contable (id),
    observacion text CHECK (observacion IS NULL OR length(observacion) <= 500),
    estado      text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulado', 'condonado')),
    motivo      text,
    terminado_en timestamptz,
    terminado_por bigint REFERENCES seg.usuario (id),
    creado_en   timestamptz NOT NULL DEFAULT now(),
    creado_por  bigint REFERENCES seg.usuario (id)
);
COMMENT ON TABLE fin.cargo_chofer IS 'Migración 289: gastos que paga la empresa y se le cobran al chofer en cuotas (visa de trabajo y otros). Solo por funciones.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE fin.cargo_chofer FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'fin.cargo_chofer'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE fin.cargo_chofer FROM %I', r.rolname);
    END LOOP;
END $r$;

-- La cuota de un mes, en la moneda del cargo (NULL si ese mes no hay cuota). La última absorbe el redondeo.
CREATE OR REPLACE FUNCTION fin.fn_cuota_cargo(p_cargo bigint, p_periodo date)
RETURNS TABLE (numero smallint, importe numeric)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT (k + 1)::smallint,
           CASE WHEN k + 1 = c.cuotas THEN c.total - round(c.total / c.cuotas, 2) * (c.cuotas - 1) ELSE round(c.total / c.cuotas, 2) END
      FROM fin.cargo_chofer c
      CROSS JOIN LATERAL (SELECT ((extract(year FROM age(date_trunc('month', p_periodo), c.desde)) * 12
                                  + extract(month FROM age(date_trunc('month', p_periodo), c.desde))))::int AS k) x
     WHERE c.id = p_cargo AND c.estado = 'vigente' AND x.k >= 0 AND x.k < c.cuotas
$f$;

-- Lo ya descontado en liquidaciones que no se anularon (en la moneda del cargo)
CREATE OR REPLACE FUNCTION fin.fn_cargo_descontado(p_cargo bigint)
RETURNS TABLE (cuotas integer, importe numeric)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT count(*)::int, coalesce(sum((g.referencia ->> 'importe')::numeric), 0)
      FROM fin.liquidacion_renglon g JOIN fin.liquidacion_mensual l ON l.id = g.liquidacion_id
     WHERE g.codigo = 'CARGO' AND g.eliminado_en IS NULL AND (g.referencia ->> 'cargo_id')::bigint = p_cargo
       AND l.estado <> 'anulada' AND l.eliminado_en IS NULL
$f$;

-- El asiento del cargo: lo pagado pasa de gasto a «Cargos a cobrar al personal»; lo condonado vuelve a gasto
CREATE OR REPLACE FUNCTION fin.fn_contabilizar_cargo_chofer(p_cargo bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE c fin.cargo_chofer%ROWTYPE; v_tc numeric; v_total numeric; v_cond numeric := 0; v_nom text; ln jsonb;
BEGIN
    SELECT * INTO c FROM fin.cargo_chofer WHERE id = p_cargo;
    IF NOT FOUND OR c.estado = 'anulado' OR c.fecha < fin.fn_contabilidad_desde() THEN
        PERFORM fin.fn_grabar_asiento('cargo_chofer', p_cargo, current_date, '', '[]');
        RETURN;
    END IF;
    v_tc := fin.fn_tc_clp(c.moneda, c.fecha);
    IF v_tc IS NULL THEN RAISE EXCEPTION 'Falta la cotización de % del %: cargala en Tipos de cambio', c.moneda, to_char(c.fecha, 'DD/MM/YYYY') USING ERRCODE = '55000'; END IF;
    v_total := round(c.total * v_tc);
    IF c.estado = 'condonado' THEN v_cond := round(greatest(c.total - (SELECT d.importe FROM fin.fn_cargo_descontado(p_cargo) d), 0) * v_tc); END IF;
    v_nom := ops.fn_nombre_chofer(c.chofer_id);
    ln := jsonb_build_array(
        fin.fn_linea(fin.fn_cuenta_uso('CARGOS_PERSONAL'), v_total, 0, c.concepto, NULL, 'chofer', c.chofer_id),
        fin.fn_linea(c.cuenta_id, 0, v_total, c.concepto || ' · se le cobra al chofer'));
    IF v_cond > 0 THEN
        ln := ln || jsonb_build_array(
            fin.fn_linea(c.cuenta_id, v_cond, 0, c.concepto || ' · lo que no se cobró (condonado)'),
            fin.fn_linea(fin.fn_cuenta_uso('CARGOS_PERSONAL'), 0, v_cond, c.concepto || ' · condonado', NULL, 'chofer', c.chofer_id));
    END IF;
    PERFORM fin.fn_grabar_asiento('cargo_chofer', p_cargo, c.fecha, c.numero || ' · ' || c.concepto || ' · ' || v_nom || ' (en ' || c.cuotas || ' cuotas)', ln);
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_registrar_cargo_chofer(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_usr bigint := fin.fn_exigir_rol_liq(ARRAY['rrhh', 'finanzas', 'gerencia', 'ti'], 'Los cargos al chofer los cargan RRHH, Finanzas, Gerencia o TI');
    v_chofer bigint := nullif(p_datos ->> 'chofer_id', '')::bigint;
    v_concepto text := btrim(coalesce(p_datos ->> 'concepto', ''));
    v_fecha date := coalesce(nullif(p_datos ->> 'fecha', '')::date, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date);
    v_moneda text := upper(btrim(coalesce(p_datos ->> 'moneda', '')));
    v_total numeric := nullif(p_datos ->> 'total', '')::numeric;
    v_cuotas int := nullif(p_datos ->> 'cuotas', '')::int;
    v_desde date := date_trunc('month', coalesce(nullif(p_datos ->> 'desde', '')::date, (now() AT TIME ZONE 'America/Argentina/Mendoza')::date))::date;
    v_gasto_num text := nullif(upper(btrim(coalesce(p_datos ->> 'gasto', ''))), '');
    v_obs text := nullif(btrim(coalesce(p_datos ->> 'observacion', '')), '');
    g record; v_gasto bigint; v_cuenta smallint; c fin.cargo_chofer%ROWTYPE;
BEGIN
    IF v_chofer IS NULL OR NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = v_chofer AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí el chofer' USING ERRCODE = '23502';
    END IF;
    IF length(v_concepto) < 3 OR length(v_concepto) > 120 THEN RAISE EXCEPTION 'Escribí qué se le cobra (por ejemplo «Visa de trabajo»)' USING ERRCODE = '22023'; END IF;
    IF v_moneda NOT IN ('ARS', 'CLP', 'USD') THEN RAISE EXCEPTION 'Elegí la moneda' USING ERRCODE = '22023'; END IF;
    IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Escribí el total que se le cobra' USING ERRCODE = '22023'; END IF;
    IF v_cuotas IS NULL OR v_cuotas < 1 OR v_cuotas > 36 THEN RAISE EXCEPTION 'Las cuotas van de 1 a 36' USING ERRCODE = '22023'; END IF;
    IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN RAISE EXCEPTION 'La observación tiene más de 500 letras' USING ERRCODE = '22023'; END IF;
    -- No se puede empezar a descontar en un mes ya liquidado
    IF EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = v_chofer AND l.periodo = v_desde AND l.estado IN ('aprobada', 'pagada') AND l.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'La liquidación de % de ese chofer ya está aprobada: empezá las cuotas el mes siguiente', to_char(v_desde, 'MM/YYYY') USING ERRCODE = '55000';
    END IF;
    -- Dónde se registró lo pagado: el gasto de Finanzas, o «Permisos» si no se dice
    IF v_gasto_num IS NOT NULL THEN
        SELECT x.id, x.cuenta_id, x.estado INTO g FROM fin.gasto x WHERE upper(x.numero) = v_gasto_num AND x.eliminado_en IS NULL;
        IF g.id IS NULL THEN RAISE EXCEPTION 'No encontré el gasto % en Finanzas', v_gasto_num USING ERRCODE = 'P0002'; END IF;
        IF g.estado = 'anulado' THEN RAISE EXCEPTION 'El gasto % está anulado', v_gasto_num USING ERRCODE = '55000'; END IF;
        IF EXISTS (SELECT 1 FROM fin.cargo_chofer WHERE gasto_id = g.id AND estado <> 'anulado') THEN
            RAISE EXCEPTION 'El gasto % ya está cargado a un chofer', v_gasto_num USING ERRCODE = '23505';
        END IF;
        v_cuenta := g.cuenta_id; v_gasto := g.id;
    END IF;
    v_cuenta := coalesce(v_cuenta, fin.fn_cuenta_uso('PERMISOS'));
    INSERT INTO fin.cargo_chofer (chofer_id, concepto, fecha, moneda, total, cuotas, desde, gasto_id, cuenta_id, observacion, creado_por)
    VALUES (v_chofer, v_concepto, v_fecha, v_moneda, round(v_total, 2), v_cuotas, v_desde, v_gasto, v_cuenta, v_obs, v_usr)
    RETURNING * INTO c;
    PERFORM set_config('fin.cont_fn', '1', true);
    PERFORM fin.fn_contabilizar_cargo_chofer(c.id);
    RETURN jsonb_build_object('id', c.id, 'numero', c.numero);
END $f$;

-- Anular (si no se descontó ninguna cuota) o condonar lo que falta
CREATE OR REPLACE FUNCTION fin.fn_terminar_cargo_chofer(p_id bigint, p_motivo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_rol_liq(ARRAY['rrhh', 'finanzas', 'gerencia', 'ti'], 'Los cargos al chofer los manejan RRHH, Finanzas, Gerencia o TI');
        c fin.cargo_chofer%ROWTYPE; v_n int; v_estado text;
BEGIN
    IF length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Escribí el motivo' USING ERRCODE = '22023'; END IF;
    SELECT * INTO c FROM fin.cargo_chofer WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El cargo no existe' USING ERRCODE = 'P0002'; END IF;
    IF c.estado <> 'vigente' THEN RAISE EXCEPTION 'El cargo % ya está %', c.numero, c.estado USING ERRCODE = '55000'; END IF;
    SELECT d.cuotas INTO v_n FROM fin.fn_cargo_descontado(p_id) d;
    v_estado := CASE WHEN v_n = 0 THEN 'anulado' ELSE 'condonado' END;
    UPDATE fin.cargo_chofer SET estado = v_estado, motivo = btrim(p_motivo), terminado_en = now(), terminado_por = v_usr WHERE id = p_id;
    PERFORM set_config('fin.cont_fn', '1', true);
    PERFORM fin.fn_contabilizar_cargo_chofer(p_id);
    RETURN v_estado;
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_cargos_chofer(p_chofer bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_hoy date := date_trunc('month', (now() AT TIME ZONE 'America/Argentina/Mendoza')::date)::date;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh', 'finanzas', 'gerencia', 'ti', 'auditor'], 'Los cargos al chofer los ven RRHH, Finanzas, Gerencia, TI y el auditor');
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', c.id, 'numero', c.numero, 'concepto', c.concepto, 'fecha', c.fecha, 'moneda', c.moneda, 'total', c.total,
                   'cuotas', c.cuotas, 'desde', c.desde, 'gasto', (SELECT g.numero FROM fin.gasto g WHERE g.id = c.gasto_id),
                   'estado', c.estado, 'motivo', c.motivo, 'observacion', c.observacion,
                   'cuotas_descontadas', d.cuotas, 'descontado', d.importe, 'saldo', CASE WHEN c.estado = 'vigente' THEN c.total - d.importe ELSE 0 END,
                   'cuota_de_este_mes', (SELECT jsonb_build_object('numero', q.numero, 'importe', q.importe) FROM fin.fn_cuota_cargo(c.id, v_hoy) q))
               ORDER BY c.estado <> 'vigente', c.fecha DESC, c.id DESC)
          FROM fin.cargo_chofer c CROSS JOIN LATERAL fin.fn_cargo_descontado(c.id) d
         WHERE c.chofer_id = p_chofer), '[]');
END $f$;

-- ------------------------------------------------------------------ 3 · la liquidación descuenta la cuota y la contabiliza en la cuenta nueva
DO $p$
DECLARE
    v_def text;
    a1 CONSTANT text := '    -- Conceptos automáticos: primero los fijos, después los porcentajes (sobre lo ya calculado)';
    n1 CONSTANT text := $t$    -- Migración 289: cuotas de gastos que pagó la empresa y se le cobran al chofer (visa y otros)
    FOR v IN SELECT cg.id, cg.numero, cg.concepto, cg.cuotas, cg.moneda, q.numero AS nro, q.importe,
                    CASE WHEN cg.moneda = l.moneda THEN q.importe ELSE ops.fn_a_moneda_base(q.importe, cg.moneda, r.hasta) END AS base
               FROM fin.cargo_chofer cg CROSS JOIN LATERAL fin.fn_cuota_cargo(cg.id, v_per) q
              WHERE cg.chofer_id = p_chofer AND cg.estado = 'vigente' ORDER BY cg.fecha, cg.id LOOP
        IF v.base IS NULL THEN
            v_avisos := v_avisos || to_jsonb(format('Cuota de %s en %s sin cotización: no se descontó (cargala en Tipos de cambio)', v.concepto, v.moneda));
        ELSE
            PERFORM fin.fn_liq_renglon(l.id, 'sistema', 'CARGO', format('%s (cuota %s de %s)', v.concepto, v.nro, v.cuotas),
                'descuento', 1, NULL, v.base, jsonb_build_object('cargo_id', v.id, 'cargo', v.numero, 'cuota', v.nro, 'importe', v.importe, 'moneda', v.moneda), 64);
        END IF;
    END LOOP;

$t$;
    b1 CONSTANT text := 'v_comb numeric; v_otros numeric;';
    m1 CONSTANT text := 'v_comb numeric; v_otros numeric; v_cargo numeric;';
    b2 CONSTANT text := $t$coalesce(sum(importe) FILTER (WHERE coalesce(codigo, '') NOT IN ('FONDO','COMBUSTIBLE','RALENTI')), 0)$t$;
    m2 CONSTANT text := $t$coalesce(sum(importe) FILTER (WHERE coalesce(codigo, '') NOT IN ('FONDO','COMBUSTIBLE','RALENTI','CARGO')), 0)$t$;
    b3 CONSTANT text := $t$        fin.fn_linea(fin.fn_cuenta_uso('REM_CHOFERES'), 0, round(v_otros * v_tc), 'Otros descuentos', NULL, 'chofer', l.chofer_id),$t$;
    m3 CONSTANT text := $t$        fin.fn_linea(fin.fn_cuenta_uso('REM_CHOFERES'), 0, round(v_otros * v_tc), 'Otros descuentos', NULL, 'chofer', l.chofer_id),
        -- Migración 289: las cuotas de cargos (visa y otros) bajan lo que el chofer le debe a la empresa
        fin.fn_linea(fin.fn_cuenta_uso('CARGOS_PERSONAL'), 0, round((SELECT coalesce(sum(g.importe), 0) FROM fin.liquidacion_renglon g
                     WHERE g.liquidacion_id = p_liq AND g.codigo = 'CARGO' AND g.tipo = 'descuento' AND g.eliminado_en IS NULL) * v_tc),
                     'Cuotas de cargos al chofer', NULL, 'chofer', l.chofer_id),$t$;
BEGIN
    v_def := pg_get_functiondef('fin.fn_preparar_liquidacion(bigint,date)'::regprocedure);
    IF v_def NOT LIKE '%Migración 289%' THEN
        IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
            RAISE EXCEPTION 'fin.fn_preparar_liquidacion no es la que esperaba esta migración: avisar antes de seguir';
        END IF;
        EXECUTE replace(v_def, a1, n1 || a1);
    END IF;
    v_def := pg_get_functiondef('fin.fn_contabilizar_liquidacion(bigint)'::regprocedure);
    IF v_def NOT LIKE '%Migración 289%' THEN
        IF position(b1 IN v_def) = 0 OR position(b2 IN v_def) = 0 OR position(b3 IN v_def) = 0 THEN
            RAISE EXCEPTION 'fin.fn_contabilizar_liquidacion no es la que esperaba esta migración: avisar antes de seguir';
        END IF;
        EXECUTE replace(replace(replace(v_def, b1, m1), b2, m2), b3, m3);
    END IF;
END $p$;

-- ------------------------------------------------------------------ 4 · permisos
DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_registrar_cargo_chofer(jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_terminar_cargo_chofer(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_cargos_chofer(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_contabilizar_cargo_chofer(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_cuota_cargo(bigint, date) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_cargo_descontado(bigint) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_preparar_liquidacion(bigint,date)', 'EXECUTE')
           OR has_function_privilege(r.rolname, 'fin.fn_fondo_chofer(bigint,date,date)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_registrar_cargo_chofer(jsonb) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_terminar_cargo_chofer(bigint, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_cargos_chofer(bigint) TO %I', r.rolname);
        END IF;
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '289' WHERE codigo = 'web.version_base' AND valor::text::int < 289;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 289 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT codigo || ' ' || nombre FROM fin.cuenta_contable WHERE uso = 'CARGOS_PERSONAL') AS cuenta_nueva;
