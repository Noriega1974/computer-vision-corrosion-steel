import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { modoOscuroInicial } from './tema.js';

describe('modoOscuroInicial', () => {
  it('only an explicit saved "true" is dark', () => {
    assert.equal(modoOscuroInicial('true'), true);
    assert.equal(modoOscuroInicial('false'), false);
  });
  it('is light when nothing (or junk) is saved, whatever the system prefers', () => {
    assert.equal(modoOscuroInicial(null), false);
    assert.equal(modoOscuroInicial(undefined), false);
    assert.equal(modoOscuroInicial('otro'), false);
    assert.equal(modoOscuroInicial(null, true), false);
  });
});
