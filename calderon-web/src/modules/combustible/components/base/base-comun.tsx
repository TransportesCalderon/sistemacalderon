'use client';

import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_METODO, METODOS_MEDICION } from '../../domain/base.types';

/** Selector del método de medición del tanque. */
export function CampoMetodo({
  valor,
  error,
  onChange,
}: {
  valor: string;
  error: string | undefined;
  onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <Campo label="Cómo se midió *" error={error}>
      <select value={valor} onChange={onChange}>
        {METODOS_MEDICION.map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_METODO[m]}
          </option>
        ))}
      </select>
    </Campo>
  );
}
