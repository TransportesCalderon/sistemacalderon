-- Hoy · Aviso a Operaciones: operaciones sin cliente real o sin precio
-- Pedido de Gerencia (16/11/2026). NO cambia web.version_base.
-- Agrega una sección a «Hoy» (seg.fn_lo_mio_de_hoy) para el perfil Operaciones. No toca datos. Se puede correr más de una vez.

BEGIN;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('seg.hoy_dias_op_incompleta', '60', 'Hoy: cuántos días hacia atrás se avisa a Operaciones de las operaciones sin cliente o sin precio.')
ON CONFLICT (codigo) DO NOTHING;

DO $do$
DECLARE
    v_def text := pg_get_functiondef('seg.fn_lo_mio_de_hoy()'::regprocedure);
    v_ancla constant text := '    -- 4 · Operaciones: sin confirmar, sin equipo y frío sin genset';
    v_nuevo constant text := $t$    -- 4a · Operaciones con datos que faltan: figuran «sin cliente» o no tienen precio (pedido de Gerencia 16/11/2026)
    IF v_roles && ARRAY['operaciones'] THEN
        BEGIN
            RETURN QUERY
            SELECT 'revisar'::text, x.tipo, 'operacion'::text, x.id, x.creado_en, x.titulo, x.detalle, NULL::text, 'operacion.servicios'::text, 1
              FROM (
                (SELECT s.id, s.creado_en, 'op_sin_cliente'::text AS tipo,
                        'Falta el cliente de la operación ' || coalesce(s.numero_operacion::text, s.numero_servicio) AS titulo,
                        concat_ws(' · ', 'Figura «' || c.razon_social || '»: poné el cliente con su razón social correcta', l.codigo,
                                  to_char(s.fecha_operacion, 'DD/MM/YYYY')) AS detalle
                   FROM ops.servicio_comercial s JOIN mae.cliente c ON c.id = s.cliente_id LEFT JOIN mae.linea l ON l.id = s.linea_id
                  WHERE s.eliminado_en IS NULL AND s.estado <> 'cancelado'
                    AND (c.codigo ILIKE '%SIN-CLIENTE%' OR c.razon_social ILIKE 'SIN CLIENTE%')
                    AND coalesce(s.fecha_operacion, s.creado_en::date) >= v_hoy - ref.fn_parametro_num('seg.hoy_dias_op_incompleta', 60)::integer
                  ORDER BY coalesce(s.fecha_operacion, s.creado_en::date) DESC, s.id DESC LIMIT 40)
                UNION ALL
                (SELECT s.id, s.creado_en, 'op_sin_precio'::text,
                        'Falta el precio de la operación ' || coalesce(s.numero_operacion::text, s.numero_servicio),
                        concat_ws(' · ', c.razon_social, l.codigo, to_char(s.fecha_operacion, 'DD/MM/YYYY'))
                   FROM ops.servicio_comercial s JOIN mae.cliente c ON c.id = s.cliente_id LEFT JOIN mae.linea l ON l.id = s.linea_id
                  WHERE s.eliminado_en IS NULL AND s.estado IN ('sin_confirmar', 'planificado', 'en_curso', 'entregado')
                    AND (s.precio_viaje IS NULL OR s.precio_viaje <= 0)
                    AND coalesce(s.fecha_operacion, s.creado_en::date) >= v_hoy - ref.fn_parametro_num('seg.hoy_dias_op_incompleta', 60)::integer
                  ORDER BY coalesce(s.fecha_operacion, s.creado_en::date) DESC, s.id DESC LIMIT 40)
              ) x;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT 'revisar'::text, 'error_seccion'::text, NULL::text, NULL::bigint, now(), 'No se pudo leer «Operaciones con datos que faltan»'::text,
                                SQLERRM, '/operacion/operaciones'::text, 'operacion.servicios'::text, 1;
        END;
    END IF;

$t$;
BEGIN
    IF v_def LIKE '%op_sin_cliente%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'seg.fn_lo_mio_de_hoy no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_nuevo || v_ancla);
END $do$;

COMMIT;
