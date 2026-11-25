-- «Preparar todas» las liquidaciones: la pantalla ahora las prepara de a una.
-- Con muchos choferes, preparar todas en un solo pedido superaba el tiempo máximo y
-- la pantalla mostraba «Ocurrió un error inesperado» (no se guardaba ninguna).
-- Esta función solo devuelve qué choferes hay que preparar en el período (mismo criterio
-- que fin.fn_preparar_liquidaciones); la pantalla llama a fin.fn_preparar_liquidacion por cada uno.

CREATE OR REPLACE FUNCTION fin.fn_choferes_a_preparar(p_periodo date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_per date := date_trunc('month', p_periodo)::date; r record;
BEGIN
    PERFORM fin.fn_exigir_rol_liq(ARRAY['rrhh','ti'], 'Las liquidaciones las preparan RRHH o TI');
    SELECT * INTO r FROM fin.fn_rango_periodo(v_per);
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre) ORDER BY x.nombre)
        FROM (SELECT c.id, ops.fn_nombre_chofer(c.id) AS nombre FROM mae.chofer c
               WHERE c.eliminado_en IS NULL AND c.fecha_ingreso <= r.hasta
                 AND (c.fecha_egreso IS NULL OR c.fecha_egreso >= r.desde)
                 AND NOT EXISTS (SELECT 1 FROM fin.liquidacion_mensual l WHERE l.chofer_id = c.id AND l.periodo = v_per
                                   AND l.estado IN ('aprobada','pagada') AND l.eliminado_en IS NULL)) x
    ), '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION fin.fn_choferes_a_preparar(date) FROM PUBLIC;
DO $$
DECLARE g record;
BEGIN
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'fin' AND routine_name = 'fn_preparar_liquidaciones' AND privilege_type = 'EXECUTE'
                AND grantee <> 'PUBLIC'
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_choferes_a_preparar(date) TO %I', g.grantee);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: «Preparar todas» ahora va chofer por chofer' AS resultado;
