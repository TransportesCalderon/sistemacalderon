-- Finanzas › Gastos fijos · Cantidad de cuotas (leasing, créditos)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Se puede correr más de una vez.
-- Agrega la columna «cuotas» a fin.gasto_fijo. Si se cargan las cuotas, el sistema calcula solo hasta qué mes va
-- (desde + cuotas) y muestra por cuál cuota va y cuántas faltan. No cambia los gastos fijos ya cargados.

BEGIN;

ALTER TABLE fin.gasto_fijo ADD COLUMN IF NOT EXISTS cuotas smallint;
COMMENT ON COLUMN fin.gasto_fijo.cuotas IS 'Cantidad total de cuotas (leasing o crédito). Si está cargada, «hasta» se calcula solo: el último día del mes de la última cuota.';
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_gasto_fijo_cuotas') THEN
        ALTER TABLE fin.gasto_fijo ADD CONSTRAINT ck_gasto_fijo_cuotas CHECK (cuotas IS NULL OR cuotas BETWEEN 1 AND 600);
    END IF;
END $do$;

-- Guardar: acepta «cuotas» y calcula «hasta»
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_guardar_gasto_fijo(bigint, jsonb)'::regprocedure); a text[]; i integer;
BEGIN
    IF v LIKE '%v_cuotas%' THEN RETURN; END IF;
    a := ARRAY[
        'v_activo boolean := coalesce((p_datos ->> ''activo'')::boolean, true);',
        'v_activo boolean := coalesce((p_datos ->> ''activo'')::boolean, true);
        v_cuotas smallint := nullif(p_datos ->> ''cuotas'', '''')::smallint;',
        '    IF v_hasta IS NOT NULL AND v_hasta < v_desde THEN',
        '    IF v_cuotas IS NOT NULL THEN
        IF v_cuotas NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION ''La cantidad de cuotas va de 1 a 600'' USING ERRCODE = ''22023''; END IF;
        -- La última cuota es la del mes (desde + cuotas - 1): «hasta» queda en el último día de ese mes
        v_hasta := (v_desde + make_interval(months => v_cuotas::integer) - interval ''1 day'')::date;
    END IF;
    IF v_hasta IS NOT NULL AND v_hasta < v_desde THEN',
        'desde, hasta, activo, observacion)', 'desde, hasta, activo, observacion, cuotas)',
        'v_activo, nullif(btrim(p_datos ->> ''observacion''), ''''))', 'v_activo, nullif(btrim(p_datos ->> ''observacion''), ''''), v_cuotas)',
        'hasta = v_hasta, activo = v_activo,', 'hasta = v_hasta, activo = v_activo, cuotas = v_cuotas,'];
    FOR i IN 1 .. array_length(a, 1) / 2 LOOP
        IF (length(v) - length(replace(v, a[2 * i - 1], ''))) / length(a[2 * i - 1]) <> 1 THEN
            RAISE EXCEPTION 'fin.fn_guardar_gasto_fijo no es la que esperaba esta migración (paso %): avisar antes de seguir', i;
        END IF;
        v := replace(v, a[2 * i - 1], a[2 * i]);
    END LOOP;
    EXECUTE v;
END $do$;

-- Listar: devuelve las cuotas, por cuál va y cuántas faltan
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_gastos_fijos()'::regprocedure);
        a constant text := '''desde'', f.desde, ''hasta'', f.hasta,';
BEGIN
    IF v LIKE '%cuota_actual%' THEN RETURN; END IF;
    IF position(a IN v) = 0 THEN RAISE EXCEPTION 'fin.fn_gastos_fijos no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v, a, a || '
                       ''cuotas'', f.cuotas,
                       ''cuota_actual'', CASE WHEN f.cuotas IS NOT NULL THEN least(greatest(
                            (extract(year FROM age(v_mes, f.desde)) * 12 + extract(month FROM age(v_mes, f.desde)))::integer + 1, 0), f.cuotas) END,
                       ''terminado'', f.hasta IS NOT NULL AND f.hasta < v_mes,');
END $do$;

COMMIT;
