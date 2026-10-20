'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DestinoCargaSelector } from '../cargas/destino-carga';
import { RegistroGensetForm } from './registro-genset-form';

/** Combustible > Nueva carga > «Al genset» (migración 48): va aparte del tractor, con chofer y horómetro. */
export function CargaGensetPantalla({ gensetInicial }: { gensetInicial: number | null }) {
  return (
    <div className="space-y-5">
      <Link href="/combustible/cargas" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Cargas
      </Link>
      <header>
        <p className="text-sm text-tinta-suave">Combustible</p>
        <h1 className="text-2xl font-semibold text-tinta">Nueva carga</h1>
      </header>
      <DestinoCargaSelector actual="genset" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        El combustible del genset no cuenta en el viaje del tractor. El chofer que lo carga queda como responsable hasta el próximo llenado o hasta que
        se descargue en la base.
      </p>
      <RegistroGensetForm gensetInicial={gensetInicial} tipoInicial="carga" />
    </div>
  );
}
