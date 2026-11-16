-- Iris 08 · El dictado escribe «$» cuando se dice «dólares»: cómo lo interpreta Iris
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 07 aplicada.
-- Solo agrega una regla a las instrucciones. No toca datos. Se puede correr más de una vez.

BEGIN;

DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'usá la más corta y decí cuál tomaste.''';
    v_nuevo constant text := $t$
        || ' 25) Las preguntas dictadas por voz traen «$» tanto si dijeron dólares como si dijeron pesos: el símbolo solo no dice la moneda. Interpretalo así, sin preguntar: '
        || 'si es un flete, una tarifa, el precio de un viaje, lo que paga un cliente, una ganancia o un costo de viaje, son DÓLARES (USD): en esta empresa los fletes se cobran en dólares; '
        || 'si es el precio del litro de combustible o una carga de combustible, son pesos chilenos (CLP) si es en Chile o pesos argentinos (ARS) si es en Argentina; '
        || 'un sueldo, un canon de chofer o un fondo a rendir, en la moneda en que esté cargado en el sistema. '
        || 'Si el número no cierra con esa moneda (por ejemplo un flete de «$ 3.000.000»), entonces son pesos. '
        || 'En la respuesta escribí siempre la moneda con letras («3.000 USD», «1.630 CLP»), nunca el símbolo «$» solo; al hablar en reunión decí «dólares» o «pesos chilenos».'$t$;
BEGIN
    IF v_def LIKE '%el símbolo solo no dice la moneda%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 07): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

COMMIT;
