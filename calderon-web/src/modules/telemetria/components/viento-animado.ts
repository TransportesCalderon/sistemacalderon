import type { Map as MapaLeaflet } from 'leaflet';
import { colorEscalaViento, vientoEn, type GrillaViento } from '../domain/clima.types';

/**
 * Migración 182 · Viento animado (como Ventusky): un fondo con la escala de la fuerza del viento y
 * trazos blancos que corren con el viento (más rápidos cuanto más fuerte sopla). Se dibuja en un lienzo dentro de la capa «clima» del mapa
 * (debajo de los camiones); al mover o hacer zoom se frena y vuelve a arrancar. Devuelve cómo detenerlo.
 */
export function iniciarVientoAnimado(m: MapaLeaflet, grilla: GrillaViento, conFondo = true): () => void {
  const pane = m.getPane('clima');
  if (!pane || typeof document === 'undefined') return () => undefined;
  const crear = () => {
    const c = document.createElement('canvas');
    c.style.position = 'absolute';
    c.style.pointerEvents = 'none';
    pane.appendChild(c);
    return c;
  };
  const fondo = crear();
  const lienzo = crear();
  const ctx = lienzo.getContext('2d');
  const ctxFondo = fondo.getContext('2d');
  if (!ctx || !ctxFondo) {
    fondo.remove();
    lienzo.remove();
    return () => undefined;
  }

  /** El fondo: la fuerza del viento en cada lugar (cuadritos de 8 px, suavizados). */
  const pintarFondo = () => {
    if (!conFondo) return;
    const P = 8;
    const ch = Math.ceil(ancho / P), cv = Math.ceil(alto / P);
    const img = ctxFondo.createImageData(ch, cv);
    for (let j = 0; j < cv; j++)
      for (let i = 0; i < ch; i++) {
        const ll = m.containerPointToLatLng([i * P + P / 2, j * P + P / 2]);
        const w = vientoEn(grilla, ll.lat, ll.lng);
        const k = (j * ch + i) * 4;
        if (!w) continue;
        const [r, g, b] = colorEscalaViento(Math.hypot(w.u, w.v));
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = 130;
      }
    const chico = document.createElement('canvas');
    chico.width = ch;
    chico.height = cv;
    chico.getContext('2d')?.putImageData(img, 0, 0);
    ctxFondo.clearRect(0, 0, ancho, alto);
    ctxFondo.imageSmoothingEnabled = true;
    ctxFondo.drawImage(chico, 0, 0, ch * P, cv * P);
  };

  type Particula = { x: number; y: number; edad: number };
  let particulas: Particula[] = [];
  let ancho = 0, alto = 0, cuadro = 0, activo = true;
  const EDAD_MAX = 80;
  const nueva = (): Particula => ({ x: Math.random() * ancho, y: Math.random() * alto, edad: Math.floor(Math.random() * EDAD_MAX) });

  const ubicar = () => {
    const t = m.getSize();
    ancho = t.x;
    alto = t.y;
    const esquina = m.containerPointToLayerPoint([0, 0]);
    for (const c of [fondo, lienzo]) {
      c.width = ancho;
      c.height = alto;
      c.style.transform = `translate(${esquina.x}px, ${esquina.y}px)`;
    }
    pintarFondo();
    particulas = Array.from({ length: Math.min(1800, Math.round((ancho * alto) / 900)) }, nueva);
  };

  const paso = () => {
    if (!activo) return;
    // Los trazos se van borrando de a poco (estela)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1.3;
    // Sobre el fondo de la escala, trazos blancos; sin fondo, oscuros (para verse sobre el mapa claro)
    ctx.strokeStyle = conFondo ? 'rgba(255,255,255,0.9)' : 'rgba(30,41,59,0.75)';
    for (const p of particulas) {
      const ll = m.containerPointToLatLng([p.x, p.y]);
      const w = vientoEn(grilla, ll.lat, ll.lng);
      p.edad++;
      if (!w || p.edad > EDAD_MAX || p.x < 0 || p.y < 0 || p.x > ancho || p.y > alto) {
        Object.assign(p, nueva(), { edad: 0 });
        continue;
      }
      const nx = p.x + w.u * 0.06, ny = p.y - w.v * 0.06;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx;
      p.y = ny;
    }
    cuadro = requestAnimationFrame(paso);
  };

  const frenar = () => {
    cancelAnimationFrame(cuadro);
    ctx.clearRect(0, 0, ancho, alto);
    lienzo.style.display = 'none';
    fondo.style.display = 'none';
  };
  const arrancar = () => {
    if (!activo) return;
    cancelAnimationFrame(cuadro);
    lienzo.style.display = '';
    fondo.style.display = '';
    ubicar();
    cuadro = requestAnimationFrame(paso);
  };

  m.on('movestart zoomstart', frenar);
  m.on('moveend zoomend resize', arrancar);
  arrancar();

  return () => {
    activo = false;
    cancelAnimationFrame(cuadro);
    m.off('movestart zoomstart', frenar);
    m.off('moveend zoomend resize', arrancar);
    lienzo.remove();
    fondo.remove();
  };
}
