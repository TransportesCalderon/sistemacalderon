-- Eliminar un usuario desde Configuración › Usuarios (solo TI)
--   · Borra su cuenta de acceso en Supabase (ya no puede entrar) y le saca todos los roles.
--   · El usuario NO se borra de la base: su nombre queda en el historial (quién cargó, aprobó o pagó cada cosa).
--     Queda marcado como eliminado, con quién, cuándo y por qué, y deja de verse en la lista.
--   · El email queda libre: se puede volver a crear un usuario con ese mismo email.
--   · No se puede eliminar uno mismo, ni dejar el sistema sin un usuario de TI activo.
-- Va después de la 20261125233000. No cambia web.version_base (la web pregunta si existe la función).

ALTER TABLE seg.usuario
    ADD COLUMN IF NOT EXISTS eliminado_en  timestamptz,
    ADD COLUMN IF NOT EXISTS eliminado_por bigint REFERENCES seg.usuario (id),
    ADD COLUMN IF NOT EXISTS motivo_baja   text;

-- Borra la cuenta de acceso en Supabase Auth (API de administración, llave en Vault, como la 192)
CREATE OR REPLACE FUNCTION seg.fn_auth_borrar_cuenta(p_auth uuid, OUT status integer, OUT content text)
RETURNS record
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_url text; v_llave text; v_destino text;
BEGIN
    BEGIN
        EXECUTE $q$SELECT max(decrypted_secret) FILTER (WHERE name = 'supabase_url'),
                          max(decrypted_secret) FILTER (WHERE name = 'supabase_service_role')
                     FROM vault.decrypted_secrets$q$ INTO v_url, v_llave;
    EXCEPTION WHEN OTHERS THEN v_url := NULL;
    END;
    IF nullif(btrim(v_url), '') IS NULL OR nullif(btrim(v_llave), '') IS NULL THEN
        RAISE EXCEPTION 'Faltan en Supabase Vault: supabase_url y supabase_service_role' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'http_get') THEN
        RAISE EXCEPTION 'Falta la extensión http en Supabase (Database > Extensions > http)' USING ERRCODE = '55000';
    END IF;
    BEGIN EXECUTE $q$SELECT http_set_curlopt('CURLOPT_TIMEOUT', '20')$q$; EXCEPTION WHEN OTHERS THEN NULL; END;
    v_destino := rtrim(btrim(v_url), '/') || '/auth/v1/admin/users/' || p_auth::text;
    IF btrim(v_llave) LIKE 'sb\_secret\_%' THEN
        EXECUTE $q$SELECT r.status, r.content FROM http(('DELETE', $1, ARRAY[http_header('apikey', $2)], NULL, NULL)::http_request) r$q$
           INTO status, content USING v_destino, btrim(v_llave);
    ELSE
        EXECUTE $q$SELECT r.status, r.content FROM http(('DELETE', $1,
                        ARRAY[http_header('apikey', $2), http_header('Authorization', 'Bearer ' || $2)], NULL, NULL)::http_request) r$q$
           INTO status, content USING v_destino, btrim(v_llave);
    END IF;
END $f$;
REVOKE ALL ON FUNCTION seg.fn_auth_borrar_cuenta(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION seg.fn_eliminar_usuario(p_usuario bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_ti bigint := aud.fn_usuario_actual(); u seg.usuario%ROWTYPE; r record; j jsonb; v_msg text;
BEGIN
    PERFORM seg.fn_exigir_ti();
    SELECT * INTO u FROM seg.usuario WHERE id = p_usuario FOR UPDATE;
    IF u.id IS NULL OR u.eliminado_en IS NOT NULL THEN RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = 'P0002'; END IF;
    IF u.id = v_ti THEN RAISE EXCEPTION 'No podés eliminarte a vos mismo: que lo haga otro usuario de TI' USING ERRCODE = '42501'; END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
        RAISE EXCEPTION 'Escribí por qué se elimina (por ejemplo: renunció, ya no trabaja en la empresa)' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM seg.usuario x JOIN seg.usuario_rol rr ON rr.usuario_id = x.id AND rr.rol_codigo = 'ti'
                    WHERE x.activo AND x.eliminado_en IS NULL AND x.id <> u.id) THEN
        RAISE EXCEPTION 'Tiene que quedar al menos un usuario de TI activo' USING ERRCODE = '23514';
    END IF;

    -- 1 · La cuenta de acceso (si ya no existe en Supabase, sigue igual)
    IF u.auth_user_id IS NOT NULL THEN
        SELECT * INTO r FROM seg.fn_auth_borrar_cuenta(u.auth_user_id);
        IF r.status NOT BETWEEN 200 AND 299 AND r.status <> 404 THEN
            BEGIN j := r.content::jsonb; EXCEPTION WHEN OTHERS THEN j := NULL; END;
            v_msg := coalesce(j ->> 'msg', j ->> 'message', j ->> 'error_description', j ->> 'error', left(coalesce(r.content, ''), 200));
            RAISE EXCEPTION 'Supabase no borró la cuenta de acceso (HTTP %): %', r.status, v_msg USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- 2 · Sin roles, inactivo, desvinculado y con el email libre (el nombre queda para el historial)
    DELETE FROM seg.usuario_rol WHERE usuario_id = u.id;
    UPDATE seg.usuario
       SET activo = false, auth_user_id = NULL, chofer_id = NULL,
           login = left(coalesce(u.login, 'usuario'), 200) || '#baja-' || u.id,
           aprueba_cierres = false, aviso_tanque_bajo = false, recibe_escalamiento = false,
           aprueba_segundo_nivel = false, autoriza_cargas = false, aprueba_fondos = false,
           eliminado_en = now(), eliminado_por = v_ti, motivo_baja = left(btrim(p_motivo), 300)
     WHERE id = u.id;
END $f$;

-- La lista de Usuarios no muestra los eliminados (parche sobre la definición viva)
DO $m$
DECLARE v_def text; v_nuevo text;
BEGIN
    v_def := pg_get_functiondef('seg.fn_usuarios()'::regprocedure);
    IF position('eliminado_en' IN v_def) > 0 THEN RETURN; END IF;
    v_nuevo := regexp_replace(v_def, 'FROM seg\.usuario u LEFT JOIN auth\.users a ON a\.id = u\.auth_user_id',
                              'FROM seg.usuario u LEFT JOIN auth.users a ON a.id = u.auth_user_id WHERE u.eliminado_en IS NULL', 'g');
    v_nuevo := regexp_replace(v_nuevo, 'FROM seg\.usuario u ORDER BY', 'FROM seg.usuario u WHERE u.eliminado_en IS NULL ORDER BY', 'g');
    IF v_nuevo = v_def THEN RAISE EXCEPTION 'No encontré dónde filtrar en seg.fn_usuarios: avisale a TI'; END IF;
    EXECUTE v_nuevo;
END $m$;

DO $g$
DECLARE g record;
BEGIN
    REVOKE ALL ON FUNCTION seg.fn_eliminar_usuario(bigint, text) FROM PUBLIC;
    FOR g IN SELECT DISTINCT grantee FROM information_schema.routine_privileges
              WHERE routine_schema = 'seg' AND routine_name = 'fn_restablecer_clave' AND privilege_type = 'EXECUTE' AND grantee <> 'PUBLIC' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION seg.fn_eliminar_usuario(bigint, text) TO %I', g.grantee);
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

SELECT 'Listo: TI puede eliminar usuarios desde Configuración › Usuarios' AS resultado;
