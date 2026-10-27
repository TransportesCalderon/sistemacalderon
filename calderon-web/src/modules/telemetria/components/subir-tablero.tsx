'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, LoaderCircle, RotateCcw, Sparkles, TriangleAlert, X } from 'lucide-react';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { leerTableroChofer, leerTableroOficina } from '@/modules/ia/ia.actions';
import { iaRepository } from '@/modules/ia/ia.repository';
import { cn } from '@/shared/lib/cn';
import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { guardarTableroChofer, guardarTableroOficina } from '../actions/tablero.actions';
import { CAMPOS_TABLERO, horasATexto, textoAHoras, type DatosTablero } from '../domain/tablero.types';
import { tableroRepository } from '../repositories/tablero.repository';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const CONTROL =
  'w-full rounded-md border border-borde bg-panel px-3 py-2 text-right text-sm text-tinta tabular-nums outline-none focus:border-marca focus:ring-2 focus:ring-marca/20';

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Foto = { clave: string; nombre: string; vista: string; estado: 'subiendo' | 'leyendo' | 'lista' | 'error'; error?: string; ruta?: string; hash?: string; lectura?: number };

/**
 * Fotos del tablero del camión (migración 88): se suben como respaldo, la IA lee cada una y la base
 * junta lo leído. La persona revisa, corrige si hace falta y guarda. Sin IA activada, se completa a mano.
 */
export function SubirTablero({ camionId, modo, carpeta, onGuardado }: { camionId: number; modo: 'chofer' | 'oficina'; carpeta: string; onGuardado?: () => void }) {
  const ia = useQuery({ queryKey: ['ia', 'estado'], queryFn: () => iaRepository(browserDb()).estado(), staleTime: 300_000 });
  const entrada = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [datos, setDatos] = useState<DatosTablero | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const ocupado = fotos.some((f) => f.estado === 'subiendo' || f.estado === 'leyendo');

  const cambiar = (clave: string, c: Partial<Foto>) => setFotos((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...c } : f)));

  const procesar = async (archivo: File, clave: string): Promise<Foto | null> => {
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      const hash = await sha256Hex(blob);
      const ruta = `${carpeta}/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'}`;
      const sub = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (sub.error) throw new Error(`No se pudo subir la foto: ${sub.error.message}`);
      if (!ia.data || !['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) {
        const f = { ruta, hash, estado: 'lista' as const };
        cambiar(clave, f);
        return { clave, nombre: archivo.name, vista: '', ...f };
      }
      cambiar(clave, { ruta, hash, estado: 'leyendo' });
      const accion = modo === 'chofer' ? leerTableroChofer : leerTableroOficina;
      const r = await accion({ tipo: 'tablero_camion', base64: await aBase64(blob), mediaType: tipo as 'image/jpeg' });
      if (!r.ok) throw new Error(r.error.mensaje);
      const repo = iaRepository(browserDb());
      for (let i = 0; i < 60; i++) {
        const res = await repo.resultado(r.data);
        if (res.estado === 'lista') {
          cambiar(clave, { estado: 'lista', lectura: r.data });
          return { clave, nombre: archivo.name, vista: '', ruta, hash, estado: 'lista', lectura: r.data };
        }
        if (res.estado === 'error') throw new Error(res.error ?? 'La IA no pudo leer la foto.');
        await espera(1500);
      }
      throw new Error('La IA no respondió a tiempo.');
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo procesar la foto.';
      cambiar(clave, { estado: 'error', error: mensaje });
      return null;
    }
  };

  const agregar = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    setError(null);
    setListo(false);
    const nuevas: Foto[] = Array.from(lista)
      .slice(0, 8)
      .map((a) => ({ clave: idAleatorio(), nombre: a.name, vista: URL.createObjectURL(a), estado: 'subiendo' }));
    setFotos((fs) => [...fs, ...nuevas]);
    const hechas = await Promise.all(Array.from(lista).slice(0, 8).map((a, i) => procesar(a, nuevas[i]!.clave)));
    // Junta lo leído en todas las fotos listas (la base avisa lo que no cierra)
    const lecturas = [...fotos, ...hechas.filter((f): f is Foto => f !== null)].flatMap((f) => (f.lectura ? [f.lectura] : []));
    if (lecturas.length > 0) {
      try {
        const c = await tableroRepository(browserDb()).combinar(lecturas, camionId);
        setDatos(c.datos);
        setTextos({});
        setAvisos(c.avisos);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo juntar lo leído.');
      }
    } else if (!datos) {
      setDatos({});
    }
  };

  const valor = (clave: keyof DatosTablero, horas?: boolean) =>
    textos[clave] ?? (horas ? horasATexto(datos?.[clave] as number | undefined) : datos?.[clave] === undefined ? '' : String(datos[clave]).replace('.', ','));

  const guardar = async () => {
    if (!datos) return;
    setError(null);
    const final: DatosTablero = { ...datos };
    for (const c of CAMPOS_TABLERO) {
      const t = textos[c.clave];
      if (t === undefined) continue;
      const n = c.horas ? textoAHoras(t) : t.trim() === '' ? null : Number(t.replace(/\./g, '').replace(',', '.'));
      if (n === null) delete final[c.clave];
      else if (!Number.isFinite(n) || n < 0) {
        setError(`Revisá «${c.etiqueta}»: tiene que ser un número.`);
        return;
      } else (final as Record<string, number>)[c.clave] = n;
    }
    setGuardando(true);
    const accion = modo === 'chofer' ? guardarTableroChofer : guardarTableroOficina;
    const r = await accion({
      camionId,
      datos: final,
      lecturas: fotos.flatMap((f) => (f.lectura ? [f.lectura] : [])),
      fotos: fotos.flatMap((f) => (f.ruta ? [{ ruta: f.ruta, hash: f.hash ?? '' }] : [])),
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setListo(true);
    setFotos([]);
    setDatos(null);
    setTextos({});
    setAvisos([]);
    onGuardado?.();
  };

  if (listo) {
    return (
      <div className={cn(TARJETA, 'space-y-3 p-4 text-center')}>
        <CheckCircle2 className="mx-auto size-8 text-exito" />
        <p className="font-medium text-tinta">Listo, quedó guardado.</p>
        <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
          <RotateCcw className="mr-1 inline size-4" /> Ahora tocá <b>«Restablecer»</b> en el tablero del camión para que el próximo viaje arranque de cero.
        </p>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setListo(false)}>
          Cargar otras fotos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          void agregar(e.target.files);
          e.target.value = '';
        }}
      />
      <button type="button" className={cn(BOTON_PRIMARIO, 'w-full py-3 text-base')} onClick={() => entrada.current?.click()} disabled={ocupado || guardando}>
        <Camera className="size-5" /> {fotos.length === 0 ? 'Sacar fotos del tablero' : 'Agregar otra foto'}
      </button>
      {fotos.length === 0 && (
        <p className="text-sm text-tinta-suave">
          Sacá una foto de cada pantalla con los datos del viaje: combustible, horas, km y puntuación de conducción.
          {ia.data ? ' La IA las lee y vos revisás.' : ' Después completás los números.'}
        </p>
      )}

      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.clave} className="relative overflow-hidden rounded-md border border-borde bg-fondo">
              {f.vista ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.vista} alt="Foto del tablero" className="aspect-[3/4] w-full object-cover" />
              ) : (
                <div className="aspect-[3/4] w-full" />
              )}
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-1 py-0.5 text-[11px] font-medium',
                  f.estado === 'error' ? 'bg-error text-white' : f.estado === 'lista' ? 'bg-exito text-white' : 'bg-black/60 text-white',
                )}
                title={f.error}
              >
                {(f.estado === 'subiendo' || f.estado === 'leyendo') && <LoaderCircle className="size-3 animate-spin" />}
                {f.estado === 'subiendo' ? 'Subiendo' : f.estado === 'leyendo' ? 'Leyendo' : f.estado === 'lista' ? 'Lista' : 'Error'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {fotos.some((f) => f.estado === 'error') && (
        <p className="text-sm text-error">{fotos.find((f) => f.estado === 'error')?.error} Podés completar los números a mano.</p>
      )}

      {datos && !ocupado && (
        <div className={cn(TARJETA, 'space-y-3 p-4')}>
          <p className="flex items-center gap-2 text-sm font-semibold text-tinta">
            {fotos.some((f) => f.lectura) && <Sparkles className="size-4 text-marca" />}
            {fotos.some((f) => f.lectura) ? 'Esto leyó la IA: revisalo y corregí si algo está mal' : 'Completá los números del tablero'}
          </p>
          {avisos.length > 0 && (
            <ul className="space-y-1 rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
              {avisos.map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            {CAMPOS_TABLERO.map((c) => (
              <label key={c.clave} className="space-y-1">
                <span className="block text-xs text-tinta-suave">
                  {c.etiqueta} ({c.horas ? 'hh:mm' : c.unidad})
                </span>
                <input
                  inputMode={c.horas ? 'text' : 'decimal'}
                  className={CONTROL}
                  value={valor(c.clave, c.horas)}
                  onChange={(e) => setTextos((t) => ({ ...t, [c.clave]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {datos.partes && Object.keys(datos.partes).length > 0 && (
            <div className="text-sm">
              <p className="text-xs text-tinta-suave">Partes de la puntuación</p>
              <p className="text-tinta">
                {Object.entries(datos.partes)
                  .map(([k, v]) => `${k} ${formatearNumero(v, 0)} %`)
                  .join(' · ')}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className={cn(BOTON_PRIMARIO, 'flex-1')} onClick={() => void guardar()} disabled={guardando}>
              {guardando && <LoaderCircle className="size-4 animate-spin" />} Guardar
            </button>
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              onClick={() => {
                setFotos([]);
                setDatos(null);
                setTextos({});
                setAvisos([]);
                setError(null);
              }}
              disabled={guardando}
              aria-label="Empezar de nuevo"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {error && !datos && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
