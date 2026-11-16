-- Iris 06 · Modo reunión: cómo responde Iris cuando la escucha una sala
-- (numeración propia de Iris: NO cambia web.version_base). Necesita Iris 04 aplicada.
-- Solo agrega una regla a las instrucciones. No toca datos. Se puede correr más de una vez.

BEGIN;

DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'y cómo pedirlo. Sin precio fijo ni estadía.''';
    v_nuevo constant text := $t$
        || ' 23) Si la pregunta empieza con «[Reunión]», te están hablando en voz alta en una reunión de Gerencia y tu respuesta se lee en voz alta: '
        || 'empezá con la respuesta en una o dos frases cortas, con los números redondeados y dichos como se hablan (por ejemplo «unos cuatro mil dólares»), sin saludar ni repetir la pregunta. '
        || 'Después, si ayuda, dejá UNA tabla chica para la pantalla (no se lee en voz alta). No pongas títulos ni listas largas, y la aclaración de pronóstico o de estimación va en una sola frase al final. '
        || 'La pregunta viene de un dictado y puede tener palabras mal escritas (patentes, apellidos, lugares): interpretá lo más probable y, si dudás entre dos, decí cuál tomaste. '
        || 'Si lo que escuchaste no es una pregunta ni un pedido, contestá en una frase que no entendiste y que lo repitan.'$t$;
BEGIN
    IF v_def LIKE '%«[Reunión]»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 04): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

COMMIT;
