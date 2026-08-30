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

// Inmuebles "físicos" (no un fondo/REIT cotizado): admiten varias fuentes de
// valoración por posición (p.ej. dos tasaciones) que se promedian, y un
// coeficiente de seguridad de minusvaloración prudente configurable.
export const REAL_ESTATE_SUBCLASSES = ["Vivienda", "Local/Oficina"];

export const DEFAULT_REAL_ESTATE_SAFETY_PCT = 10;

// Tramos progresivos del IRPF sobre la base del ahorro (2025-2026). Se
// guardan en meta para poder corregirlos desde Ajustes si cambia la
// normativa, en vez de quedar fijos en el código.
export const DEFAULT_TRAMOS_AHORRO = [
  { hasta: 6000, pct: 19 },
  { hasta: 50000, pct: 21 },
  { hasta: 200000, pct: 23 },
  { hasta: 300000, pct: 27 },
  { hasta: null, pct: 30 },
];

// Impuesto sobre el Patrimonio — escala autonómica de Galicia (2025-2026):
// misma tarifa que la estatal subsidiaria, con una bonificación general del
// 50% sobre la cuota íntegra. Mínimo exento: 700.000 € por contribuyente
// (aparte, la vivienda habitual tiene su propia exención de 300.000 € por
// contribuyente, ya contemplada aparte en el cálculo). Todo editable en
// Ajustes por si cambia la normativa o cambias de residencia fiscal.
export const DEFAULT_PATRIMONIO_MINIMO_EXENTO = 700000;
export const DEFAULT_PATRIMONIO_BONIFICACION_PCT = 50;
export const DEFAULT_TRAMOS_PATRIMONIO = [
  { hasta: 167129.45, pct: 0.2 },
  { hasta: 334252.88, pct: 0.3 },
  { hasta: 668499.75, pct: 0.5 },
  { hasta: 1336999.51, pct: 0.9 },
  { hasta: 2673999.01, pct: 1.3 },
  { hasta: 5347998.03, pct: 1.7 },
  { hasta: 10695996.06, pct: 2.1 },
  { hasta: null, pct: 3.5 },
];

// Subclases con vencimiento propio (depósitos a plazo, bonos/obligaciones):
// admiten una fecha de vencimiento para las alertas de la Fase 4.
export const SUBCLASSES_CON_VENCIMIENTO = ["Depósito a plazo", "Bono/Obligación"];

export const DEFAULT_DESVIACION_UMBRAL_PCT = 5;
export const DEFAULT_CONCENTRACION_ACTIVO_UMBRAL_PCT = 20;
export const DEFAULT_CONCENTRACION_ENTIDAD_UMBRAL_PCT = 40;
export const DEFAULT_VENCIMIENTO_DIAS_AVISO = 30;

// Objetivo de inflación del BCE, como valor de partida razonable para el
// simulador de duración del patrimonio — editable, no es una previsión.
export const DEFAULT_INFLACION_PCT = 2;

// Compra de una propiedad — impuestos vigentes en Galicia (2025-2026):
// vivienda usada tributa por ITP en tramos progresivos (8/9/10%); vivienda
// nueva por IVA (10%) + AJD (1,5%, a cargo del comprador solo en la
// escritura de compraventa, no en la de préstamo hipotecario desde el
// RD-ley 17/2018). "Otros gastos" agrupa notaría, registro y gestoría.
export const DEFAULT_TRAMOS_ITP_VIVIENDA = [
  { hasta: 150000, pct: 8 },
  { hasta: 600000, pct: 9 },
  { hasta: null, pct: 10 },
];
export const DEFAULT_IVA_VIVIENDA_NUEVA_PCT = 10;
export const DEFAULT_AJD_VIVIENDA_NUEVA_PCT = 1.5;
export const DEFAULT_OTROS_GASTOS_COMPRA_PCT = 1.5;

export const MOVEMENT_TYPES = {
  aportacion: "Aportación",
  retirada: "Retirada",
  compra: "Compra",
  venta: "Venta",
  traspaso: "Traspaso",
  dividendo: "Dividendo/Cupón",
  comision: "Comisión",
};

// Trazabilidad de propuestas del asesor vs. decisión familiar tomada (Fase 4).
export const DECISION_STATUSES = {
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  modificada: "Modificada",
};

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyData() {
  return {
    meta: {
      benchmarkName: "Morningstar Global 60/40",
      benchmarkYtdPct: null,
      realEstateSafetyPct: DEFAULT_REAL_ESTATE_SAFETY_PCT,
      tramosAhorro: DEFAULT_TRAMOS_AHORRO,
      patrimonioMinimoExento: DEFAULT_PATRIMONIO_MINIMO_EXENTO,
      patrimonioBonificacionPct: DEFAULT_PATRIMONIO_BONIFICACION_PCT,
      tramosPatrimonio: DEFAULT_TRAMOS_PATRIMONIO,
      objetivoClase: { liquidez: 0, renta_fija: 0, mixto: 0, renta_variable: 0, inmobiliario: 0 },
      desviacionUmbralPct: DEFAULT_DESVIACION_UMBRAL_PCT,
      concentracionActivoUmbralPct: DEFAULT_CONCENTRACION_ACTIVO_UMBRAL_PCT,
      concentracionEntidadUmbralPct: DEFAULT_CONCENTRACION_ENTIDAD_UMBRAL_PCT,
      vencimientoDiasAviso: DEFAULT_VENCIMIENTO_DIAS_AVISO,
      jubilacionGastoAnual: null,
      jubilacionRentabilidadPct: null,
      jubilacionInflacionPct: DEFAULT_INFLACION_PCT,
      jubilacionIncluirAlquileres: true,
      tramosItpVivienda: DEFAULT_TRAMOS_ITP_VIVIENDA,
      ivaViviendaNuevaPct: DEFAULT_IVA_VIVIENDA_NUEVA_PCT,
      ajdViviendaNuevaPct: DEFAULT_AJD_VIVIENDA_NUEVA_PCT,
      otrosGastosCompraPct: DEFAULT_OTROS_GASTOS_COMPRA_PCT,
      compraPropiedadPrecio: null,
      compraPropiedadTipoVivienda: "usada",
      compraPropiedadImporteHipoteca: null,
      compraPropiedadTipoInteresPct: null,
      compraPropiedadPlazoAnios: null,
      version: 1,
    },
    entities: [],
    assets: [],
    positions: [],
    movements: [],
    decisions: [],
    liabilities: [],
    liabilityPositions: [],
  };
}
