import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOTE_MAX,
  CONCURRENCIA_LOTE,
  FASE_PREVIA,
  FASE_MEDICION,
  MENSAJE_NO_CONFIRMADO,
  clasificarFallo,
  alternarSeleccion,
  seleccionarIds,
  podarSeleccion,
  quitarSeleccionadas,
  esReanudable,
  calcularProgresoSubida,
  ejecutarColaConcurrencia,
  paginar,
  debeInvalidar,
  debeActualizarProgreso,
  clasificarArchivos,
  nombreDesdeArchivo,
  normalizarEntrada,
  generarLoteId,
  sugerirNombreLote,
  errorDetenido,
  esAbortoPorDetener,
} from './gestorSubida.js';

const errorHttp = (status, fase, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status, fase });
const errorRed = (fase) =>
  Object.assign(new Error('No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.'), { fase });

describe('gestorSubida: limits', () => {
  it('caps a batch at 1000 images with concurrency 2', () => {
    assert.equal(LOTE_MAX, 1000);
    assert.equal(CONCURRENCIA_LOTE, 2);
  });
});

describe('gestorSubida: clasificarFallo', () => {
  it('retries every transient failure before POST /medicion (idempotent steps)', () => {
    assert.equal(clasificarFallo(errorHttp(429, FASE_PREVIA)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(500, FASE_PREVIA)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(502, FASE_PREVIA)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(504, FASE_PREVIA)), 'reintentar');
    assert.equal(clasificarFallo(errorRed(FASE_PREVIA)), 'reintentar');
  });

  it('does not retry client errors', () => {
    assert.equal(clasificarFallo(errorHttp(400, FASE_PREVIA)), 'definitivo');
    assert.equal(clasificarFallo(errorHttp(403, FASE_MEDICION)), 'definitivo');
    assert.equal(clasificarFallo(errorHttp(400, FASE_MEDICION, 'Fecha futura no permitida')), 'definitivo');
    // Oversized photo is rejected locally, before any request.
    assert.equal(clasificarFallo(Object.assign(new Error('La foto pesa 60 MB'), { fase: FASE_PREVIA })), 'definitivo');
  });

  it('retries POST /medicion only when it certainly did not run (throttling)', () => {
    assert.equal(clasificarFallo(errorHttp(429, FASE_MEDICION)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(503, FASE_MEDICION, 'Rate exceeded')), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(503, FASE_MEDICION, 'TooManyRequestsException: throttled')), 'reintentar');
  });

  it('retries POST /medicion on 502/503/504, 409 or a lost response (server is idempotent per imagen_key)', () => {
    assert.equal(clasificarFallo(errorHttp(502, FASE_MEDICION)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(504, FASE_MEDICION)), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(503, FASE_MEDICION, 'El servidor tuvo un problema.')), 'reintentar');
    assert.equal(clasificarFallo(errorHttp(409, FASE_MEDICION)), 'reintentar');
    assert.equal(clasificarFallo(errorRed(FASE_MEDICION)), 'reintentar');
  });

  it('marks POST /medicion as unconfirmed on a plain 500 or other 5xx', () => {
    assert.equal(clasificarFallo(errorHttp(500, FASE_MEDICION)), 'incierto');
    assert.equal(clasificarFallo(errorHttp(501, FASE_MEDICION)), 'incierto');
  });

  it('stops the batch when the session expired', () => {
    assert.equal(clasificarFallo(errorHttp(401, FASE_PREVIA)), 'detener');
    assert.equal(clasificarFallo(errorHttp(401, FASE_MEDICION)), 'detener');
  });
});

describe('gestorSubida: progress', () => {
  it('summarizes counts, floors the percentage and reports the global state', () => {
    const items = [
      { id: 1, estado: 'listo' },
      { id: 2, estado: 'listo' },
      { id: 3, estado: 'error' },
      { id: 4, estado: 'cola' },
    ];
    const prog = calcularProgresoSubida(items, { running: false });
    assert.equal(prog.total, 4);
    assert.equal(prog.completadas, 2);
    assert.equal(prog.fallidas, 1);
    assert.equal(prog.pendientes, 1);
    assert.equal(prog.reanudables, 2);
    assert.equal(prog.porcentaje, 50);
    assert.equal(prog.estadoGlobal, 'con_errores');
    assert.equal(calcularProgresoSubida(items, { running: true }).estadoGlobal, 'en_curso');

    const casi = Array.from({ length: 1000 }, (_, i) => ({ id: i, estado: i === 0 ? 'cola' : 'listo' }));
    assert.equal(calcularProgresoSubida(casi).porcentaje, 99);

    const terminado = calcularProgresoSubida([{ id: 1, estado: 'listo' }, { id: 2, estado: 'listo' }]);
    assert.equal(terminado.porcentaje, 100);
    assert.equal(terminado.estadoGlobal, 'completado');
    assert.equal(calcularProgresoSubida([]).estadoGlobal, 'vacio');
  });

  it('never offers unconfirmed photos to the bulk resume', () => {
    assert.equal(esReanudable({ estado: 'cola' }), true);
    assert.equal(esReanudable({ estado: 'error', incierto: false }), true);
    assert.equal(esReanudable({ estado: 'error', incierto: true }), false);
    assert.equal(esReanudable({ estado: 'listo' }), false);
    const prog = calcularProgresoSubida([
      { id: 1, estado: 'error', incierto: true },
      { id: 2, estado: 'error' },
    ]);
    assert.equal(prog.inciertas, 1);
    assert.equal(prog.reanudables, 1);
  });
});

describe('gestorSubida: ejecutarColaConcurrencia', () => {
  it('keeps at most 2 tasks in flight and retries throttling with backoff', async () => {
    let enVuelo = 0;
    let maxEnVuelo = 0;
    const intentos = new Map();
    const demoras = [];
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

    const resumen = await ejecutarColaConcurrencia({
      items,
      concurrencia: 2,
      maxReintentos: 2,
      demoraBaseMs: 10,
      esperar: async (ms) => { demoras.push(ms); },
      tarea: async (item) => {
        enVuelo += 1;
        maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
        await new Promise((r) => setTimeout(r, 5));
        enVuelo -= 1;
        const n = (intentos.get(item.id) || 0) + 1;
        intentos.set(item.id, n);
        if (item.id === 'b' && n < 2) throw errorHttp(429, FASE_MEDICION);
        if (item.id === 'd') throw errorHttp(400, FASE_MEDICION, 'Archivo inválido');
        return { id_medicion: `med-${item.id}` };
      },
    });

    assert.equal(maxEnVuelo, 2);
    assert.equal(resumen.total, 5);
    assert.equal(resumen.completadas, 4);
    assert.equal(resumen.fallidas, 1);
    assert.equal(intentos.get('b'), 2);
    assert.equal(intentos.get('d'), 1);
    assert.deepEqual(demoras, [10]);
  });

  it('does not auto-retry a plain 500 from POST /medicion and flags it unconfirmed', async () => {
    const llamadas = new Map();
    const parches = [];
    const resumen = await ejecutarColaConcurrencia({
      items: [{ id: 'x' }, { id: 'y' }],
      demoraBaseMs: 0,
      onItemUpdate: (id, cambios) => parches.push({ id, ...cambios }),
      tarea: async (item) => {
        llamadas.set(item.id, (llamadas.get(item.id) || 0) + 1);
        throw errorHttp(item.id === 'x' ? 500 : 501, FASE_MEDICION);
      },
    });
    assert.equal(llamadas.get('x'), 1);
    assert.equal(llamadas.get('y'), 1);
    assert.equal(resumen.fallidas, 2);
    const finales = parches.filter((p) => p.estado === 'error');
    assert.equal(finales.length, 2);
    for (const p of finales) {
      assert.equal(p.incierto, true);
      assert.equal(p.error, MENSAJE_NO_CONFIRMADO);
    }
  });

  it('retries a 504 from POST /medicion and succeeds on the repeat', async () => {
    let n = 0;
    const resumen = await ejecutarColaConcurrencia({
      items: [{ id: 'w' }],
      demoraBaseMs: 0,
      tarea: async () => {
        n += 1;
        if (n === 1) throw errorHttp(504, FASE_MEDICION);
        return { ok: true };
      },
    });
    assert.equal(n, 2);
    assert.equal(resumen.completadas, 1);
  });

  it('flags as unconfirmed a POST /medicion whose retries ran out, except throttling', async () => {
    const parches = [];
    await ejecutarColaConcurrencia({
      items: [{ id: 'a' }, { id: 'b' }],
      maxReintentos: 1,
      demoraBaseMs: 0,
      onItemUpdate: (id, c) => c.estado === 'error' && parches.push({ id, ...c }),
      tarea: async (item) => { throw errorHttp(item.id === 'a' ? 504 : 429, FASE_MEDICION); },
    });
    assert.equal(parches.find((p) => p.id === 'a').incierto, true);
    assert.equal(parches.find((p) => p.id === 'b').incierto, false);
  });

  it('stops dispatching, retrying and patching once cancelled (logout)', async () => {
    let cancelado = false;
    const vistos = [];
    const parches = [];
    const resumen = await ejecutarColaConcurrencia({
      items: [1, 2, 3, 4].map((id) => ({ id })),
      concurrencia: 1,
      demoraBaseMs: 0,
      cancelado: () => cancelado,
      onItemUpdate: (id, c) => parches.push({ id, ...c }),
      tarea: async (item) => {
        vistos.push(item.id);
        if (item.id === 2) { cancelado = true; throw errorHttp(429, FASE_PREVIA); }
        return {};
      },
    });
    assert.deepEqual(vistos, [1, 2]);
    assert.deepEqual(parches.map((p) => p.id), [1]);
    assert.equal(resumen.completadas, 1);
    assert.equal(resumen.fallidas, 0);
  });

  it('retries a 502 that happened before POST /medicion', async () => {
    let n = 0;
    const resumen = await ejecutarColaConcurrencia({
      items: [{ id: 'z' }],
      demoraBaseMs: 0,
      tarea: async () => {
        n += 1;
        if (n === 1) throw errorHttp(502, FASE_PREVIA);
        return { ok: true };
      },
    });
    assert.equal(n, 2);
    assert.equal(resumen.completadas, 1);
  });

  it('gives up after the retry budget', async () => {
    let n = 0;
    const resumen = await ejecutarColaConcurrencia({
      items: [{ id: 'z' }],
      maxReintentos: 3,
      demoraBaseMs: 0,
      tarea: async () => { n += 1; throw errorHttp(429, FASE_PREVIA); },
    });
    assert.equal(n, 4);
    assert.equal(resumen.fallidas, 1);
  });

  it('stops dispatching after an expired session and leaves the rest queued', async () => {
    const vistos = [];
    const resumen = await ejecutarColaConcurrencia({
      items: [1, 2, 3, 4, 5].map((id) => ({ id })),
      concurrencia: 1,
      tarea: async (item) => {
        vistos.push(item.id);
        if (item.id === 2) throw errorHttp(401, FASE_PREVIA);
        return {};
      },
    });
    assert.deepEqual(vistos, [1, 2]);
    assert.equal(resumen.detenido, true);
    assert.equal(resumen.completadas, 1);
    assert.equal(resumen.fallidas, 1);
  });

  it('handles an empty list', async () => {
    const resumen = await ejecutarColaConcurrencia({ items: [], tarea: async () => ({}) });
    assert.equal(resumen.total, 0);
  });
});

describe('gestorSubida: file helpers', () => {
  it('classifies files by type and builds names and ids', () => {
    const { validos, rechazados } = clasificarArchivos([
      { name: 'a.jpg', type: 'image/jpeg' },
      { name: 'b.png', type: 'image/png' },
      { name: 'c.gif', type: 'image/gif' },
    ]);
    assert.equal(validos.length, 2);
    assert.deepEqual(rechazados, ['c.gif']);
    assert.equal(nombreDesdeArchivo({ name: 'placa 12.final.JPG' }), 'placa 12.final');
    assert.match(generarLoteId(), /^LOT-[A-Za-z0-9_-]{1,60}$/);
  });

  it('suggests a batch name from the date', () => {
    assert.equal(sugerirNombreLote('2026-11-03'), 'Lote 03/11/2026');
    assert.equal(sugerirNombreLote(''), 'Lote');
  });
});

describe('gestorSubida: paging and refresh throttle', () => {
  it('paginates 25 rows per page and clamps the page', () => {
    const lista = Array.from({ length: 1000 }, (_, i) => i);
    const p = paginar(lista, 3);
    assert.equal(p.paginas, 40);
    assert.equal(p.filas.length, 25);
    assert.equal(p.filas[0], 75);
    assert.equal(paginar(lista, 99).pagina, 39);
    assert.equal(paginar([], 2).paginas, 1);
  });

  it('publishes progress ticks at most every 200 ms, always the first and the last', () => {
    assert.equal(debeActualizarProgreso(null, 1000, 10), true);
    assert.equal(debeActualizarProgreso(1000, 1100, 10), false);
    assert.equal(debeActualizarProgreso(1000, 1200, 10), true);
    assert.equal(debeActualizarProgreso(1000, 1010, 100), true);
    assert.equal(debeActualizarProgreso(1000, 1010, 0), true);
  });

  it('invalidates at most every 10 seconds', () => {
    assert.equal(debeInvalidar(1000, null), true);
    assert.equal(debeInvalidar(5000, 1000), false);
    assert.equal(debeInvalidar(11000, 1000), true);
  });
});

describe('gestorSubida: multi-select helpers', () => {
  it('toggles an id without mutating the previous selection', () => {
    const a = new Set(['a']);
    const b = alternarSeleccion(a, 'b');
    assert.deepEqual([...b], ['a', 'b']);
    assert.deepEqual([...a], ['a']);
    assert.deepEqual([...alternarSeleccion(b, 'a')], ['b']);
  });

  it('adds a group of ids keeping the existing ones', () => {
    assert.deepEqual([...seleccionarIds(new Set(['x']), ['a', 'b', 'x'])].sort(), ['a', 'b', 'x']);
  });

  it('prunes ids that are no longer in the queue', () => {
    const items = [{ id: 'a' }, { id: 'c' }];
    assert.deepEqual([...podarSeleccion(new Set(['a', 'b', 'c']), items)], ['a', 'c']);
    assert.equal(podarSeleccion(new Set(), items).size, 0);
  });

  it('removes the selected rows and keeps the order of the rest', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(quitarSeleccionadas(items, new Set(['b'])).map((x) => x.id), ['a', 'c']);
    assert.equal(quitarSeleccionadas(items, new Set()), items);
  });
});

describe('normalizarEntrada', () => {
  const foto = (name) => ({ name });

  it('un File suelto toma el nombre del archivo sin extensión', () => {
    assert.deepEqual(normalizarEntrada(foto('Placa 12.jpg')), { file: foto('Placa 12.jpg'), nombre: 'Placa 12' });
  });

  it('{ file, nombre } conserva el nombre ya escrito, incluso vacío, y lo recorta', () => {
    const f = foto('x.png');
    assert.equal(normalizarEntrada({ file: f, nombre: 'Lado norte' }).nombre, 'Lado norte');
    assert.equal(normalizarEntrada({ file: f, nombre: '' }).nombre, '');
    assert.equal(normalizarEntrada({ file: f, nombre: 'a'.repeat(200) }).nombre.length, 80);
    assert.equal(normalizarEntrada({ file: f, nombre: 'a' }).file, f);
  });
});

describe('gestorSubida: Detener', () => {
  const filas = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

  it('stops dispatching new items once the stop is requested', async () => {
    let parar = false;
    const arrancadas = [];
    const resultado = await ejecutarColaConcurrencia({
      items: filas(6),
      concurrencia: 2,
      demoraBaseMs: 0,
      detenerPedido: () => parar,
      tarea: async (it) => { arrancadas.push(it.id); if (it.id === 2) parar = true; return { ok: it.id }; },
    });
    assert.ok(arrancadas.length < 6);
    assert.equal(resultado.detenidoPorUsuario, true);
    assert.equal(resultado.fallidas, 0);
  });

  it('marks an aborted transfer as detenida, never as error, and does not retry it', async () => {
    const parches = [];
    let llamadas = 0;
    let parar = false;
    const resultado = await ejecutarColaConcurrencia({
      items: filas(1),
      demoraBaseMs: 0,
      detenerPedido: () => parar,
      tarea: async () => { llamadas += 1; parar = true; throw errorDetenido(); },
      onItemUpdate: (id, c) => parches.push(c),
    });
    assert.equal(llamadas, 1);
    assert.equal(parches.at(-1).estado, 'detenida');
    assert.equal(resultado.detenidas, 1);
    assert.equal(resultado.fallidas, 0);
  });

  it('does not retry a pre-analysis network failure after a stop; it becomes detenida', async () => {
    let parar = false;
    let llamadas = 0;
    const parches = [];
    await ejecutarColaConcurrencia({
      items: filas(1),
      demoraBaseMs: 0,
      detenerPedido: () => parar,
      tarea: async () => { llamadas += 1; parar = true; throw errorHttp(503, FASE_PREVIA); },
      onItemUpdate: (id, c) => parches.push(c),
    });
    assert.equal(llamadas, 1);
    assert.equal(parches.at(-1).estado, 'detenida');
  });

  it('lets an item already analyzing finish and retry its analysis after a stop', async () => {
    let llamadas = 0;
    let parar = false;
    const parches = [];
    const resultado = await ejecutarColaConcurrencia({
      items: filas(1),
      demoraBaseMs: 0,
      detenerPedido: () => parar,
      tarea: async () => {
        llamadas += 1;
        parar = true;
        if (llamadas === 1) throw errorHttp(502, FASE_MEDICION);
        return { ok: true };
      },
      onItemUpdate: (id, c) => parches.push(c),
    });
    assert.equal(llamadas, 2);
    assert.equal(resultado.completadas, 1);
    assert.equal(parches.at(-1).estado, 'listo');
  });

  it('recognizes the abort caused by the stop only before the analysis', () => {
    const cancelado = new Error('Subida cancelada.');
    assert.equal(esAbortoPorDetener(cancelado, { detenerPedido: true, fase: FASE_PREVIA }), true);
    assert.equal(esAbortoPorDetener(cancelado, { detenerPedido: false, fase: FASE_PREVIA }), false);
    assert.equal(esAbortoPorDetener(cancelado, { detenerPedido: true, fase: FASE_MEDICION }), false);
    assert.equal(esAbortoPorDetener(errorHttp(400, FASE_PREVIA), { detenerPedido: true, fase: FASE_PREVIA }), false);
  });

  it('counts stopped rows as resumable and reports the stopped state', () => {
    const items = [{ estado: 'listo' }, { estado: 'detenida' }, { estado: 'cola' }];
    assert.equal(esReanudable({ estado: 'detenida' }), true);
    const p = calcularProgresoSubida(items, { running: false });
    assert.equal(p.detenidas, 1);
    assert.equal(p.reanudables, 2);
    assert.equal(p.estadoGlobal, 'detenida');
    assert.equal(calcularProgresoSubida(items, { running: true }).estadoGlobal, 'en_curso');
  });
});
