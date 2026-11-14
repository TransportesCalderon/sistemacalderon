-- =============================================================================
-- Migración 262 · Permiso de escritura en ops.pizarra_espera
-- -----------------------------------------------------------------------------
-- Problema: desde la 261, al marcar «Entregó» la base anota la espera en
-- ops.pizarra_espera. La tabla quedó solo con permiso de lectura (se copiaron los
-- de ops.desenganche), pero la escriben funciones que corren con el usuario
-- (ops.fn_terminar_descarga y ops.fn_pizarra_pasar_siguiente). Resultado:
-- «No tenés permiso para esta acción» al entregar y al dar el OK en la Pizarra.
--
-- Arreglo: dar INSERT y UPDATE a los mismos roles que ya pueden modificar
-- ops.servicio_comercial (la tabla que esas mismas funciones ya escriben).
-- No cambia funciones ni datos. Se puede correr más de una vez.
-- =============================================================================
BEGIN;

DO $do$
DECLARE g text; n int := 0;
BEGIN
    FOR g IN SELECT DISTINCT quote_ident(pg_get_userbyid(x.grantee))
               FROM pg_class c, aclexplode(c.relacl) x
              WHERE c.oid = 'ops.servicio_comercial'::regclass
                AND x.privilege_type = 'UPDATE' AND x.grantee <> 0 AND x.grantee <> c.relowner LOOP
        EXECUTE format('GRANT INSERT, UPDATE ON ops.pizarra_espera TO %s', g);
        n := n + 1;
    END LOOP;
    IF n = 0 THEN
        RAISE EXCEPTION 'Ningún rol tiene UPDATE sobre ops.servicio_comercial: avisar antes de seguir';
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '262' WHERE codigo = 'web.version_base' AND valor::text::int < 262;

COMMIT;

-- Comprobación: tiene que aparecer al menos un rol con INSERT y UPDATE
SELECT pg_get_userbyid(x.grantee) AS rol, string_agg(x.privilege_type, ', ' ORDER BY x.privilege_type) AS permisos
  FROM pg_class c, aclexplode(c.relacl) x
 WHERE c.oid = 'ops.pizarra_espera'::regclass AND x.grantee <> c.relowner
 GROUP BY 1 ORDER BY 1;
