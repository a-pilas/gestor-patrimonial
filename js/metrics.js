import { ASSET_CLASSES } from "./model.js";
import { store, latestPositionsByAssetEntity, assetById } from "./store.js";

function valueOfPosition(p) {
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
// como capital que financia el patrimonio actual, igual que una aportación.
// (Si algún día mueves dinero entre dos activos que YA están en la app, no hace
// falta registrar un traspaso: basta con actualizar el valor de ambas posiciones).
export function totalAportadoNeto() {
  const data = store.get();
  let total = 0;
  for (const m of data.movements) {
    if (m.type === "aportacion" || m.type === "traspaso") total += Number(m.amount) || 0;
    if (m.type === "retirada") total -= Number(m.amount) || 0;
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
    if (m.type === "aportacion" || m.type === "traspaso") flujosYtd += Number(m.amount) || 0;
    if (m.type === "retirada") flujosYtd -= Number(m.amount) || 0;
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

// Capital aportado neto de un activo concreto (suma de aportaciones/traspasos
// menos retiradas/ventas registradas contra ese activo), para poder comparar
// "lo puesto" con el valor actual en la pantalla de Posiciones.
export function aportadoNetoPorActivo(assetId) {
  const data = store.get();
  let total = 0;
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
