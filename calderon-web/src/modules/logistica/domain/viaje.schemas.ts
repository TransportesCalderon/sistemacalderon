import { z } from 'zod';

/** Formularios de Logística: solo forma. Las reglas (equipo disponible, orden de los pasos…) las aplica la base. */
const id = (mensaje: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, mensaje);
const idOpcional = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === '' || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí una opción.');
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));
/** Instante ya convertido a ISO por el formulario (vacío = null). */
const instante = z
  .string()
  .nullable()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'Fecha y hora no válidas.');
const instanteObligatorio = (mensaje: string) => instante.refine((v) => v !== null, mensaje);
const odometro = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Kilómetros, número de 0 en adelante.');
const tramo = z.number().int().positive();

const equipo = {
  semiId: id('Elegí el semi.'),
  camionId: id('Elegí el tractor.'),
  choferId: id('Elegí el chofer.'),
  origenId: id('Elegí el origen.'),
  destinoId: id('Elegí el destino.'),
  observacion: texto(500),
};

const carga = {
  clienteId: id('Elegí el cliente.'),
  producto: texto(200),
  contenedor: texto(20),
  taraMaxDias: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 3650), 'Días, entero mayor que cero.'),
  fechaCarga: instanteObligatorio('Indicá la fecha de carga.'),
  fechaDescarga: instante,
};

export const asignarViajeSchema = z.object({ ...equipo, ...carga });
export type AsignarViajeEntrada = z.input<typeof asignarViajeSchema>;
export type AsignarViajeDatos = z.output<typeof asignarViajeSchema>;

export const modificarViajeSchema = z.object({ tramoId: tramo, ...equipo, ...carga, clienteId: idOpcional });
export type ModificarViajeDatos = z.output<typeof modificarViajeSchema>;

export const vueltaVaciaSchema = z.object({ ...equipo, fecha: instanteObligatorio('Indicá la fecha de salida.') });
export type VueltaVaciaDatos = z.output<typeof vueltaVaciaSchema>;

export const reprogramarSchema = z.object({ tramoId: tramo, fechaDescarga: instante });
export const cambiarChoferSchema = z.object({ tramoId: tramo, choferId: id('Elegí el chofer.'), desde: instante });
export const cancelarSchema = z.object({ tramoId: tramo, motivo: z.string().trim().min(1, 'Indicá el motivo.').max(500) });

/** Pasos del viaje: fecha y hora (vacío = ahora), lugar y odómetro opcionales (sin odómetro, la base usa la telemetría). */
export const pasoSchema = z.object({
  tramoId: tramo,
  paso: z.enum(['salir', 'iniciar_carga', 'terminar_carga', 'iniciar_descarga', 'terminar_descarga', 'terminar_viaje']),
  momento: instante,
  lugarId: idOpcional,
  odometroKm: odometro,
});
export type PasoDatos = z.output<typeof pasoSchema>;
export type PasoViaje = PasoDatos['paso'];
