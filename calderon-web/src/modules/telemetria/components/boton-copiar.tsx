'use client';

import { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';

/** Copia el mensaje para pegarlo en WhatsApp (migraciones 194 y 195). */
export function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={BOTON_SECUNDARIO}
      onClick={() =>
        void navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        })
      }
    >
      {copiado ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copiado ? 'Copiado' : 'Copiar mensaje'}
    </button>
  );
}
