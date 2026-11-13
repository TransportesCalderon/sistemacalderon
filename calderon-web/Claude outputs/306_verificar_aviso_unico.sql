-- =============================================================================
-- IronTrack — Verificación 306 · Cambio 252 (migración 262) · Un solo aviso al teléfono
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 262. NO GUARDA NADA: crea dos usuarios ZZ con un teléfono ZZ,
-- prueba la función única y los dos envoltorios, y termina con un error a propósito
-- («VERIFICACIÓN 306 OK …») que deshace todo. Ningún aviso sale a un teléfono real.
-- =============================================================================
DO $do$
DECLARE
    v_a bigint; v_b bigint; v_c bigint; n int; r record; v_ok text[] := '{}'; v_mal text;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 262 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 262';
    END IF;

    -- A y B con teléfono activo; C sin teléfono
    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_aviso_306_a', 'ZZ Aviso 306 A') RETURNING id INTO v_a;
    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_aviso_306_b', 'ZZ Aviso 306 B') RETURNING id INTO v_b;
    INSERT INTO seg.usuario (login, nombre) VALUES ('zz_aviso_306_c', 'ZZ Aviso 306 C') RETURNING id INTO v_c;
    INSERT INTO ops.push_suscripcion (usuario_id, endpoint, p256dh, auth, dispositivo)
    VALUES (v_a, 'https://zz.invalid/306/a', 'zz', 'zz', 'ZZ 306'), (v_b, 'https://zz.invalid/306/b', 'zz', 'zz', 'ZZ 306');

    -- 1 · Avisa a los que tienen teléfono, y no al que hace la acción
    PERFORM set_config('app.usuario_id', v_a::text, true);
    PERFORM ops.fn_avisar(ARRAY[v_a, v_b, v_c], 'zz306:1', 'ZZ título', 'ZZ cuerpo', '/zz', true);
    SELECT count(*) INTO n FROM ops.push_saliente WHERE clave = 'zz306:1';
    IF n <> 1 THEN RAISE EXCEPTION 'FALLA 1: se esperaba 1 aviso (solo B) y hay %', n; END IF;
    SELECT * INTO r FROM ops.push_saliente WHERE clave = 'zz306:1';
    IF r.usuario_id <> v_b OR r.titulo <> 'ZZ título' OR r.cuerpo <> 'ZZ cuerpo' OR r.url <> '/zz' OR NOT r.urgente OR r.estado <> 'pendiente' THEN
        RAISE EXCEPTION 'FALLA 1: el aviso no salió con los datos pedidos: %', to_jsonb(r);
    END IF;
    v_ok := v_ok || 'avisa solo a quien tiene teléfono y no al que hace la acción'::text;

    -- 2 · No repite la misma clave
    PERFORM ops.fn_avisar(ARRAY[v_b], 'zz306:1', 'ZZ otra vez', 'ZZ', '/zz', false);
    IF (SELECT count(*) FROM ops.push_saliente WHERE clave = 'zz306:1') <> 1 THEN RAISE EXCEPTION 'FALLA 2: repitió un aviso con la misma clave'; END IF;
    v_ok := v_ok || 'no repite la misma clave'::text;

    -- 3 · Cuerpo vacío usa el título; cuerpo largo se corta en 300; dirección y urgencia por defecto
    PERFORM ops.fn_avisar(ARRAY[v_b], 'zz306:3a', 'ZZ solo título', '');
    PERFORM ops.fn_avisar(ARRAY[v_b], 'zz306:3b', 'ZZ largo', repeat('x', 500));
    SELECT * INTO r FROM ops.push_saliente WHERE clave = 'zz306:3a';
    IF r.cuerpo <> 'ZZ solo título' OR r.url <> '/hoy' OR r.urgente THEN RAISE EXCEPTION 'FALLA 3: cuerpo vacío o valores por defecto: %', to_jsonb(r); END IF;
    IF (SELECT length(cuerpo) FROM ops.push_saliente WHERE clave = 'zz306:3b') <> 300 THEN RAISE EXCEPTION 'FALLA 3: el cuerpo largo no se cortó en 300'; END IF;
    v_ok := v_ok || 'cuerpo vacío, corte en 300 y valores por defecto'::text;

    -- 4 · Usuario inactivo o teléfono dado de baja: no se avisa
    UPDATE seg.usuario SET activo = false WHERE id = v_b;
    PERFORM ops.fn_avisar(ARRAY[v_b], 'zz306:4a', 'ZZ', 'ZZ');
    UPDATE seg.usuario SET activo = true WHERE id = v_b;
    UPDATE ops.push_suscripcion SET activa = false WHERE usuario_id = v_b;
    PERFORM ops.fn_avisar(ARRAY[v_b], 'zz306:4b', 'ZZ', 'ZZ');
    UPDATE ops.push_suscripcion SET activa = true WHERE usuario_id = v_b;
    PERFORM ops.fn_avisar(NULL, 'zz306:4c', 'ZZ', 'ZZ');
    IF EXISTS (SELECT 1 FROM ops.push_saliente WHERE clave LIKE 'zz306:4%') THEN RAISE EXCEPTION 'FALLA 4: avisó a un usuario inactivo, a un teléfono dado de baja o a una lista vacía'; END IF;
    v_ok := v_ok || 'no avisa a inactivos ni a teléfonos dados de baja'::text;

    -- 5 · Los dos envoltorios siguen funcionando igual que antes
    PERFORM fin.fn_avisar_fondo(ARRAY[v_b], 'zz306:5a', 'ZZ FF', 'ZZ pedido');
    PERFORM tel.fn_avisar_pedido_carga(ARRAY[v_b], 'zz306:5b', 'ZZ carga', 'ZZ solicitud', '/telemetria/seguimiento', false);
    IF (SELECT url FROM ops.push_saliente WHERE clave = 'zz306:5a') IS DISTINCT FROM '/liquidaciones/fondos?vista=pedidos'
       OR (SELECT url FROM ops.push_saliente WHERE clave = 'zz306:5b') IS DISTINCT FROM '/telemetria/seguimiento' THEN
        RAISE EXCEPTION 'FALLA 5: los envoltorios no dejaron el aviso con su dirección';
    END IF;
    v_ok := v_ok || 'los dos envoltorios funcionan'::text;

    -- 6 · Las siete funciones usan la única, con la dirección que corresponde
    SELECT string_agg(x.f, ', ') INTO v_mal
      FROM (VALUES ('fin', 'fn_pedir_fondo', 1, '/liquidaciones/fondos?vista=pedidos'), ('fin', 'fn_resolver_pedido_fondo', 2, '/liquidaciones/fondos?vista=pedidos'),
                   ('fin', 'fn_depositar_pedido_fondo', 1, '/liquidaciones/fondos?vista=pedidos'), ('fin', 'fn_subir_gasto_verificado', 1, '''/liquidaciones/fondos'', true'),
                   ('tel', 'fn_pedir_carga', 1, 'pedido_carga:'), ('fue', 'fn_aprobar_solicitud_carga', 1, '/telemetria/seguimiento'),
                   ('fue', 'fn_rechazar_solicitud_carga', 1, '/telemetria/seguimiento')) AS e(esq, nom, veces, texto)
      CROSS JOIN LATERAL (SELECT e.esq || '.' || e.nom AS f, p.prosrc FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                           WHERE ns.nspname = e.esq AND p.proname = e.nom) x
     WHERE (length(x.prosrc) - length(replace(x.prosrc, 'ops.fn_avisar(', ''))) / length('ops.fn_avisar(') <> e.veces
        OR position(e.texto IN x.prosrc) = 0
        OR x.prosrc LIKE '%INSERT INTO ops.push_saliente%' OR x.prosrc LIKE '%fn_avisar_fondo(%' OR x.prosrc LIKE '%fn_avisar_pedido_carga(%';
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'FALLA 6: no quedaron como se esperaba: %', v_mal; END IF;
    v_ok := v_ok || 'las siete funciones usan la única'::text;

    RAISE EXCEPTION 'VERIFICACIÓN 306 OK (no se guardó nada): %', array_to_string(v_ok, ' · ');
END $do$;
