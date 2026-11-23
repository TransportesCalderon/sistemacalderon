'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * 23/11/2026 · Radios TYT IP-78 (Android 9): con un Chrome viejo, partes de la pantalla se ven mal
 * (el menú lateral no se cerraba). Si el navegador no entiende los colores modernos (Chrome anterior
 * a la 111), se avisa que hay que actualizar Chrome desde Play Store.
 */
export function AvisoNavegadorViejo() {
  const [viejo, setViejo] = useState(false);

  useEffect(() => {
    try {
      setViejo(typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', 'oklch(50% 0.1 100)'));
    } catch {
      setViejo(false);
    }
  }, []);

  if (!viejo) return null;
  return (
    <div className="flex items-start gap-2 border-b border-borde bg-alerta-suave px-4 py-2 text-sm text-alerta" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">
        El navegador (Chrome) está desactualizado: actualizalo desde <b>Play Store</b> para que IronTrack se vea bien.
      </p>
      <button type="button" onClick={() => setViejo(false)} className="rounded-md p-0.5 hover:bg-hover" aria-label="Cerrar el aviso">
        <X className="size-4" />
      </button>
    </div>
  );
}
