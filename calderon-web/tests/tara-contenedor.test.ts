import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { numeroAPunto } from '@/modules/logistica/repositories/operaciones.repository';

const repo = readFileSync('src/modules/logistica/repositories/operaciones.repository.ts', 'utf8');
const pantalla = readFileSync('src/modules/logistica/components/operaciones-pantalla.tsx', 'utf8');

describe('tara del contenedor (migración 172)', () => {
  it('se manda a la base como tara_contenedor_kg, en número con punto', () => {
    expect(repo).toContain('tara_contenedor_kg: numeroAPunto(d.taraContenedorKg)');
    expect(numeroAPunto('3.850,5')).toBe('3850.5');
    expect(numeroAPunto('4800')).toBe('4800');
  });
  it('el campo «Tara CNTR» va al lado del peso bruto', () => {
    const peso = pantalla.indexOf('label="Peso bruto (kg)"');
    const tara = pantalla.indexOf('label="Tara CNTR (kg)"');
    expect(peso).toBeGreaterThan(0);
    expect(tara).toBeGreaterThan(peso);
    expect(pantalla.slice(peso, tara)).not.toContain('<Campo label=');
  });
});
