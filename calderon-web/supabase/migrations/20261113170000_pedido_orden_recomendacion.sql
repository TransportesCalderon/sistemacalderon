-- =============================================================================
-- IronTrack — 263 · Cambio 253 · Pedido y orden de carga: recomendación, pedido y decisión
-- -----------------------------------------------------------------------------
-- El pedido de carga (Seguimiento) es una recomendación; la orden es la decisión de quien
-- autoriza. Pueden ser distintos. Este cambio no toca ningún cálculo: solo hace que cada
-- pantalla reciba los tres datos para mostrarlos con su nombre y su diferencia.
--   · La solicitud pendiente (Órdenes de carga) trae lo que recomendó el sistema al pedirla:
--     litros recomendados, para llegar con reserva y para llenar.
--   · Los pedidos del viaje (Seguimiento) traen lo recomendado y, si se aprobó, lo que
--     autorizó la orden, sus litros calculados y si se aprobó con cambios.
--   · Desde ahora el pedido guarda también «para llegar» y «para llenar» (antes solo guardaba
--     lo recomendado). Los pedidos anteriores muestran solo lo recomendado.
-- No cambia tablas. web.version_base = 263.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 262 THEN
        RAISE EXCEPTION 'Falta la migración 262 (cambio 252): aplicarla antes';
    END IF;
    IF position('recomendado_l' IN (SELECT prosrc FROM pg_proc WHERE oid = 'fue.fn_solicitudes_carga()'::regprocedure)) > 0 THEN
        RAISE EXCEPTION 'La migración 263 (pedido y orden: recomendación y decisión) ya está aplicada';
    END IF;
END $do$;

-- Se toma la versión que está en la base de cada función y se le agrega solo lo nuevo;
-- si el texto de referencia no aparece exactamente una vez, frena.
CREATE FUNCTION pg_temp.fn_parchar_263(p_f regprocedure, p_ancla text, p_nuevo text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE v_def text := pg_get_functiondef(p_f); n int;
BEGIN
    n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
    IF n <> 1 THEN
        RAISE EXCEPTION '%: se esperaba una vez el texto «%» y aparece %: avisar antes de seguir', p_f, p_ancla, n;
    END IF;
    EXECUTE replace(v_def, p_ancla, p_nuevo);
END $fn$;

DO $do$
DECLARE f regprocedure;
BEGIN
    -- 1 · El pedido guarda también «para llegar» y «para llenar»
    SELECT p.oid::regprocedure INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'tel' AND p.proname = 'fn_pedir_carga';
    PERFORM pg_temp.fn_parchar_263(f,
        '''precio_sugerido'', b -> ''precio'', ''litros_sugeridos'', b -> ''litros_sugeridos''),',
        '''precio_sugerido'', b -> ''precio'', ''litros_sugeridos'', b -> ''litros_sugeridos'','
        || E'\n                               -- Migración 263: la recomendación completa, para mostrarla al aprobar'
        || E'\n                               ''litros_para_llegar'', b -> ''litros_para_llegar'', ''litros_para_llenar'', b -> ''litros_para_llenar''),');

    -- 2 · La solicitud pendiente trae la recomendación
    PERFORM pg_temp.fn_parchar_263('fue.fn_solicitudes_carga()'::regprocedure,
        '''observacion'', p.observacion, ''mensaje'', p.mensaje)',
        '''observacion'', p.observacion, ''mensaje'', p.mensaje,'
        || E'\n               -- Migración 263: lo que recomendó el sistema al pedirla'
        || E'\n               ''recomendado_l'', nullif(p.datos ->> ''litros_sugeridos'', '''')::numeric,'
        || E'\n               ''para_llegar_l'', nullif(p.datos ->> ''litros_para_llegar'', '''')::numeric,'
        || E'\n               ''para_llenar_l'', nullif(p.datos ->> ''litros_para_llenar'', '''')::numeric)');

    -- 3 · Los pedidos del viaje traen la recomendación y lo que autorizó la orden
    PERFORM pg_temp.fn_parchar_263('tel.fn_pedidos_carga_viaje(bigint)'::regprocedure,
        '''motivo_rechazo'', p.motivo_rechazo, ''resuelto_en'', p.resuelto_en, ''resuelto_por'', r.nombre)',
        '''motivo_rechazo'', p.motivo_rechazo, ''resuelto_en'', p.resuelto_en, ''resuelto_por'', r.nombre,'
        || E'\n                                                 -- Migración 263: recomendación del sistema y decisión de la orden'
        || E'\n                                                 ''recomendado_l'', nullif(p.datos ->> ''litros_sugeridos'', '''')::numeric,'
        || E'\n                                                 ''orden_a_cargar'', CASE WHEN o.id IS NOT NULL THEN fue.fn_texto_autorizado(o) END,'
        || E'\n                                                 ''orden_litros'', o.litros_calculados,'
        || E'\n                                                 ''orden_con_cambios'', CASE WHEN o.id IS NOT NULL THEN'
        || E'\n                                                     o.estacion_id IS DISTINCT FROM p.estacion_id'
        || E'\n                                                     OR fue.fn_texto_autorizado(o) IS DISTINCT FROM fue.fn_texto_detalle_carga(p.detalle) END)');
END $do$;

UPDATE ref.parametro SET valor = '263' WHERE codigo = 'web.version_base' AND valor::text::int < 263;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 263 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base;
