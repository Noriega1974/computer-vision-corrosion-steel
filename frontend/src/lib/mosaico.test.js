import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { destinoMedicion, miniaturaDe, etiquetaTestera, etiquetaTesteraLote, nombreCorto, estadoTesteraSubida } from './mosaico.js';

describe('mosaico', () => {
  it('builds the photo route with the point when known', () => {
    assert.equal(destinoMedicion({ id_medicion: 'a b', bloque_id: 'B1' }), '/galeria/a%20b?punto=B1');
    assert.equal(destinoMedicion({ id_medicion: 'x' }, 'P9'), '/galeria/x?punto=P9');
    assert.equal(destinoMedicion({ id_medicion: 'x' }), '/galeria/x');
    assert.equal(destinoMedicion({}), null);
  });

  it('prefers the thumbnail', () => {
    assert.equal(miniaturaDe({ url_thumbnail: 't', url_imagen: 'o' }), 't');
    assert.equal(miniaturaDe({ url_imagen: 'o' }), 'o');
    assert.equal(miniaturaDe({}), null);
  });

  it('labels tiles with level and percentage', () => {
    const txt = etiquetaTestera({ nombre: 'P1', nivel_corrosion: 3, area_corroida_pct: 48.6 });
    assert.match(txt, /^P1, Severa, /);
    assert.match(txt, /48/);
    assert.match(etiquetaTestera({}, '10:30'), /^Foto, .*10:30$/);
  });

  it('labels batch tiles with count and worst level', () => {
    assert.match(etiquetaTesteraLote('Tubería', 1, 2), /^Lote Tubería, 1 imagen, peor nivel /);
    assert.match(etiquetaTesteraLote('', 10, 0), /^Lote sin nombre, 10 imágenes/);
  });

  it('names tiles and queue states', () => {
    assert.equal(nombreCorto({ nombre: ' A ' }, '10:00'), 'A');
    assert.equal(nombreCorto({}, '10:00'), '10:00');
    assert.equal(estadoTesteraSubida({ estado: 'subiendo', progreso: 40 }), 'Subiendo 40 %');
    assert.equal(estadoTesteraSubida({ estado: 'cola', reintentando: true }), 'Reintentando');
    assert.equal(estadoTesteraSubida({ estado: 'error' }), 'Error');
  });
});
