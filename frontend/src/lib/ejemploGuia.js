import { formatoPct } from './textUtils.js';

// Worked example shown in the "Cómo se calcula" guide (Foto 07 of the project's
// test set). Values are what production returns for that photo today, as model
// estimates. Kept in one place so every figure and caption in the guide derives
// from the same two numbers; if production output changes, edit only these.
export const EJEMPLO_PCT_PLACA = 36.6; // % of the plate marked as corrosion
export const EJEMPLO_PCT_FOTO = 10.1; // same pixels measured over the whole photo

const aUnDecimal = (n) => Math.round(n * 10) / 10;

// Share of the frame occupied by the plate: the same corroded pixels give both
// percentages, so photo% / plate% = plate pixels / photo pixels.
export const EJEMPLO_PCT_PLACA_EN_CUADRO = aUnDecimal((EJEMPLO_PCT_FOTO / EJEMPLO_PCT_PLACA) * 100);
export const EJEMPLO_PCT_FONDO = aUnDecimal(100 - EJEMPLO_PCT_PLACA_EN_CUADRO);

// The guide uses the app's own formatter so its numbers read exactly like the
// ones the user sees in results ("36,6%").
export const formatoPctGuia = formatoPct;
