-- Finanzas › Gastos fijos · Al corregir las «cuotas ya pagadas», las cuotas generadas de más se anulan solas
-- Pedido del 17/11/2026 (leasing SDKZ64 y SDKZ68: al corregir el mes de inicio quedó una cuota de más y la numeración vieja). NO cambia web.version_base.
-- Necesita gasto_fijo_cuotas_03.sql. Se puede correr más de una vez.
-- Regla: si un gasto fijo con cuotas cambia (cuotas, cuotas ya pagadas o mes de inicio), el sistema
--   1) anula las cuotas generadas SIN NINGÚN PAGO que quedaron dentro de las «ya pagadas antes» o fuera del total;
--   2) corrige el número de cuota escrito en la descripción;
--   3) genera las atrasadas que falten y reparte de nuevo las fechas previstas de pago.
-- Una cuota que ya tiene un pago registrado nunca se anula sola.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fin.fn_generar_cuotas_atrasadas(date)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas_03.sql'; END IF;
END $do$;

CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_ajustar_cuotas(p_fijo bigint)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE f fin.gasto_fijo%ROWTYPE; n integer := 0;
BEGIN
    SELECT * INTO f FROM fin.gasto_fijo WHERE id = p_fijo;
    IF NOT FOUND OR f.cuotas IS NULL THEN RETURN 0; END IF;
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.gasto g
       SET estado = 'anulado',
           motivo = 'Cuota ' || fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) || ' anulada: figura entre las ya pagadas antes de cargar el gasto fijo (o fuera del total de cuotas)'
     WHERE g.gasto_fijo_id = f.id AND g.estado <> 'anulado' AND g.eliminado_en IS NULL AND fin.fn_pagado_gasto(g.id) = 0
       AND fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) NOT BETWEEN coalesce(f.cuotas_previas, 0) + 1 AND f.cuotas;
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM fin.fn_generar_cuotas_atrasadas(mae.fn_hoy());
    -- El número de cuota escrito en la descripción sigue al mes (si se corrió el mes de inicio, quedaba viejo)
    PERFORM set_config('fin.cont_fn', '1', true);
    UPDATE fin.gasto g
       SET descripcion = regexp_replace(g.descripcion, 'cuota [0-9]+ de [0-9]+$', 'cuota ' || fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) || ' de ' || f.cuotas)
     WHERE g.gasto_fijo_id = f.id AND g.estado <> 'anulado' AND g.eliminado_en IS NULL
       AND g.descripcion ~ 'cuota [0-9]+ de [0-9]+$'
       AND g.descripcion !~ ('cuota ' || fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) || ' de ' || f.cuotas || '$');
    PERFORM fin.fn_gasto_fijo_prever_pagos(f.id);
    RETURN n;
END $function$;
REVOKE ALL ON FUNCTION fin.fn_gasto_fijo_ajustar_cuotas(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_tras_cambio()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    IF NEW.cuotas IS NOT NULL AND NEW.eliminado_en IS NULL AND NEW.activo
       AND (TG_OP = 'INSERT' OR NEW.cuotas IS DISTINCT FROM OLD.cuotas OR NEW.cuotas_previas IS DISTINCT FROM OLD.cuotas_previas
            OR NEW.desde IS DISTINCT FROM OLD.desde OR NEW.activo IS DISTINCT FROM OLD.activo) THEN
        PERFORM fin.fn_gasto_fijo_ajustar_cuotas(NEW.id);
    END IF;
    RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS tg_80_ajustar_cuotas ON fin.gasto_fijo;
CREATE TRIGGER tg_80_ajustar_cuotas AFTER INSERT OR UPDATE ON fin.gasto_fijo
    FOR EACH ROW EXECUTE FUNCTION fin.fn_gasto_fijo_tras_cambio();

-- Las cuotas contadas como «emitidas» no pasan del total (por si quedó alguna de más con pagos)
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_cuotas_hechas(p_id bigint)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT least(coalesce(f.cuotas_previas, 0)::integer
           + (SELECT count(*) FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> 'anulado' AND g.eliminado_en IS NULL
                 AND (f.cuotas IS NULL OR fin.fn_gasto_fijo_cuota_de(f.id, g.periodo) > coalesce(f.cuotas_previas, 0)))::integer,
           coalesce(f.cuotas::integer, 2147483647))
      FROM fin.gasto_fijo f WHERE f.id = p_id
$f$;

COMMIT;
