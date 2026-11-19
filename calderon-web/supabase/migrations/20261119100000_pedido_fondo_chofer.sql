-- =============================================================================
-- IronTrack — 278 · Cambio 273 · Pedido de dinero (FF Chofer) desde el chofer, revisión de Operaciones y
--                   autorización con pago de Gerencia
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026):
--   1. El chofer pide el dinero desde su perfil (fin.fn_pedir_fondo_chofer). Queda «solicitado» y le llega el aviso
--      a Operaciones.
--   2. Operaciones lo revisa (fin.fn_revisar_pedido_fondo): lo eleva a Gerencia («pendiente») o lo rechaza.
--      Operaciones también puede seguir pidiendo por el chofer (fin.fn_pedir_fondo, sin cambios): eso va directo a Gerencia.
--   3. Autoriza quien tiene la marca «Aprueba fondos» (Configuración › Usuarios, la pone TI). Al autorizar
--      (fin.fn_autorizar_pedido_fondo) elige el monto (el pedido u otro), el medio (transferencia, depósito o efectivo),
--      la cuenta de donde sale la plata, la fecha y, si la cuenta es de otra moneda, cuánto salió de la cuenta.
--      En el mismo paso queda registrado: la entrega al chofer (fondo por rendir) y el egreso de esa cuenta, así el
--      saldo de la cuenta es el real. Se avisa al chofer y a quien pidió.
--   4. Los pedidos «aprobados» con el sistema anterior se pagan con fin.fn_pagar_pedido_fondo (misma pantalla).
--      fin.fn_depositar_pedido_fondo no se usaba (sin cuenta falla siempre): queda como estaba.
-- web.version_base = 278.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 277 THEN
        RAISE EXCEPTION 'Falta la migración 277 (remitos por mail): aplicarla antes';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'pedido_fondo' AND column_name = 'importe_solicitado') THEN
        RAISE EXCEPTION 'La migración 278 (pedido de fondo del chofer) ya está aplicada';
    END IF;
    IF to_regprocedure('fin.fn_pedidos_fondo(boolean)') IS NULL OR to_regprocedure('fin.fn_resolver_pedido_fondo(bigint,boolean,text)') IS NULL
       OR to_regprocedure('fin.fn_anular_pedido_fondo(bigint,text)') IS NULL OR to_regprocedure('fin.fn_insertar_movimiento(bigint,text,date,text,numeric,text,text,jsonb)') IS NULL
       OR to_regprocedure('fin.fn_movimiento_de_origen(text,bigint,text,date,bigint,numeric,smallint,text,text,bigint)') IS NULL
       OR to_regprocedure('fin.fn_fondo_con_banco(bigint,bigint)') IS NULL OR to_regprocedure('ops.fn_exigir_mi_chofer()') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de fondos que esta migración usa: avisar antes de seguir';
    END IF;
END $do$;

-- 1 · El pedido guarda lo que pidió el chofer, la revisión de Operaciones y cómo se pagó
ALTER TABLE fin.pedido_fondo
    ADD COLUMN importe_solicitado numeric(14,2),
    ADD COLUMN elevado_por bigint REFERENCES seg.usuario (id),
    ADD COLUMN elevado_en timestamptz,
    ADD COLUMN nota_revision text CHECK (nota_revision IS NULL OR length(nota_revision) <= 500),
    ADD COLUMN medio_pago text CHECK (medio_pago IS NULL OR medio_pago IN ('transferencia', 'deposito', 'efectivo')),
    ADD COLUMN cuenta_dinero_id bigint REFERENCES fin.cuenta_dinero (id),
    ADD COLUMN monto_cuenta numeric(14,2) CHECK (monto_cuenta IS NULL OR monto_cuenta > 0),
    ADD COLUMN pedido_por_chofer boolean NOT NULL DEFAULT false;
ALTER TABLE fin.pedido_fondo DROP CONSTRAINT pedido_fondo_estado_check;
ALTER TABLE fin.pedido_fondo ADD CONSTRAINT pedido_fondo_estado_check
    CHECK (estado IN ('solicitado', 'pendiente', 'aprobado', 'rechazado', 'depositado', 'anulado'));
COMMENT ON COLUMN fin.pedido_fondo.importe_solicitado IS 'Migración 278: lo que se pidió, si Gerencia autorizó otro monto (importe = lo autorizado).';
COMMENT ON COLUMN fin.pedido_fondo.monto_cuenta IS 'Migración 278: lo que salió de la cuenta, en la moneda de la cuenta (si es distinta de la del fondo).';

-- 2 · El chofer pide desde su perfil
CREATE FUNCTION fin.fn_pedir_fondo_chofer(p_moneda text, p_importe numeric, p_detalle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_chofer bigint := ops.fn_exigir_mi_chofer(); v record; p fin.pedido_fondo%ROWTYPE;
        v_hoy date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
    PERFORM fin.fn_validar_movimiento(v_chofer, p_moneda, p_importe, v_hoy);
    IF length(btrim(coalesce(p_detalle, ''))) < 3 THEN
        RAISE EXCEPTION 'Escribí para qué es el dinero (viaje, destino, gastos)' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(p_detalle)) > 500 THEN RAISE EXCEPTION 'El detalle tiene más de 500 letras' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM fin.pedido_fondo WHERE chofer_id = v_chofer AND estado IN ('solicitado', 'pendiente')) THEN
        RAISE EXCEPTION 'Ya tenés un pedido de dinero esperando respuesta: esperá a que lo resuelvan o anulalo' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v FROM fin.fn_viaje_en(v_chofer, v_hoy);
    INSERT INTO fin.pedido_fondo (chofer_id, camion_id, viaje_chofer_id, moneda, importe, detalle, pedido_por, estado, pedido_por_chofer)
    VALUES (v_chofer, v.camion_id, v.viaje_id, p_moneda, round(p_importe, 2), btrim(p_detalle), aud.fn_usuario_actual(), 'solicitado', true)
    RETURNING * INTO p;
    PERFORM ops.fn_avisar((SELECT array_agg(DISTINCT r.usuario_id) FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
                            WHERE r.rol_codigo = 'operaciones' AND u.activo),
        'ff:' || p.id || ':solicitado', 'Pedido de dinero de un chofer para revisar', fin.fn_texto_pedido(p) || ' · ' || p.detalle,
        '/liquidaciones/fondos?vista=pedidos', false);
    RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'estado', p.estado);
END $f$;

-- Lo que ve el chofer de sus pedidos
CREATE FUNCTION fin.fn_mis_pedidos_fondo()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_chofer bigint := ops.fn_exigir_mi_chofer();
BEGIN
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', p.id, 'numero', p.numero, 'estado', p.estado, 'moneda', p.moneda, 'importe', p.importe,
                   'importe_solicitado', coalesce(p.importe_solicitado, p.importe), 'detalle', p.detalle, 'pedido_en', p.pedido_en,
                   'motivo', CASE WHEN p.estado IN ('rechazado', 'anulado') THEN p.motivo END, 'fecha_deposito', p.fecha_deposito,
                   'medio_pago', p.medio_pago, 'puede_anular', p.estado = 'solicitado')
               ORDER BY p.pedido_en DESC)
          FROM (SELECT * FROM fin.pedido_fondo WHERE chofer_id = v_chofer ORDER BY pedido_en DESC LIMIT 20) p), '[]');
END $f$;

-- 3 · Operaciones revisa: eleva a Gerencia o rechaza
CREATE FUNCTION fin.fn_revisar_pedido_fondo(p_pedido bigint, p_elevar boolean, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p fin.pedido_fondo%ROWTYPE; v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF NOT fin.fn_puedo_pedir_fondos() THEN
        RAISE EXCEPTION 'Los pedidos de los choferes los revisa Operaciones' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p_pedido FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.estado <> 'solicitado' THEN RAISE EXCEPTION 'El pedido % ya está %', p.numero, p.estado USING ERRCODE = '55000'; END IF;
    IF p_elevar IS NULL THEN RAISE EXCEPTION 'Elegí elevar o rechazar' USING ERRCODE = '22023'; END IF;
    IF length(btrim(coalesce(p_nota, ''))) > 500 THEN RAISE EXCEPTION 'La nota tiene más de 500 letras' USING ERRCODE = '22023'; END IF;
    IF p_elevar THEN
        UPDATE fin.pedido_fondo SET estado = 'pendiente', elevado_por = v_usr, elevado_en = now(), nota_revision = nullif(btrim(p_nota), '')
         WHERE id = p.id RETURNING * INTO p;
        PERFORM ops.fn_avisar((SELECT array_agg(id) FROM seg.usuario WHERE aprueba_fondos AND activo),
            'ff:' || p.id || ':pedido', 'Pedido de FF Chofer para autorizar', fin.fn_texto_pedido(p) || coalesce(' · Operaciones: ' || p.nota_revision, ''),
            '/liquidaciones/fondos?vista=pedidos', false);
    ELSE
        IF length(btrim(coalesce(p_nota, ''))) < 3 THEN RAISE EXCEPTION 'Escribí por qué se rechaza' USING ERRCODE = '22023'; END IF;
        UPDATE fin.pedido_fondo SET estado = 'rechazado', resuelto_por = v_usr, resuelto_en = now(), motivo = left(btrim(p_nota), 500),
               elevado_por = v_usr, elevado_en = now()
         WHERE id = p.id RETURNING * INTO p;
        PERFORM ops.fn_avisar(ARRAY[p.pedido_por], 'ff:' || p.id || ':rechazado', 'Pedido de dinero rechazado',
            fin.fn_texto_pedido(p) || ' · ' || p.motivo, '/mi-viaje?ver=gastos', false);
    END IF;
    RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'estado', p.estado);
END $f$;

-- 4 · Pagar: entrega al chofer + egreso de la cuenta elegida (sin control de permisos: lo llaman las de abajo)
CREATE FUNCTION fin.fn_pedido_fondo_registrar_pago(p_pedido bigint, p_cuenta bigint, p_medio text, p_fecha date, p_monto_cuenta numeric,
                                                   p_ruta text, p_nombre text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p fin.pedido_fondo%ROWTYPE; cd fin.cuenta_dinero%ROWTYPE; v record; v_mov bigint; v_numero text; v_monto numeric;
BEGIN
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p_pedido FOR UPDATE;
    IF p_medio IS NULL OR p_medio NOT IN ('transferencia', 'deposito', 'efectivo') THEN
        RAISE EXCEPTION 'Elegí el medio de pago (transferencia, depósito o efectivo)' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO cd FROM fin.cuenta_dinero WHERE id = p_cuenta AND activa AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí de qué cuenta sale la plata' USING ERRCODE = '22023'; END IF;
    IF p_medio = 'efectivo' AND cd.tipo <> 'caja' THEN
        RAISE EXCEPTION 'En efectivo, la plata sale de una caja: elegí una caja' USING ERRCODE = '22023';
    END IF;
    IF p_medio <> 'efectivo' AND cd.tipo = 'caja' THEN
        RAISE EXCEPTION 'Una transferencia o un depósito sale de un banco: elegí un banco' USING ERRCODE = '22023';
    END IF;
    IF p_ruta IS NOT NULL AND (p_ruta !~ ('^fondos/' || p_pedido || '/[A-Za-z0-9_.-]+$') OR length(p_ruta) > 300) THEN
        RAISE EXCEPTION 'El comprobante no es válido' USING ERRCODE = '22023';
    END IF;
    -- Cuánto salió de la cuenta: en la misma moneda es el importe; en otra moneda hay que escribirlo
    IF cd.moneda = p.moneda THEN
        IF p_monto_cuenta IS NOT NULL AND round(p_monto_cuenta, 2) <> p.importe THEN
            RAISE EXCEPTION 'La cuenta es en %, igual que el fondo: sale el mismo importe (%)', cd.moneda, p.importe USING ERRCODE = '22023';
        END IF;
        v_monto := p.importe;
    ELSE
        IF p_monto_cuenta IS NULL OR p_monto_cuenta <= 0 THEN
            RAISE EXCEPTION 'El fondo es en % y la cuenta % es en %: escribí cuánto salió de la cuenta (en %)', p.moneda, cd.nombre, cd.moneda, cd.moneda
                USING ERRCODE = '22023';
        END IF;
        v_monto := p_monto_cuenta;
    END IF;
    -- La entrega al chofer (fondo por rendir), con su viaje
    PERFORM fin.fn_validar_movimiento(p.chofer_id, p.moneda, p.importe, p_fecha);
    SELECT * INTO v FROM fin.fn_viaje_en(p.chofer_id, p_fecha);
    v_mov := fin.fn_insertar_movimiento(p.chofer_id, 'entrega', p_fecha, p.moneda, p.importe, 'registrado',
                 left('FF Chofer ' || p.numero || ': ' || p.detalle, 500),
                 jsonb_build_object('viaje_id', v.viaje_id, 'camion_id', coalesce(v.camion_id, p.camion_id)));
    -- El egreso de la cuenta (así el saldo del banco o la caja es el real); el movimiento de dinero lleva el asiento
    SELECT numero INTO v_numero FROM fin.movimiento_fondo_chofer WHERE id = v_mov;
    PERFORM fin.fn_movimiento_de_origen('fondo', v_mov, 'egreso', p_fecha, cd.id, v_monto, fin.fn_cuenta_uso('FONDOS_CHOFERES'),
        v_numero || ' · Fondo entregado a ' || ops.fn_nombre_chofer(p.chofer_id) || ' · ' || p.numero
        || ' · ' || CASE p_medio WHEN 'transferencia' THEN 'transferencia' WHEN 'deposito' THEN 'depósito' ELSE 'efectivo' END,
        'chofer', p.chofer_id);
    PERFORM fin.fn_contabilizar_fondo(v_mov);
    UPDATE fin.pedido_fondo
       SET estado = 'depositado', depositado_por = aud.fn_usuario_actual(), depositado_en = now(), fecha_deposito = p_fecha,
           movimiento_id = v_mov, comprobante_ruta = p_ruta, comprobante_nombre = left(nullif(btrim(p_nombre), ''), 200),
           medio_pago = p_medio, cuenta_dinero_id = cd.id, monto_cuenta = CASE WHEN cd.moneda <> p.moneda THEN round(v_monto, 2) END
     WHERE id = p.id RETURNING * INTO p;
    PERFORM ops.fn_avisar(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[p.pedido_por] || ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = p.chofer_id AND u.activo)) x
                                WHERE x IS NOT NULL),
        'ff:' || p.id || ':depositado', 'Dinero del viaje enviado',
        fin.fn_texto_pedido(p) || ' · ' || CASE p_medio WHEN 'efectivo' THEN 'en efectivo' WHEN 'deposito' THEN 'por depósito' ELSE 'por transferencia' END
        || ' el ' || to_char(p_fecha, 'DD/MM'), '/mi-viaje?ver=gastos', false);
    RETURN v_mov;
END $f$;

-- 5 · Gerencia autoriza (monto, cuenta y medio) y queda pagado
CREATE FUNCTION fin.fn_autorizar_pedido_fondo(p_pedido bigint, p_importe numeric, p_cuenta bigint, p_medio text, p_fecha date,
                                              p_monto_cuenta numeric DEFAULT NULL, p_nota text DEFAULT NULL, p_ruta text DEFAULT NULL, p_nombre text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p fin.pedido_fondo%ROWTYPE; v_cierres jsonb; v_lista text; v_mov bigint;
BEGIN
    IF NOT fin.fn_puedo_aprobar_fondos() THEN
        RAISE EXCEPTION 'No estás habilitado para autorizar el FF Chofer: lo habilita TI en Configuración › Usuarios («Aprueba fondos»)' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p_pedido FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.estado = 'solicitado' THEN RAISE EXCEPTION 'El pedido % todavía no lo revisó Operaciones', p.numero USING ERRCODE = '55000'; END IF;
    IF p.estado <> 'pendiente' THEN RAISE EXCEPTION 'El pedido % ya está %', p.numero, p.estado USING ERRCODE = '55000'; END IF;
    IF p_importe IS NULL OR p_importe <= 0 OR p_importe >= 1e11 THEN RAISE EXCEPTION 'Escribí el monto que se autoriza' USING ERRCODE = '22023'; END IF;
    IF length(btrim(coalesce(p_nota, ''))) > 500 THEN RAISE EXCEPTION 'La nota tiene más de 500 letras' USING ERRCODE = '22023'; END IF;
    v_cierres := fue.fn_cierres_sin_cerrar_chofer(p.chofer_id);
    IF jsonb_array_length(v_cierres) > 0 THEN
        SELECT string_agg((e ->> 'numero') || ' (' || (e ->> 'motivo') || ')', ', ') INTO v_lista FROM jsonb_array_elements(v_cierres) e;
        RAISE EXCEPTION 'No se puede autorizar: el chofer tiene cierres de viaje pendientes: %. Primero hay que aprobarlos y subir el acta firmada', v_lista
            USING ERRCODE = '55000';
    END IF;
    UPDATE fin.pedido_fondo
       SET importe_solicitado = CASE WHEN round(p_importe, 2) <> importe THEN importe END, importe = round(p_importe, 2),
           estado = 'aprobado', resuelto_por = aud.fn_usuario_actual(), resuelto_en = now(), motivo = nullif(btrim(p_nota), '')
     WHERE id = p.id;
    v_mov := fin.fn_pedido_fondo_registrar_pago(p.id, p_cuenta, p_medio, p_fecha, p_monto_cuenta, p_ruta, p_nombre);
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p.id;
    RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'estado', p.estado, 'importe', p.importe, 'movimiento_id', v_mov);
END $f$;

-- 6 · Los aprobados con el sistema anterior: se pagan igual (quien autoriza, o RRHH/Finanzas que depositaban)
CREATE FUNCTION fin.fn_pagar_pedido_fondo(p_pedido bigint, p_cuenta bigint, p_medio text, p_fecha date, p_monto_cuenta numeric DEFAULT NULL,
                                          p_ruta text DEFAULT NULL, p_nombre text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE p fin.pedido_fondo%ROWTYPE; v_mov bigint;
BEGIN
    IF NOT (fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos()) THEN
        RAISE EXCEPTION 'El pago del FF Chofer lo registra quien autoriza fondos (o Finanzas)' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO p FROM fin.pedido_fondo WHERE id = p_pedido FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'El pedido no existe' USING ERRCODE = 'P0002'; END IF;
    IF p.estado <> 'aprobado' THEN RAISE EXCEPTION 'El pedido % está %: solo se paga uno aprobado', p.numero, p.estado USING ERRCODE = '55000'; END IF;
    v_mov := fin.fn_pedido_fondo_registrar_pago(p.id, p_cuenta, p_medio, p_fecha, p_monto_cuenta, p_ruta, p_nombre);
    RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'estado', 'depositado', 'movimiento_id', v_mov);
END $f$;

-- 7 · La lista y la anulación conocen el estado «solicitado» (cambios por texto exacto)
CREATE FUNCTION pg_temp.cambiar(p_fn regprocedure, p_ancla text, p_nuevo text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text := pg_get_functiondef(p_fn);
BEGIN
    IF (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla) <> 1 THEN
        RAISE EXCEPTION 'No encontré el texto esperado en %: avisar antes de seguir («%»)', p_fn, left(p_ancla, 80);
    END IF;
    EXECUTE replace(v_def, p_ancla, p_nuevo);
END $f$;
CREATE FUNCTION pg_temp.cambiar_varios(p_fn regprocedure, p_pares text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text := pg_get_functiondef(p_fn); i int;
BEGIN
    FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
        IF (length(v_def) - length(replace(v_def, p_pares[2*i-1], ''))) / length(p_pares[2*i-1]) <> 1 THEN
            RAISE EXCEPTION 'No encontré el texto esperado en %: avisar antes de seguir («%»)', p_fn, left(p_pares[2*i-1], 80);
        END IF;
        v_def := replace(v_def, p_pares[2*i-1], p_pares[2*i]);
    END LOOP;
    EXECUTE v_def;
END $f$;

SELECT pg_temp.cambiar('fin.fn_anular_pedido_fondo(bigint,text)'::regprocedure,
    'IF p.estado NOT IN (''pendiente'', ''aprobado'') THEN',
    'IF p.estado NOT IN (''solicitado'', ''pendiente'', ''aprobado'') THEN');

SELECT pg_temp.cambiar_varios('fin.fn_pedidos_fondo(boolean)'::regprocedure, ARRAY[
    '''puede'', jsonb_build_object(''pedir'', v_pide, ''aprobar'', v_aprueba, ''depositar'', v_deposita),',
    '''puede'', jsonb_build_object(''pedir'', v_pide, ''aprobar'', v_aprueba, ''depositar'', v_deposita, ''revisar'', v_pide),
        -- Migración 278: las cuentas de donde puede salir la plata (para quien autoriza o paga)
        ''cuentas'', CASE WHEN v_aprueba OR v_deposita THEN coalesce((SELECT jsonb_agg(jsonb_build_object(''id'', c.id, ''nombre'', c.nombre, ''tipo'', c.tipo, ''moneda'', c.moneda) ORDER BY c.nombre)
                                                     FROM fin.cuenta_dinero c WHERE c.activa AND c.eliminado_en IS NULL), ''[]'') ELSE ''[]''::jsonb END,',
    '''comprobante_ruta'', p.comprobante_ruta, ''comprobante_nombre'', p.comprobante_nombre,',
    '''comprobante_ruta'', p.comprobante_ruta, ''comprobante_nombre'', p.comprobante_nombre,
                       ''importe_solicitado'', p.importe_solicitado, ''pedido_por_chofer'', p.pedido_por_chofer, ''elevado_por'', ue.nombre,
                       ''elevado_en'', p.elevado_en, ''nota_revision'', p.nota_revision, ''medio_pago'', p.medio_pago,
                       ''cuenta'', (SELECT c.nombre FROM fin.cuenta_dinero c WHERE c.id = p.cuenta_dinero_id), ''monto_cuenta'', p.monto_cuenta,',
    'CASE WHEN p.estado = ''pendiente'' THEN fue.fn_cierres_sin_cerrar_chofer(p.chofer_id)',
    'CASE WHEN p.estado IN (''solicitado'', ''pendiente'') THEN fue.fn_cierres_sin_cerrar_chofer(p.chofer_id)',
    '''puede_anular'', p.estado IN (''pendiente'', ''aprobado'')',
    '''puede_anular'', p.estado IN (''solicitado'', ''pendiente'', ''aprobado'')',
    'ORDER BY CASE p.estado WHEN ''pendiente'' THEN 0 WHEN ''aprobado'' THEN 1 ELSE 2 END',
    'ORDER BY CASE p.estado WHEN ''solicitado'' THEN 0 WHEN ''pendiente'' THEN 1 WHEN ''aprobado'' THEN 2 ELSE 3 END',
    'LEFT JOIN seg.usuario ud ON ud.id = p.depositado_por',
    'LEFT JOIN seg.usuario ud ON ud.id = p.depositado_por
              LEFT JOIN seg.usuario ue ON ue.id = p.elevado_por',
    'WHERE p.estado IN (''pendiente'', ''aprobado'') OR p_todos',
    'WHERE p.estado IN (''solicitado'', ''pendiente'', ''aprobado'') OR p_todos']);

-- 8 · Permisos
--   · el chofer: como fin.fn_subir_gasto_verificado (lo que ya usa desde su perfil)
--   · revisar: como fin.fn_pedir_fondo (Operaciones)
--   · autorizar y pagar: como fin.fn_resolver_pedido_fondo, y además el rol de base de Gerencia y de cada usuario con
--     «Aprueba fondos» (la base igual exige la marca)
--   · registrar el pago por dentro: nadie
DO $do$
DECLARE r record; v_mal text;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_pedir_fondo_chofer(text, numeric, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_mis_pedidos_fondo() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_revisar_pedido_fondo(bigint, boolean, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedido_fondo_registrar_pago(bigint, bigint, text, date, numeric, text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_autorizar_pedido_fondo(bigint, numeric, bigint, text, date, numeric, text, text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pagar_pedido_fondo(bigint, bigint, text, date, numeric, text, text) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pedir_fondo_chofer(text, numeric, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_mis_pedidos_fondo() TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_pedir_fondo(bigint,text,numeric,text)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_revisar_pedido_fondo(bigint, boolean, text) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_resolver_pedido_fondo(bigint,boolean,text)', 'EXECUTE')
           OR r.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE codigo = 'gerencia' AND rol_bd IS NOT NULL)
           OR r.rolname IN (SELECT seg.fn_rol_bd(u.id) FROM seg.usuario u WHERE u.aprueba_fondos AND u.activo) THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_autorizar_pedido_fondo(bigint, numeric, bigint, text, date, numeric, text, text, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pagar_pedido_fondo(bigint, bigint, text, date, numeric, text, text) TO %I', r.rolname);
            -- Rechazar también lo hace quien autoriza
            IF NOT has_function_privilege(r.rolname, 'fin.fn_resolver_pedido_fondo(bigint,boolean,text)', 'EXECUTE') THEN
                EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_resolver_pedido_fondo(bigint, boolean, text) TO %I', r.rolname);
            END IF;
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_depositar_pedido_fondo(bigint,date,text,text)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pagar_pedido_fondo(bigint, bigint, text, date, numeric, text, text) TO %I', r.rolname);
        END IF;
    END LOOP;
    -- Cada usuario con «Aprueba fondos» tiene que poder autorizar desde la web
    SELECT string_agg(u.nombre, ', ') INTO v_mal FROM seg.usuario u
     WHERE u.aprueba_fondos AND u.activo AND seg.fn_rol_bd(u.id) IS NOT NULL
       AND NOT has_function_privilege(seg.fn_rol_bd(u.id), 'fin.fn_autorizar_pedido_fondo(bigint,numeric,bigint,text,date,numeric,text,text,text)', 'EXECUTE');
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'No quedó el permiso para autorizar de: %', v_mal; END IF;
    -- El chofer tiene que poder pedir (si existe el rol de los choferes)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tc_chofer')
       AND has_function_privilege('tc_chofer', 'fin.fn_subir_gasto_verificado(text,text,numeric,date,text,text,text,text,text,numeric,numeric,bigint)', 'EXECUTE')
       AND NOT has_function_privilege('tc_chofer', 'fin.fn_pedir_fondo_chofer(text,numeric,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'No quedó el permiso del chofer para pedir dinero';
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '278' WHERE codigo = 'web.version_base' AND valor::text::int < 278;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 278 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(nombre, ', ') FROM seg.usuario WHERE aprueba_fondos AND activo) AS autorizan_fondos;
