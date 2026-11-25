-- Liquidación del chofer en 3 pasos
--   1. Novedades: básico + bono por viaje (imponibles) + viáticos + adicional por km + bono por desempeño (no imponibles).
--      Se descargan para Colaboradores.
--   2. Bono de sueldo de Colaboradores: RRHH carga los totales (gratificación, AFP, salud, cesantía, impuesto, líquido,
--      aportes de la empresa) y adjunta el PDF. Reemplaza el cálculo legal del sistema.
--   3. Descuentos internos (ralentí, combustible, fondo fijo, actas, cuotas…) → monto a transferir.
--      Aprobada = «Por transferir»; Gerencia/Finanzas registra la transferencia.
-- Viáticos: 10.000 por día trabajado. Día trabajado = día dentro de un viaje del chofer, día con un movimiento
-- asignado por Operaciones o día en que manejó (GPS). Operaciones o RRHH corrigen día por día.
-- Va después de la 20261125100000 (preparar de a una). No cambia web.version_base.

-- ─── Parámetros ─────────────────────────────────────────────────────────────
INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('fin.viatico_por_dia', '10000'::jsonb, 'Liquidación en 3 pasos: viático por día trabajado del chofer (moneda base). 0 = no se pagan viáticos.'),
    ('fin.viatico_km_minimo', '5'::jsonb, 'Liquidación en 3 pasos: km de GPS en el día para contarlo como trabajado.'),
    ('fin.bono_desempeno_importe', '200000'::jsonb, 'Bono mensual por desempeño del chofer (moneda base, no imponible).'),
    ('fin.bono_desempeno_desde', '"2026-12-01"'::jsonb, 'Primer período de liquidación con bono por desempeño.'),
    ('fin.bono_desempeno_consumo_max', '34'::jsonb, 'Bono por desempeño: consumo máximo del período en L/100 km (cierres aprobados).'),
    ('fin.liq_bono_colaboradores', 'true'::jsonb, 'El paso 2 de la liquidación es el bono de sueldo de Colaboradores (se carga a mano con el PDF). false = cálculo legal del sistema.')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- El adicional por km es no imponible
UPDATE ref.parametro SET valor = '"no_remunerativo"'::jsonb WHERE codigo = 'fin.liq_km_tipo' AND valor #>> '{}' <> 'no_remunerativo';

-- ─── Tablas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin.dia_trabajado_ajuste (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chofer_id   bigint NOT NULL REFERENCES mae.chofer (id),
    fecha       date NOT NULL,
    trabajado   boolean NOT NULL,
    motivo      text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 300),
    creado_en   timestamptz NOT NULL DEFAULT now(),
    creado_por  bigint REFERENCES seg.usuario (id),
    UNIQUE (chofer_id, fecha)
);
COMMENT ON TABLE fin.dia_trabajado_ajuste IS 'Liquidación en 3 pasos: corrección a mano de un día trabajado / de descanso del chofer (viáticos). Solo por funciones.';

CREATE TABLE IF NOT EXISTS fin.liquidacion_bono (
    liquidacion_id bigint PRIMARY KEY REFERENCES fin.liquidacion_mensual (id),
    cuidado_unidad boolean,
    limpieza       boolean,
    otorgar        boolean NOT NULL DEFAULT false,
    motivo         text CHECK (motivo IS NULL OR length(motivo) <= 300),
    guardado_en    timestamptz NOT NULL DEFAULT now(),
    guardado_por   bigint REFERENCES seg.usuario (id)
);
COMMENT ON TABLE fin.liquidacion_bono IS 'Liquidación en 3 pasos: lo que RRHH confirma del bono por desempeño (el sistema propone consumo y faltantes). Solo por funciones.';

DO $r$
DECLARE r record; t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['fin.dia_trabajado_ajuste', 'fin.liquidacion_bono'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
        FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                    AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = t::regclass) LOOP
            EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', t, r.rolname);
        END LOOP;
    END LOOP;
END $r$;

-- Bono de sueldo de Colaboradores (paso 2), en la ficha legal de la liquidación
ALTER TABLE fin.liquidacion_legal
    ADD COLUMN IF NOT EXISTS col_imponible       numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_no_imponible    numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_gratificacion   numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_afp             numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_salud           numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_cesantia        numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_impuesto        numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_otros_descuentos numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_liquido         numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_aporte_empleador numeric(14,0),
    ADD COLUMN IF NOT EXISTS col_pdf_ruta        text,
    ADD COLUMN IF NOT EXISTS col_cargado_en      timestamptz;

-- ─── Días trabajados ────────────────────────────────────────────────────────
-- Cada día del rango: si el sistema lo ve trabajado (viaje, movimiento asignado o GPS), el ajuste a mano y el resultado.
CREATE OR REPLACE FUNCTION fin.fn_dias_chofer(p_chofer bigint, p_desde date, p_hasta date)
RETURNS TABLE (fecha date, trabajado boolean, propuesto boolean, fuente text, detalle text, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH d AS (SELECT g::date AS fecha FROM generate_series(p_desde, p_hasta, interval '1 day') g),
    via AS (
        SELECT g::date AS fecha, string_agg(DISTINCT v.numero, ', ') AS numeros
          FROM ops.viaje_chofer v
         CROSS JOIN LATERAL generate_series((v.salida_ts AT TIME ZONE 'America/Argentina/Mendoza')::date,
                                            (coalesce(v.llegada_ts, now()) AT TIME ZONE 'America/Argentina/Mendoza')::date, interval '1 day') g
         WHERE v.chofer_id = p_chofer AND v.estado <> 'anulado' AND v.eliminado_en IS NULL
           AND v.salida_ts < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND coalesce(v.llegada_ts, now()) >= p_desde::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
         GROUP BY 1),
    ope AS (
        SELECT g::date AS fecha, count(DISTINCT t.tramo_id) AS tramos
          FROM ops.tramo_chofer t
         CROSS JOIN LATERAL generate_series((t.desde_ts AT TIME ZONE 'America/Argentina/Mendoza')::date,
                                            (coalesce(t.hasta_ts, t.desde_ts) AT TIME ZONE 'America/Argentina/Mendoza')::date, interval '1 day') g
         WHERE t.chofer_id = p_chofer AND t.eliminado_en IS NULL AND t.desde_ts IS NOT NULL
           AND t.desde_ts < (p_hasta + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
           AND coalesce(t.hasta_ts, t.desde_ts) >= p_desde::timestamp AT TIME ZONE 'America/Argentina/Mendoza'
         GROUP BY 1),
    gps AS (
        SELECT c.fecha, sum(c.km) AS km FROM tel.conduccion_diaria c
         WHERE c.chofer_id = p_chofer AND c.fecha BETWEEN p_desde AND p_hasta
         GROUP BY 1 HAVING sum(c.km) >= ref.fn_parametro_num('fin.viatico_km_minimo', 5))
    SELECT d.fecha,
           coalesce(a.trabajado, via.fecha IS NOT NULL OR ope.fecha IS NOT NULL OR gps.fecha IS NOT NULL),
           via.fecha IS NOT NULL OR ope.fecha IS NOT NULL OR gps.fecha IS NOT NULL,
           CASE WHEN via.fecha IS NOT NULL THEN 'viaje' WHEN ope.fecha IS NOT NULL THEN 'operacion' WHEN gps.fecha IS NOT NULL THEN 'gps' END,
           concat_ws(' · ', CASE WHEN via.fecha IS NOT NULL THEN 'Viaje ' || via.numeros END,
                     CASE WHEN ope.fecha IS NOT NULL THEN ope.tramos || ' movimiento(s) asignado(s)' END,
                     CASE WHEN gps.fecha IS NOT NULL THEN 'Manejó ' || round(gps.km) || ' km' END),
           a.motivo
      FROM d
      LEFT JOIN via ON via.fecha = d.fecha
      LEFT JOIN ope ON ope.fecha = d.fecha
      LEFT JOIN gps ON gps.fecha = d.fecha
      LEFT JOIN fin.dia_trabajado_ajuste a ON a.chofer_id = p_chofer AND a.fecha = d.fecha
     ORDER BY d.fecha
$f$;

-- Para la pantalla (RRHH, Operaciones, TI, Gerencia, Finanzas). Sin p_hasta, p_desde es el período (mes) de liquidación.
CREATE OR REPLACE FUNCTION fin.fn_dias_trabajados(p_chofer bigint, p_desde date, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE r record;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti','operaciones','gerencia','finanzas'], 'Los días trabajados los ven RRHH, Operaciones, Gerencia, Finanzas o TI');
    IF p_hasta IS NULL AND p_desde IS NOT NULL THEN
        SELECT * INTO r FROM fin.fn_rango_periodo(date_trunc('month', p_desde)::date);
        RETURN fin.fn_dias_trabajados(p_chofer, r.desde, r.hasta) || jsonb_build_object('periodo', date_trunc('month', p_desde)::date);
    END IF;
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde OR p_hasta - p_desde > 62 THEN
        RAISE EXCEPTION 'Rango de fechas inválido' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
        'desde', p_desde, 'hasta', p_hasta,
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                             'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                            FROM fin.fn_dias_chofer(p_chofer, p_desde, p_hasta) x), '[]'::jsonb),
        'bloqueado', EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = p_chofer AND l.estado IN ('aprobada','pagada')
                               AND l.eliminado_en IS NULL AND l.desde <= p_hasta AND l.hasta >= p_desde));
END $f$;

-- Renglón de viáticos de una liquidación (se rehace)
CREATE OR REPLACE FUNCTION fin.fn_liq_viatico(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; v_dia numeric := ref.fn_parametro_num('fin.viatico_por_dia', 10000); v_n integer; v_fechas jsonb;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo = 'VIATICO' AND eliminado_en IS NULL;
    SELECT count(*), coalesce(jsonb_agg(x.fecha ORDER BY x.fecha), '[]') INTO v_n, v_fechas
      FROM fin.fn_dias_chofer(l.chofer_id, l.desde, l.hasta) x WHERE x.trabajado;
    IF coalesce(v_dia, 0) > 0 THEN
        PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'VIATICO', format('Viáticos (%s día%s × %s)', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END,
                                   translate(to_char(v_dia, 'FM999G999G999'), ',', '.')),
                                   'no_remunerativo', v_n, v_dia, v_n * v_dia, jsonb_build_object('dias', v_fechas), 35);
    END IF;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

-- Marcar un día como trabajado / de descanso (p_trabajado NULL = volver a lo que propone el sistema)
CREATE OR REPLACE FUNCTION fin.fn_guardar_dia_trabajado(p_chofer bigint, p_fecha date, p_trabajado boolean, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; v_liq bigint;
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti','operaciones'], 'Los días trabajados los corrigen RRHH, Operaciones o TI');
    IF NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = p_chofer AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El chofer no existe' USING ERRCODE = 'P0002';
    END IF;
    IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Argentina/Mendoza')::date THEN
        RAISE EXCEPTION 'Elegí un día que ya pasó' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = p_chofer AND l.estado IN ('aprobada','pagada')
                 AND l.eliminado_en IS NULL AND p_fecha BETWEEN l.desde AND l.hasta) THEN
        RAISE EXCEPTION 'La liquidación de ese día ya está aprobada: para cambiarlo, RRHH tiene que reabrirla' USING ERRCODE = '55000';
    END IF;
    IF p_trabajado IS NULL THEN
        DELETE FROM fin.dia_trabajado_ajuste WHERE chofer_id = p_chofer AND fecha = p_fecha;
    ELSE
        IF nullif(btrim(p_motivo), '') IS NULL OR length(btrim(p_motivo)) < 3 THEN
            RAISE EXCEPTION 'Escribí por qué (por ejemplo: movió semirremolques en la base, estuvo de descanso)' USING ERRCODE = '22023';
        END IF;
        INSERT INTO fin.dia_trabajado_ajuste (chofer_id, fecha, trabajado, motivo, creado_por)
        VALUES (p_chofer, p_fecha, p_trabajado, left(btrim(p_motivo), 300), v_usr)
        ON CONFLICT (chofer_id, fecha) DO UPDATE SET trabajado = EXCLUDED.trabajado, motivo = EXCLUDED.motivo,
                                                    creado_en = now(), creado_por = EXCLUDED.creado_por;
    END IF;
    -- Si hay un borrador de ese período, los viáticos se actualizan solos
    SELECT id INTO v_liq FROM fin.liquidacion_mensual
     WHERE chofer_id = p_chofer AND estado = 'borrador' AND eliminado_en IS NULL AND p_fecha BETWEEN desde AND hasta;
    IF v_liq IS NOT NULL THEN PERFORM fin.fn_liq_viatico(v_liq); END IF;
    RETURN jsonb_build_object('liquidacion_id', v_liq);
END $f$;

-- ─── Bono por desempeño ─────────────────────────────────────────────────────
-- Lo que propone el sistema con los cierres aprobados del período, más lo que confirmó RRHH
CREATE OR REPLACE FUNCTION fin.fn_bono_propuesta(p_liq bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; b fin.liquidacion_bono%ROWTYPE; c record; v_max numeric; v_cons numeric; v_aplica boolean;
        v_desde date := (ref.fn_parametro_texto('fin.bono_desempeno_desde', '2026-12-01'))::date;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_aplica := l.periodo >= v_desde AND ref.fn_parametro_num('fin.bono_desempeno_importe', 200000) > 0;
    IF NOT v_aplica THEN RETURN jsonb_build_object('aplica', false, 'desde', v_desde); END IF;
    v_max := ref.fn_parametro_num('fin.bono_desempeno_consumo_max', 34);
    SELECT coalesce(sum(coalesce(cv.km_manual, cv.km_recorridos)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS km,
           coalesce(sum(coalesce(cv.libro_l, cv.consumo_llenado_l)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS litros,
           coalesce(sum(coalesce(cv.faltante_salida_l, 0) + coalesce(cv.faltante_llegada_l, 0)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS faltante,
           count(*) FILTER (WHERE cv.estado = 'aprobado') AS aprobados,
           count(*) FILTER (WHERE cv.estado NOT IN ('aprobado','anulado')) AS pendientes
      INTO c
      FROM fue.cierre_viaje cv
     WHERE cv.chofer_responsable_id = l.chofer_id AND cv.eliminado_en IS NULL
       AND (cv.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN l.desde AND l.hasta;
    v_cons := CASE WHEN c.km >= 100 THEN round(100 * c.litros / c.km, 1) END;
    SELECT * INTO b FROM fin.liquidacion_bono WHERE liquidacion_id = p_liq;
    RETURN jsonb_build_object(
        'aplica', true,
        'importe', ref.fn_parametro_num('fin.bono_desempeno_importe', 200000),
        'consumo_max', v_max,
        'consumo', v_cons, 'km', round(c.km), 'cierres', c.aprobados, 'cierres_pendientes', c.pendientes,
        'cumple_consumo', CASE WHEN v_cons IS NULL THEN NULL ELSE v_cons <= v_max END,
        'faltante_l', round(c.faltante, 1),
        'sin_faltantes', CASE WHEN c.aprobados = 0 THEN NULL ELSE c.faltante <= 0 END,
        'cuidado_unidad', b.cuidado_unidad, 'limpieza', b.limpieza,
        'otorgar', coalesce(b.otorgar, false), 'motivo', b.motivo, 'confirmado', b.liquidacion_id IS NOT NULL);
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_liq_bono(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; p jsonb;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND OR l.estado <> 'borrador' THEN RETURN; END IF;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_renglon SET eliminado_en = now()
     WHERE liquidacion_id = p_liq AND origen = 'sistema' AND codigo = 'BONO_DESEMPENO' AND eliminado_en IS NULL;
    p := fin.fn_bono_propuesta(p_liq);
    IF (p ->> 'aplica')::boolean AND (p ->> 'otorgar')::boolean THEN
        PERFORM fin.fn_liq_renglon(p_liq, 'sistema', 'BONO_DESEMPENO', 'Bono por desempeño', 'no_remunerativo', 1,
                                   (p ->> 'importe')::numeric, (p ->> 'importe')::numeric, p, 36);
    END IF;
    PERFORM fin.fn_liq_totales(p_liq);
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_guardar_bono_desempeno(p_liq bigint, p_cuidado boolean, p_limpieza boolean, p_otorgar boolean, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint; l fin.liquidacion_mensual%ROWTYPE; p jsonb; v_falla text;
BEGIN
    v_usr := fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'El bono por desempeño lo confirman RRHH o TI');
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = 'P0002'; END IF;
    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se cambia en borrador (está %): reabrila', l.estado USING ERRCODE = '55000'; END IF;
    p := fin.fn_bono_propuesta(p_liq);
    IF NOT (p ->> 'aplica')::boolean THEN
        RAISE EXCEPTION 'El bono por desempeño se paga desde el período %', to_char((p ->> 'desde')::date, 'MM/YYYY') USING ERRCODE = '55000';
    END IF;
    IF p_otorgar THEN
        v_falla := concat_ws(', ',
            CASE WHEN (p ->> 'cumple_consumo') IS DISTINCT FROM 'true' THEN 'consumo' END,
            CASE WHEN (p ->> 'sin_faltantes') IS DISTINCT FROM 'true' THEN 'faltantes' END,
            CASE WHEN p_cuidado IS NOT TRUE THEN 'cuidado de la unidad' END,
            CASE WHEN p_limpieza IS NOT TRUE THEN 'limpieza' END);
        IF v_falla <> '' AND length(btrim(coalesce(p_motivo, ''))) < 3 THEN
            RAISE EXCEPTION 'No cumple o no está confirmado: %. Para darle el bono igual, escribí por qué', v_falla USING ERRCODE = '22023';
        END IF;
    END IF;
    INSERT INTO fin.liquidacion_bono (liquidacion_id, cuidado_unidad, limpieza, otorgar, motivo, guardado_por)
    VALUES (p_liq, p_cuidado, p_limpieza, coalesce(p_otorgar, false), nullif(left(btrim(coalesce(p_motivo, '')), 300), ''), v_usr)
    ON CONFLICT (liquidacion_id) DO UPDATE SET cuidado_unidad = EXCLUDED.cuidado_unidad, limpieza = EXCLUDED.limpieza,
           otorgar = EXCLUDED.otorgar, motivo = EXCLUDED.motivo, guardado_en = now(), guardado_por = EXCLUDED.guardado_por;
    PERFORM fin.fn_liq_bono(p_liq);
    RETURN fin.fn_bono_propuesta(p_liq);
END $f$;

-- ─── Preparar: agrega viáticos y bono ───────────────────────────────────────
DO $m$
BEGIN
    IF to_regprocedure('fin.fn_preparar_liquidacion_sin_pasos(bigint,date)') IS NULL THEN
        ALTER FUNCTION fin.fn_preparar_liquidacion(bigint, date) RENAME TO fn_preparar_liquidacion_sin_pasos;
    END IF;
END $m$;
REVOKE ALL ON FUNCTION fin.fn_preparar_liquidacion_sin_pasos(bigint, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_preparar_liquidacion(p_chofer bigint, p_periodo date)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_liq bigint;
BEGIN
    v_liq := fin.fn_preparar_liquidacion_sin_pasos(p_chofer, p_periodo);
    PERFORM fin.fn_liq_viatico(v_liq);
    PERFORM fin.fn_liq_bono(v_liq);
    RETURN v_liq;
END $f$;

-- ─── Paso 2: bono de sueldo de Colaboradores ───────────────────────────────
CREATE OR REPLACE FUNCTION fin.fn_guardar_bono_colaboradores(p_liq bigint, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE; k text; v numeric; v_n jsonb := '{}'; v_desc numeric; v_calc numeric; v_ruta text;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'El bono de sueldo lo cargan RRHH o TI');
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = 'P0002'; END IF;
    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se cambia en borrador (está %): reabrila', l.estado USING ERRCODE = '55000'; END IF;
    IF coalesce(jsonb_typeof(p_datos), '') <> 'object' THEN RAISE EXCEPTION 'No llegaron los datos del bono' USING ERRCODE = '22023'; END IF;
    FOREACH k IN ARRAY ARRAY['imponible','no_imponible','gratificacion','afp','salud','cesantia','impuesto','otros_descuentos','liquido','aporte_empleador'] LOOP
        IF coalesce(p_datos ->> k, '') = '' THEN
            v := CASE WHEN k IN ('imponible','liquido') THEN NULL ELSE 0 END;
        ELSIF (p_datos ->> k) !~ '^[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION 'Importe inválido en «%»', replace(k, '_', ' ') USING ERRCODE = '22023';
        ELSE
            v := round((p_datos ->> k)::numeric);
        END IF;
        IF v IS NULL THEN RAISE EXCEPTION 'Falta el %', CASE k WHEN 'imponible' THEN 'total imponible' ELSE 'líquido a pagar' END USING ERRCODE = '22023'; END IF;
        v_n := v_n || jsonb_build_object(k, v);
    END LOOP;
    IF (v_n ->> 'gratificacion')::numeric > (v_n ->> 'imponible')::numeric THEN
        RAISE EXCEPTION 'La gratificación va incluida en el total imponible: no puede ser mayor' USING ERRCODE = '22023';
    END IF;
    v_desc := (v_n ->> 'afp')::numeric + (v_n ->> 'salud')::numeric + (v_n ->> 'cesantia')::numeric + (v_n ->> 'impuesto')::numeric
            + (v_n ->> 'otros_descuentos')::numeric;
    v_calc := (v_n ->> 'imponible')::numeric + (v_n ->> 'no_imponible')::numeric - v_desc;
    IF abs(v_calc - (v_n ->> 'liquido')::numeric) > 1 THEN
        RAISE EXCEPTION 'No cierra: imponible + no imponible − descuentos da % y el líquido dice %. Revisá los números del bono',
            translate(to_char(v_calc, 'FM999G999G999'), ',', '.'), translate(to_char((v_n ->> 'liquido')::numeric, 'FM999G999G999'), ',', '.')
            USING ERRCODE = '22023';
    END IF;
    v_ruta := nullif(btrim(coalesce(p_datos ->> 'pdf_ruta', '')), '');
    IF v_ruta IS NOT NULL AND (length(v_ruta) > 300 OR v_ruta !~ ('^liquidaciones/' || p_liq || '/')) THEN
        RAISE EXCEPTION 'Archivo inválido' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('fin.liq_fn', '1', true);
    INSERT INTO fin.liquidacion_legal (liquidacion_id) SELECT p_liq
     WHERE NOT EXISTS (SELECT 1 FROM fin.liquidacion_legal WHERE liquidacion_id = p_liq AND eliminado_en IS NULL);
    UPDATE fin.liquidacion_legal
       SET col_imponible = (v_n ->> 'imponible')::numeric, col_no_imponible = (v_n ->> 'no_imponible')::numeric,
           col_gratificacion = (v_n ->> 'gratificacion')::numeric, col_afp = (v_n ->> 'afp')::numeric,
           col_salud = (v_n ->> 'salud')::numeric, col_cesantia = (v_n ->> 'cesantia')::numeric,
           col_impuesto = (v_n ->> 'impuesto')::numeric, col_otros_descuentos = (v_n ->> 'otros_descuentos')::numeric,
           col_liquido = (v_n ->> 'liquido')::numeric, col_aporte_empleador = (v_n ->> 'aporte_empleador')::numeric,
           col_pdf_ruta = coalesce(v_ruta, col_pdf_ruta), col_cargado_en = now(), calculo = NULL
     WHERE liquidacion_id = p_liq AND eliminado_en IS NULL;
    RETURN fin.fn_calculo_legal(p_liq);
END $f$;

CREATE OR REPLACE FUNCTION fin.fn_quitar_bono_colaboradores(p_liq bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE l fin.liquidacion_mensual%ROWTYPE;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'El bono de sueldo lo cargan RRHH o TI');
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = 'P0002'; END IF;
    IF l.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se cambia en borrador (está %): reabrila', l.estado USING ERRCODE = '55000'; END IF;
    PERFORM set_config('fin.liq_fn', '1', true);
    UPDATE fin.liquidacion_legal
       SET col_imponible = NULL, col_no_imponible = NULL, col_gratificacion = NULL, col_afp = NULL, col_salud = NULL, col_cesantia = NULL,
           col_impuesto = NULL, col_otros_descuentos = NULL, col_liquido = NULL, col_aporte_empleador = NULL, col_cargado_en = NULL, calculo = NULL
     WHERE liquidacion_id = p_liq AND eliminado_en IS NULL;
END $f$;

-- El cálculo legal: con el bono de Colaboradores cargado, manda el bono
DO $m$
BEGIN
    IF to_regprocedure('fin.fn_calculo_legal_sistema(bigint)') IS NULL THEN
        ALTER FUNCTION fin.fn_calculo_legal(bigint) RENAME TO fn_calculo_legal_sistema;
    END IF;
END $m$;

CREATE OR REPLACE FUNCTION fin.fn_calculo_legal(p_liq bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    l fin.liquidacion_mensual%ROWTYPE; g fin.liquidacion_legal%ROWTYPE; s jsonb; v_reint numeric; v_nov_imp numeric; v_nov_noimp numeric;
    v_desc numeric; v_pagar numeric; v_faltan jsonb := '[]'; v_avisos jsonb := '[]'; v_dif numeric;
    f fin.ficha_laboral%ROWTYPE; i fin.indicador_mensual%ROWTYPE; v_base numeric; v_est numeric;
BEGIN
    SELECT * INTO l FROM fin.liquidacion_mensual WHERE id = p_liq;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO g FROM fin.liquidacion_legal WHERE liquidacion_id = p_liq AND eliminado_en IS NULL;
    IF FOUND AND g.calculo IS NOT NULL AND l.estado IN ('aprobada','pagada') THEN
        RETURN g.calculo || jsonb_build_object('congelado', true);
    END IF;
    s := fin.fn_calculo_legal_sistema(p_liq);
    SELECT coalesce(sum(importe), 0) INTO v_reint FROM fin.liquidacion_renglon
     WHERE liquidacion_id = p_liq AND codigo = 'REINTEGRO' AND tipo <> 'descuento' AND eliminado_en IS NULL;
    v_nov_imp := l.remunerativo;
    v_nov_noimp := l.no_remunerativo - v_reint;

    IF g.col_liquido IS NULL THEN
        IF ref.fn_parametro_texto('fin.liq_bono_colaboradores', 'true') = 'true' THEN
            RETURN s || jsonb_build_object('fuente', 'sistema', 'bono_pendiente', true,
                                           'faltan', jsonb_build_array('Falta cargar el bono de sueldo de Colaboradores (paso 2)'),
                                           'novedades_imponible', v_nov_imp, 'novedades_no_imponible', v_nov_noimp, 'reintegro', v_reint);
        END IF;
        RETURN s || jsonb_build_object('fuente', 'sistema');
    END IF;

    -- Con el bono de Colaboradores
    v_desc := g.col_afp + g.col_salud + g.col_cesantia + g.col_impuesto + g.col_otros_descuentos;
    v_pagar := g.col_liquido - l.descuentos + v_reint;
    v_dif := (g.col_imponible - g.col_gratificacion + g.col_no_imponible) - (v_nov_imp + v_nov_noimp);
    IF g.col_imponible - g.col_gratificacion <> v_nov_imp THEN
        v_faltan := v_faltan || to_jsonb(format('El imponible del bono sin la gratificación (%s) no coincide con las novedades (%s)',
            translate(to_char(g.col_imponible - g.col_gratificacion, 'FM999G999G999'), ',', '.'), translate(to_char(v_nov_imp, 'FM999G999G999'), ',', '.')));
    END IF;
    IF g.col_no_imponible <> v_nov_noimp THEN
        v_faltan := v_faltan || to_jsonb(format('El no imponible del bono (%s) no coincide con las novedades (%s)',
            translate(to_char(g.col_no_imponible, 'FM999G999G999'), ',', '.'), translate(to_char(v_nov_noimp, 'FM999G999G999'), ',', '.')));
    END IF;
    IF g.col_pdf_ruta IS NULL THEN
        v_faltan := v_faltan || to_jsonb('Falta adjuntar el PDF del bono de sueldo de Colaboradores'::text);
    END IF;
    IF l.moneda <> 'CLP' THEN
        v_faltan := v_faltan || to_jsonb(format('El bono de sueldo va en pesos chilenos y esta liquidación está en %s', l.moneda));
    END IF;
    IF v_pagar < 0 THEN
        v_avisos := v_avisos || to_jsonb('Los descuentos superan el líquido del bono: el monto a transferir da negativo'::text);
    END IF;

    -- Control aproximado de las leyes sociales (solo avisa)
    SELECT * INTO f FROM fin.ficha_laboral WHERE chofer_id = l.chofer_id AND eliminado_en IS NULL;
    SELECT * INTO i FROM fin.indicador_mensual WHERE periodo = l.periodo AND eliminado_en IS NULL;
    IF f.id IS NOT NULL AND i.id IS NOT NULL THEN
        v_base := least(g.col_imponible, round(i.tope_imponible_uf * i.uf));
        v_est := round(v_base * (ref.fn_parametro_num('cl.afp_obligatoria_pct', 10) + coalesce(f.afp_comision_pct, 0)) / 100);
        IF abs(v_est - g.col_afp) > greatest(1000, v_est * 0.02) THEN
            v_avisos := v_avisos || to_jsonb(format('AFP: el bono dice %s y el sistema estima %s', translate(to_char(g.col_afp, 'FM999G999G999'), ',', '.'),
                                                    translate(to_char(v_est, 'FM999G999G999'), ',', '.')));
        END IF;
        v_est := round(v_base * ref.fn_parametro_num('cl.salud_pct', 7) / 100);
        IF f.salud = 'fonasa' AND abs(v_est - g.col_salud) > greatest(1000, v_est * 0.02) THEN
            v_avisos := v_avisos || to_jsonb(format('Salud: el bono dice %s y el sistema estima %s', translate(to_char(g.col_salud, 'FM999G999G999'), ',', '.'),
                                                    translate(to_char(v_est, 'FM999G999G999'), ',', '.')));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'congelado', false, 'fuente', 'colaboradores', 'bono_pendiente', false,
        'faltan', v_faltan, 'avisos', v_avisos,
        'empresa', s -> 'empresa', 'ficha', s -> 'ficha', 'fecha_ingreso', s -> 'fecha_ingreso', 'uf', s -> 'uf', 'utm', s -> 'utm',
        'dias_licencia', s -> 'dias_licencia', 'dias_sin_licencia', s -> 'dias_sin_licencia', 'dias_vacaciones', s -> 'dias_vacaciones',
        'dias_trabajados', s -> 'dias_trabajados',
        'haberes', jsonb_build_array(
            jsonb_build_object('codigo', 'NOV_IMPONIBLE', 'nombre', 'Haberes imponibles (novedades)', 'imponible', true, 'importe', g.col_imponible - g.col_gratificacion),
            jsonb_build_object('codigo', 'GRATIFICACION', 'nombre', 'Gratificación', 'imponible', true, 'importe', g.col_gratificacion),
            jsonb_build_object('codigo', 'NOV_NO_IMPONIBLE', 'nombre', 'Haberes no imponibles (novedades)', 'imponible', false, 'importe', g.col_no_imponible)),
        'novedades_imponible', v_nov_imp, 'novedades_no_imponible', v_nov_noimp, 'reintegro', v_reint,
        'total_imponible', g.col_imponible, 'total_no_imponible', g.col_no_imponible, 'total_haberes', g.col_imponible + g.col_no_imponible,
        'gratificacion', g.col_gratificacion,
        'tope_imponible', NULL, 'base_previsional', g.col_imponible,
        'afp_pct', s -> 'afp_pct', 'afp_obligatoria', g.col_afp, 'afp_comision', 0, 'afp_total', g.col_afp,
        'salud_pct', s -> 'salud_pct', 'salud', g.col_salud,
        'cesantia_pct', s -> 'cesantia_pct', 'cesantia', g.col_cesantia,
        'base_tributable', NULL, 'impuesto', g.col_impuesto, 'otros_legales', g.col_otros_descuentos,
        'total_descuentos', v_desc, 'liquido', g.col_liquido, 'liquido_letras', fin.fn_monto_en_letras(g.col_liquido),
        'planilla_bruto', v_nov_imp + v_nov_noimp, 'diferencia', v_dif,
        'otros_descuentos', l.descuentos, 'a_pagar', v_pagar, 'a_pagar_letras', fin.fn_monto_en_letras(v_pagar),
        'aporte_empleador', g.col_aporte_empleador, 'pdf_ruta', g.col_pdf_ruta, 'cargado_en', g.col_cargado_en);
END $f$;

-- Contabilidad: los aportes de la empresa salen del bono de Colaboradores cuando están
DO $m$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('fin.fn_contabilizar_liquidacion(bigint)'::regprocedure);
    IF position('aporte_empleador' IN v_def) > 0 THEN RETURN; END IF;
    v_nuevo := regexp_replace(v_def, '(\n\s*ELSE\s*\n\s*-- Solo la planilla interna)',
        E'\n        IF k ? ''aporte_empleador'' AND (k ->> ''aporte_empleador'') IS NOT NULL THEN v_patr := (k ->> ''aporte_empleador'')::numeric; END IF;\\1');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No encontré dónde poner los aportes en fin.fn_contabilizar_liquidacion: avisale a TI'; END IF;
    EXECUTE v_nuevo;
END $m$;

-- Pago: también lo registra Gerencia
DO $m$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('fin.fn_pagar_liquidacion(bigint,date,text,text,text,bigint)'::regprocedure);
    IF position('''gerencia''' IN v_def) > 0 THEN RETURN; END IF;
    v_nuevo := regexp_replace(v_def, 'ARRAY\[''rrhh'',\s*''finanzas'',\s*''ti''\],\s*''El pago lo registran RRHH, Finanzas o TI''',
                              'ARRAY[''rrhh'',''finanzas'',''gerencia'',''ti''], ''La transferencia la registran Gerencia, Finanzas, RRHH o TI''');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No encontré los roles en fin.fn_pagar_liquidacion: avisale a TI'; END IF;
    EXECUTE v_nuevo;
END $m$;

-- ─── La liquidación para la pantalla ───────────────────────────────────────
DO $m$
BEGIN
    IF to_regprocedure('fin.fn_liquidacion_json_sin_pasos(bigint)') IS NULL THEN
        ALTER FUNCTION fin.fn_liquidacion_json(bigint) RENAME TO fn_liquidacion_json_sin_pasos;
    END IF;
END $m$;

CREATE OR REPLACE FUNCTION fin.fn_liquidacion_json(p_liq bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT fin.fn_liquidacion_json_sin_pasos(p_liq) || jsonb_build_object(
        'viatico_dia', ref.fn_parametro_num('fin.viatico_por_dia', 10000),
        'dias_trabajados', coalesce((SELECT jsonb_agg(jsonb_build_object('fecha', x.fecha, 'trabajado', x.trabajado, 'propuesto', x.propuesto,
                                                                        'fuente', x.fuente, 'detalle', nullif(x.detalle, ''), 'motivo', x.motivo) ORDER BY x.fecha)
                                       FROM fin.liquidacion_mensual l CROSS JOIN LATERAL fin.fn_dias_chofer(l.chofer_id, l.desde, l.hasta) x
                                      WHERE l.id = p_liq), '[]'::jsonb),
        'bono_desempeno', fin.fn_bono_propuesta(p_liq),
        'colaboradores', (SELECT jsonb_build_object('imponible', g.col_imponible, 'no_imponible', g.col_no_imponible, 'gratificacion', g.col_gratificacion,
                                                    'afp', g.col_afp, 'salud', g.col_salud, 'cesantia', g.col_cesantia, 'impuesto', g.col_impuesto,
                                                    'otros_descuentos', g.col_otros_descuentos, 'liquido', g.col_liquido,
                                                    'aporte_empleador', g.col_aporte_empleador, 'pdf_ruta', g.col_pdf_ruta, 'cargado_en', g.col_cargado_en)
                            FROM fin.liquidacion_legal g WHERE g.liquidacion_id = p_liq AND g.eliminado_en IS NULL AND g.col_liquido IS NOT NULL))
$f$;

-- Lista del período: en qué paso está cada una y cuánto se transfiere
CREATE OR REPLACE FUNCTION fin.fn_liquidaciones(p_periodo date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object(
        'periodo', date_trunc('month', p_periodo)::date,
        'desde', (fin.fn_rango_periodo(date_trunc('month', p_periodo)::date)).desde,
        'hasta', (fin.fn_rango_periodo(date_trunc('month', p_periodo)::date)).hasta,
        'moneda', ref.fn_moneda_base(),
        'liquidaciones', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'numero', l.numero, 'chofer_id', l.chofer_id,
                              'chofer', ops.fn_nombre_chofer(l.chofer_id), 'estado', l.estado, 'remunerativo', l.remunerativo,
                              'no_remunerativo', l.no_remunerativo, 'descuentos', l.descuentos, 'neto', l.neto,
                              'avisos', jsonb_array_length(l.avisos), 'pagada_en', l.pagada_en,
                              'con_bono', g.col_liquido IS NOT NULL OR g.calculo IS NOT NULL,
                              'a_pagar', CASE WHEN l.estado IN ('aprobada','pagada') AND g.calculo IS NOT NULL THEN (g.calculo ->> 'a_pagar')::numeric
                                              WHEN g.col_liquido IS NOT NULL THEN g.col_liquido - l.descuentos + coalesce(ri.importe, 0) END)
                              ORDER BY ops.fn_nombre_chofer(l.chofer_id))
                                     FROM fin.liquidacion_mensual l
                                     LEFT JOIN fin.liquidacion_legal g ON g.liquidacion_id = l.id AND g.eliminado_en IS NULL
                                     LEFT JOIN LATERAL (SELECT sum(r.importe) AS importe FROM fin.liquidacion_renglon r
                                                         WHERE r.liquidacion_id = l.id AND r.codigo = 'REINTEGRO' AND r.tipo <> 'descuento'
                                                           AND r.eliminado_en IS NULL) ri ON true
                                    WHERE l.periodo = date_trunc('month', p_periodo)::date AND l.estado <> 'anulada' AND l.eliminado_en IS NULL), '[]'::jsonb))
$f$;

-- Novedades del período para mandar a Colaboradores
CREATE OR REPLACE FUNCTION fin.fn_novedades_periodo(p_periodo date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti','gerencia','finanzas'], 'Las novedades las ven RRHH, Gerencia, Finanzas o TI');
    RETURN coalesce((
        SELECT jsonb_agg(x.fila ORDER BY x.chofer) FROM (
        SELECT ops.fn_nombre_chofer(l.chofer_id) AS chofer, jsonb_build_object(
                   'chofer', ops.fn_nombre_chofer(l.chofer_id), 'rut', f.rut, 'estado', l.estado,
                   'basico', coalesce(sum(r.importe) FILTER (WHERE r.codigo = 'SUELDO_FIJO'), 0),
                   'bono_viaje', coalesce(sum(r.importe) FILTER (WHERE r.codigo = 'CANON'), 0),
                   'otros_imponibles', coalesce(sum(r.importe) FILTER (WHERE r.tipo = 'remunerativo' AND coalesce(r.codigo, '') NOT IN ('SUELDO_FIJO','CANON')), 0),
                   'viaticos', coalesce(sum(r.importe) FILTER (WHERE r.codigo = 'VIATICO'), 0),
                   'dias', coalesce(max(r.cantidad) FILTER (WHERE r.codigo = 'VIATICO'), 0),
                   'adicional_km', coalesce(sum(r.importe) FILTER (WHERE r.codigo = 'KM' AND r.tipo = 'no_remunerativo'), 0),
                   'bono_desempeno', coalesce(sum(r.importe) FILTER (WHERE r.codigo = 'BONO_DESEMPENO'), 0),
                   'otros_no_imponibles', coalesce(sum(r.importe) FILTER (WHERE r.tipo = 'no_remunerativo'
                                                   AND coalesce(r.codigo, '') NOT IN ('VIATICO','KM','BONO_DESEMPENO','REINTEGRO')), 0),
                   'total_imponible', coalesce(sum(r.importe) FILTER (WHERE r.tipo = 'remunerativo'), 0),
                   'total_no_imponible', coalesce(sum(r.importe) FILTER (WHERE r.tipo = 'no_remunerativo' AND coalesce(r.codigo, '') <> 'REINTEGRO'), 0)) AS fila
          FROM fin.liquidacion_mensual l
          LEFT JOIN fin.ficha_laboral f ON f.chofer_id = l.chofer_id AND f.eliminado_en IS NULL
          LEFT JOIN fin.liquidacion_renglon r ON r.liquidacion_id = l.id AND r.eliminado_en IS NULL
         WHERE l.periodo = date_trunc('month', p_periodo)::date AND l.estado <> 'anulada' AND l.eliminado_en IS NULL
         GROUP BY l.id, l.chofer_id, f.rut, l.estado) x), '[]'::jsonb);
END $f$;

-- ─── Permisos ───────────────────────────────────────────────────────────────
DO $g$
DECLARE g record; fn text;
BEGIN
    FOREACH fn IN ARRAY ARRAY['fin.fn_dias_chofer(bigint,date,date)', 'fin.fn_liq_viatico(bigint)', 'fin.fn_liq_bono(bigint)',
                              'fin.fn_bono_propuesta(bigint)', 'fin.fn_preparar_liquidacion_sin_pasos(bigint,date)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    END LOOP;
    FOREACH fn IN ARRAY ARRAY['fin.fn_dias_trabajados(bigint,date,date)', 'fin.fn_guardar_dia_trabajado(bigint,date,boolean,text)',
                              'fin.fn_guardar_bono_desempeno(bigint,boolean,boolean,boolean,text)', 'fin.fn_guardar_bono_colaboradores(bigint,jsonb)',
                              'fin.fn_quitar_bono_colaboradores(bigint)', 'fin.fn_novedades_periodo(date)', 'fin.fn_preparar_liquidacion(bigint,date)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
                  WHERE routine_schema = 'fin' AND routine_name = 'fn_aprobar_liquidacion' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', fn, g.grantee);
        END LOOP;
    END LOOP;
    -- Las internas que llaman las funciones de la pantalla (sin SECURITY DEFINER) siguen como las tenía la vieja
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_calculo_legal_sistema' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_calculo_legal(bigint) TO %I', g.grantee);
    END LOOP;
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_liquidacion_json_sin_pasos' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_liquidacion_json(bigint) TO %I', g.grantee);
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: liquidación en 3 pasos (novedades, bono de Colaboradores, transferencia)' AS resultado;
