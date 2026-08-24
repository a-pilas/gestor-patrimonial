// Modelo de datos y constantes del dominio

// Escala de riesgo única 1-7, como el indicador SRRI/SRI que aparece en el KIID/DFI de los fondos.
export const RISK_SCALE_MAX = 7;

export const ASSET_CLASSES = {
  liquidez: { label: "Liquidez", color: "#4c9f70", riskDefault: 1 },
  renta_fija: { label: "Renta fija", color: "#3d7ab8", riskDefault: 2 },
  mixto: { label: "Mixto RF/RV", color: "#8a5fb0", riskDefault: 4 },
  renta_variable: { label: "Renta variable", color: "#d4af37", riskDefault: 6 },
  inmobiliario: { label: "Inmobiliario", color: "#a85c32", riskDefault: 5 },
};

// Las subclases ya no repiten la clase (p.ej. "Plan de pensiones" en vez de
// "Plan de pensiones RV"): si es RF, RV o Mixto ya lo dice el campo Clase.
export const SUBCLASSES = {
  liquidez: ["Cuenta corriente", "Cuenta remunerada", "Depósito a plazo", "Monetario"],
  renta_fija: ["Fondo", "ETF", "Bono/Obligación", "Plan de pensiones"],
  mixto: ["Fondo", "ETF", "Plan de pensiones"],
  renta_variable: ["Acción", "Fondo", "ETF", "Plan de pensiones"],
  inmobiliario: ["Vivienda", "Local/Oficina", "Fondo inmobiliario/REIT"],
};

// Subclases que se compran/venden por número de participaciones o acciones,
// para las que además del valor total se puede indicar unidades y valor liquidativo.
export const UNIT_TRADED_SUBCLASSES = ["Fondo", "ETF", "Acción", "Plan de pensiones"];

export const MOVEMENT_TYPES = {
  aportacion: "Aportación",
  retirada: "Retirada",
  compra: "Compra",
  venta: "Venta",
  traspaso: "Traspaso",
  dividendo: "Dividendo/Cupón",
  comision: "Comisión",
};

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyData() {
  return {
    meta: {
      benchmarkName: "Morningstar Global 60/40",
      benchmarkYtdPct: null,
      version: 1,
    },
    entities: [],
    assets: [],
    positions: [],
    movements: [],
    decisions: [],
  };
}
