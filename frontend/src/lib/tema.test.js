import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { modoOscuroInicial } from './tema.js';

describe('modoOscuroInicial', () => {
  it('the saved choice wins over the system preference', () => {
    assert.equal(modoOscuroInicial('true', false), true);
    assert.equal(modoOscuroInicial('false', true), false);
  });
  it('falls back to the system preference when nothing is saved', () => {
    assert.equal(modoOscuroInicial(null, true), true);
    assert.equal(modoOscuroInicial(null, false), false);
    assert.equal(modoOscuroInicial(undefined), false);
    assert.equal(modoOscuroInicial('otro', true), true);
  });
});
