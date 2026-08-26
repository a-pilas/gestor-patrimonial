import { ASSET_CLASSES, REAL_ESTATE_SUBCLASSES } from "./model.js";
import { store, latestPositionsByAssetEntity, latestLiabilityPositions, assetById, entityById } from "./store.js";

// El precio de compra de un inmueble físico cuenta como capital aportado a ese
// activo, igual que una Compra normal — así no hace falta duplicar el dato
// registrando además un movimiento con el mismo importe.
function purchasePriceAsAportado(asset) {
  if (asset && asset.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(asset.subclass)) {
    return Number(asset.purchasePrice) || 0;
  }
  return 0;
}

// Para inmuebles con varias fuentes de valoración (p.ej. dos tasaciones), el
// valor es la media de esas fuentes menos el coeficiente de seguridad
// configurado en Ajustes — recalculado siempre al vuelo, así que si cambias
// el % de seguridad se refleja en todo (dashboard, posiciones...) sin tener
// que reintroducir nada.
export function valueOfPosition(p) {
  if (p.valuations && p.valuations.length) {
    const avg = p.valuations.reduce((s, v) => s + (Number(v.value) || 0), 0) / p.valuations.length;
    const safetyPct = Number(store.get().meta.realEstateSafetyPct) || 0;
    return avg * (1 - safetyPct / 100);
  }
  return Number(p.value) || 0;
}

// Reparte cada posición a su clase de activo (a través del activo asociado).
// Los activos Mixtos con % RV/RF definido se reparten directamente entre
// Renta variable y Renta fija (estimación tipo look-through); si no tienen
// % definido, se quedan agrupados en "Mixto" hasta que se indique el reparto.
export function totalsByClass() {
  const totals = {};
  for (const key of Object.keys(ASSET_CLASSES)) totals[key] = 0;

  for (const p of latestPositionsByAssetEntity()) {
    const asset = assetById(p.assetId);
    if (!asset) continue;
    const value = valueOfPosition(p);
    if (asset.class === "mixto" && asset.mixRvPct != null) {
      totals.renta_variable += value * (asset.mixRvPct / 100);
      totals.renta_fija += value * (1 - asset.mixRvPct / 100);
    } else {
      totals[asset.class] = (totals[asset.class] || 0) + value;
    }
  }
  return totals;
}

export function totalPatrimonio() {
  const totals = totalsByClass();
  return Object.values(totals).reduce((a, b) => a + b, 0);
}

// Un traspaso se registra siempre en el lado que RECIBE el dinero, así que cuenta
// como capital que financia el patrimonio actual, igual que una aportación. Una
// Compra cuenta igual: si no había una Aportación previa registrada para ese
// dinero, la Compra ES el momento en que ese capital entra en la app.
// (Si algún día mueves dinero entre dos activos que YA están en la app —incluida
// efectivo en una cuenta ya trackeada—, no hace falta registrar un movimiento:
// basta con actualizar el valor de las posiciones afectadas, para no contar ese
// dinero dos veces).
export function totalAportadoNeto() {
  const data = store.get();
  let total = 0;
  for (const a of data.assets) total += purchasePriceAsAportado(a);
  for (const m of data.movements) {
    if (m.type === "aportacion" || m.type === "traspaso" || m.type === "compra") total += Number(m.amount) || 0;
    if (m.type === "retirada" || m.type === "venta") total -= Number(m.amount) || 0;
  }
  return total;
}

// Rentabilidad YTD simplificada (método Dietz simple):
// (valorActual - valorInicioAño - flujosNetosYtd) / valorInicioAño
export function rentabilidadYtdPct() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = `${year}-01-01`;

  const data = store.get();

  // valor actual: última posición conocida por (entidad, activo)
  const latestAll = latestPositionsByAssetEntity();
  const valorActual = latestAll.reduce((s, p) => s + valueOfPosition(p), 0);

  // valor a inicio de año: última posición conocida ANTES de este año, por (entidad, activo)
  const map = new Map();
  for (const p of data.positions) {
    if (p.date >= startOfYear) continue;
    const key = p.entityId + "|" + p.assetId;
    const prev = map.get(key);
    if (!prev || p.date > prev.date) map.set(key, p);
  }
  const valorInicioAño = [...map.values()].reduce((s, p) => s + valueOfPosition(p), 0);

  if (!valorInicioAño) return null; // sin histórico suficiente

  let flujosYtd = 0;
  for (const m of data.movements) {
    if (m.date < startOfYear) continue;
    if (m.type === "aportacion" || m.type === "traspaso" || m.type === "compra") flujosYtd += Number(m.amount) || 0;
    if (m.type === "retirada" || m.type === "venta") flujosYtd -= Number(m.amount) || 0;
  }

  const pct = ((valorActual - valorInicioAño - flujosYtd) / valorInicioAño) * 100;
  return pct;
}

export function riskScores() {
  const data = store.get();
  const buckets = { renta_fija: { sum: 0, w: 0 }, renta_variable: { sum: 0, w: 0 }, combinado: { sum: 0, w: 0 } };

  for (const p of latestPositionsByAssetEntity()) {
    const asset = assetById(p.assetId);
    if (!asset) continue;
    const value = valueOfPosition(p);
    if (!value) continue;
    const risk = asset.riskScore != null && asset.riskScore !== "" ? Number(asset.riskScore) : ASSET_CLASSES[asset.class].riskDefault;

    buckets.combinado.sum += risk * value;
    buckets.combinado.w += value;

    if (asset.class === "renta_fija") {
      buckets.renta_fija.sum += risk * value;
      buckets.renta_fija.w += value;
    }
    if (asset.class === "renta_variable") {
      buckets.renta_variable.sum += risk * value;
      buckets.renta_variable.w += value;
    }
    if (asset.class === "mixto" && asset.mixRvPct != null) {
      const rvValue = value * (asset.mixRvPct / 100);
      const rfValue = value * (1 - asset.mixRvPct / 100);
      buckets.renta_variable.sum += risk * rvValue;
      buckets.renta_variable.w += rvValue;
      buckets.renta_fija.sum += risk * rfValue;
      buckets.renta_fija.w += rfValue;
    }
  }

  const avg = (b) => (b.w ? b.sum / b.w : null);
  return {
    rentaFija: avg(buckets.renta_fija),
    rentaVariable: avg(buckets.renta_variable),
    combinado: avg(buckets.combinado),
  };
}

// Capital aportado neto de un activo concreto (precio de compra si es un
// inmueble físico, más aportaciones/traspasos menos retiradas/ventas
// registradas contra ese activo), para poder comparar "lo puesto" con el
// valor actual en la pantalla de Posiciones.
export function aportadoNetoPorActivo(assetId) {
  const data = store.get();
  let total = purchasePriceAsAportado(assetById(assetId));
  for (const m of data.movements) {
    if (m.assetId !== assetId) continue;
    if (m.type === "aportacion" || m.type === "traspaso" || m.type === "compra") total += Number(m.amount) || 0;
    if (m.type === "retirada" || m.type === "venta") total -= Number(m.amount) || 0;
  }
  return total;
}

// Activos dados de alta que todavía no tienen ninguna posición (valor actual) registrada.
export function assetsWithoutPosition() {
  const data = store.get();
  const assetIdsWithPosition = new Set(data.positions.map((p) => p.assetId));
  return data.assets.filter((a) => !assetIdsWithPosition.has(a.id));
}

export function fechaUltimaActualizacion() {
  const data = store.get();
  if (!data.positions.length) return null;
  return data.positions.reduce((max, p) => (p.date > max ? p.date : max), data.positions[0].date);
}

// Suma del último saldo pendiente conocido de cada pasivo (hipotecas, etc.).
export function totalDeudaPendiente() {
  return latestLiabilityPositions().reduce((s, p) => s + (Number(p.balance) || 0), 0);
}

// Patrimonio neto = activos (incluidos inmuebles) menos deuda pendiente.
export function patrimonioNeto() {
  return totalPatrimonio() - totalDeudaPendiente();
}

// Suma de las cuotas mensuales de todos los pasivos dados de alta.
export function totalCuotaMensual() {
  const data = store.get();
  return data.liabilities.reduce((s, l) => s + (Number(l.monthlyPayment) || 0), 0);
}

// Pasivos dados de alta que todavía no tienen ningún saldo pendiente registrado.
export function liabilitiesWithoutPosition() {
  const data = store.get();
  const idsWithPosition = new Set(data.liabilityPositions.map((p) => p.liabilityId));
  return data.liabilities.filter((l) => !idsWithPosition.has(l.id));
}

// --- Detalle de patrimonio financiero (excluye Inmobiliario en las tres) ---

function financialPositions() {
  return latestPositionsByAssetEntity()
    .map((p) => ({ p, asset: assetById(p.assetId) }))
    .filter(({ asset }) => asset && asset.class !== "inmobiliario");
}

// "Fondos de inversión + ETF" también absorbe Monetario y Bono/Obligación,
// que no tienen línea propia — así estas 6 categorías cubren siempre el
// 100% del patrimonio financiero, sin necesidad de un cajón de "Otros".
const SUBCLASS_GROUPS = [
  { label: "Liquidez en cuentas corrientes", subclasses: ["Cuenta corriente"] },
  { label: "Liquidez en cuentas de ahorro", subclasses: ["Cuenta remunerada"] },
  { label: "Liquidez en depósitos a plazo", subclasses: ["Depósito a plazo"] },
  { label: "Acciones", subclasses: ["Acción"] },
  { label: "Fondos de inversión + ETF", subclasses: ["Fondo", "ETF", "Monetario", "Bono/Obligación"] },
  { label: "Planes de pensiones", subclasses: ["Plan de pensiones"] },
];

// Desglose del patrimonio financiero por tipo de producto (no por clase de
// riesgo): cuentas corrientes, ahorro, depósitos, acciones, fondos+ETF y
// planes de pensiones.
export function financialBreakdownBySubclass() {
  const groups = SUBCLASS_GROUPS.map((g) => ({ ...g, value: 0 }));
  let total = 0;
  for (const { p, asset } of financialPositions()) {
    const value = valueOfPosition(p);
    total += value;
    const group = groups.find((g) => g.subclasses.includes(asset.subclass));
    if (group) group.value += value;
  }
  return { groups, total };
}

// Liquidez inmediata (cuenta corriente) vs. resto del patrimonio financiero
// (invertido o en otros productos de ahorro), dentro del patrimonio financiero.
export function financialLiquidezVsResto() {
  let cuentaCorriente = 0;
  let total = 0;
  for (const { p, asset } of financialPositions()) {
    const value = valueOfPosition(p);
    total += value;
    if (asset.subclass === "Cuenta corriente") cuentaCorriente += value;
  }
  return { cuentaCorriente, resto: total - cuentaCorriente, total };
}

// Patrimonio financiero agrupado por entidad, de mayor a menor importe.
export function financialTotalsByEntity() {
  const map = new Map();
  let total = 0;
  for (const { p, asset } of financialPositions()) {
    const value = valueOfPosition(p);
    total += value;
    const key = asset.entityId || "__sin_entidad__";
    map.set(key, (map.get(key) || 0) + value);
  }
  const rows = [...map.entries()]
    .map(([key, value]) => ({
      name: key === "__sin_entidad__" ? "Sin entidad" : entityById(key)?.name || "—",
      value,
    }))
    .sort((a, b) => b.value - a.value);
  return { rows, total };
}
