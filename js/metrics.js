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

// Valor total (financiero + inmobiliario) en o antes de una fecha de corte
// dada, por (entidad, activo) — la última posición conocida hasta ese punto.
function valorTotalHasta(cutoff) {
  const data = store.get();
  const map = new Map();
  for (const p of data.positions) {
    if (p.date > cutoff) continue;
    const key = p.entityId + "|" + p.assetId;
    const prev = map.get(key);
    if (!prev || p.date >= prev.date) map.set(key, p);
  }
  let total = 0;
  for (const p of map.values()) {
    if (!assetById(p.assetId)) continue;
    total += valueOfPosition(p);
  }
  return total;
}

// Flujo neto de capital dentro de un rango de fechas [desde, hasta] (ambos
// incluidos, formato YYYY-MM-DD): Movimientos de aportación/traspaso/compra
// suman, retirada/venta restan — igual que en el resto de la app — más el
// precio de compra de cualquier inmueble cuya fecha de adquisición caiga en
// ese rango (que no es un Movimiento, así que hay que sumarlo aparte).
function flujoNetoEntre(desde, hasta) {
  const data = store.get();
  let flujo = 0;
  for (const m of data.movements) {
    if (m.date < desde || m.date > hasta) continue;
    if (m.type === "aportacion" || m.type === "traspaso" || m.type === "compra") flujo += Number(m.amount) || 0;
    if (m.type === "retirada" || m.type === "venta") flujo -= Number(m.amount) || 0;
  }
  for (const a of data.assets) {
    if (a.acquisitionDate && a.acquisitionDate >= desde && a.acquisitionDate <= hasta) {
      flujo += purchasePriceAsAportado(a);
    }
  }
  return flujo;
}

function diaSiguiente(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Rentabilidad YTD por TWR (Time-Weighted Return) real: encadena un
// sub-periodo por cada fecha del año en curso en la que de verdad se
// registró alguna posición nueva — en vez de tratar todo el año como un
// único periodo (método Dietz de antes), o forzar un corte artificial cada
// mes natural aunque no haya datos ese mes. Cada sub-periodo usa Dietz
// modificado: r = (valorFin - valorInicio - flujoDelPeriodo) / valorInicio,
// y el resultado final es el producto encadenado de (1+r) de cada
// sub-periodo, menos 1.
//
// Cortar solo en fechas con datos reales es importante: un corte en un mes
// sin ninguna posición nueva trataría cualquier aportación de ese mes como
// dinero "desaparecido" (no hay valor que la respalde todavía), inflando
// una caída ficticia seguida de una subida ficticia al mes siguiente. Al
// cortar solo donde hay información nueva, con pocos datos el cálculo
// degenera exactamente al método de un solo periodo (sin perder precisión),
// y gana precisión cuanto más a menudo actualices tus posiciones.
export function rentabilidadYtdPct() {
  const now = new Date();
  const year = now.getFullYear();
  const todayIso = now.toISOString().slice(0, 10);
  const startOfYear = `${year}-01-01`;

  const valorInicioAño = valorTotalHasta(`${year - 1}-12-31`);
  if (!valorInicioAño) return null; // sin histórico suficiente

  const data = store.get();
  const fechas = [...new Set(data.positions.map((p) => p.date).filter((d) => d >= startOfYear && d <= todayIso))].sort();
  if (fechas[fechas.length - 1] !== todayIso) fechas.push(todayIso);

  let cumFactor = 1;
  let prevDate = `${year - 1}-12-31`;
  let prevValue = valorInicioAño;

  for (const d of fechas) {
    const valorFin = valorTotalHasta(d);
    const flujo = flujoNetoEntre(diaSiguiente(prevDate), d);

    if (prevValue > 0) {
      const r = (valorFin - prevValue - flujo) / prevValue;
      cumFactor *= 1 + r;
    }
    prevValue = valorFin;
    prevDate = d;
  }

  return (cumFactor - 1) * 100;
}

// Igual que bandasDeRiesgo(): excluye inmobiliario y cuentas corrientes,
// para que el score solo refleje el riesgo de lo realmente invertido.
export function riskScores() {
  const data = store.get();
  const buckets = { renta_fija: { sum: 0, w: 0 }, renta_variable: { sum: 0, w: 0 }, combinado: { sum: 0, w: 0 } };

  for (const p of latestPositionsByAssetEntity()) {
    const asset = assetById(p.assetId);
    if (!asset) continue;
    if (asset.class === "inmobiliario" || asset.subclass === "Cuenta corriente") continue;
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

// Agrupa el score SRRI (1-7) de cada activo en 3 bandas de riesgo — más
// granular que el RF/RV/Combinado de arriba (que promedia), ya que aquí ves
// directamente qué % de tu cartera cae en cada nivel de riesgo. Excluye
// inmobiliario y cuentas corrientes: solo interesa el riesgo de lo
// realmente invertido, no el efectivo operativo ni los inmuebles.
const RISK_BANDS = [
  { key: "conservador", label: "Conservador (1-2)", min: 1, max: 2 },
  { key: "moderado", label: "Moderado (3-5)", min: 3, max: 5 },
  { key: "decidido", label: "Decidido (6-7)", min: 6, max: 7 },
];

export function bandasDeRiesgo() {
  const bands = RISK_BANDS.map((b) => ({ ...b, value: 0 }));
  let total = 0;
  for (const p of latestPositionsByAssetEntity()) {
    const asset = assetById(p.assetId);
    if (!asset) continue;
    if (asset.class === "inmobiliario" || asset.subclass === "Cuenta corriente") continue;
    const value = valueOfPosition(p);
    total += value;
    const risk = asset.riskScore != null && asset.riskScore !== "" ? Number(asset.riskScore) : ASSET_CLASSES[asset.class].riskDefault;
    const band = bands.find((b) => risk >= b.min && risk <= b.max);
    if (band) band.value += value;
  }
  return { bands, total };
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
// No incluye activos ya vendidos/retirados del todo (sin posición porque ya
// no los tienes, no porque falte valorarlos) — esos cuentan como plusvalía
// realizada en vez de como "pendiente de valorar".
export function assetsWithoutPosition() {
  const data = store.get();
  const assetIdsWithPosition = new Set(data.positions.map((p) => p.assetId));
  return data.assets.filter((a) => {
    if (assetIdsWithPosition.has(a.id)) return false;
    const fueVendidoORetirado = data.movements.some((m) => m.assetId === a.id && (m.type === "venta" || m.type === "retirada"));
    return !fueVendidoORetirado;
  });
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

// Vista consolidada de TODO el patrimonio (financiero + inmobiliario) en solo
// 3 bloques: liquidez (corriente+ahorro+depósito), inversión financiera (el
// resto de lo financiero) e inversión inmobiliaria.
export function patrimonioConsolidado() {
  const { groups, total: totalFinanciero } = financialBreakdownBySubclass();
  const liquidezLabels = ["Liquidez en cuentas corrientes", "Liquidez en cuentas de ahorro", "Liquidez en depósitos a plazo"];
  const liquidez = groups.filter((g) => liquidezLabels.includes(g.label)).reduce((s, g) => s + g.value, 0);
  const inversionFinanciera = totalFinanciero - liquidez;
  const inversionInmobiliaria = totalsByClass().inmobiliario || 0;
  return { liquidez, inversionFinanciera, inversionInmobiliaria, total: liquidez + inversionFinanciera + inversionInmobiliaria };
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

// Patrimonio total (financiero + inmobiliario) al cierre de cada año, desde
// el primer año con alguna posición registrada hasta hoy. Para el año en
// curso usa la última posición conocida (no proyecta a 31/12), igual que el
// resto del dashboard. Cada año usa, por (entidad, activo), la última
// posición conocida en o antes de su 31 de diciembre — el mismo criterio que
// ya usa rentabilidadYtdPct() para "valor a inicio de año", generalizado a
// todo el histórico en vez de solo al año pasado.
export function evolucionAnualPatrimonio() {
  const data = store.get();
  if (!data.positions.length) return [];

  const firstYear = Math.min(...data.positions.map((p) => Number(p.date.slice(0, 4))));
  const currentYear = new Date().getFullYear();

  const years = [];
  for (let year = firstYear; year <= currentYear; year++) {
    years.push({ year, total: valorTotalHasta(`${year}-12-31`) });
  }

  return years.map((y, i) => ({
    ...y,
    yoyPct: i === 0 || !years[i - 1].total ? null : ((y.total - years[i - 1].total) / years[i - 1].total) * 100,
  }));
}

// Plusvalía realizada vs. latente. Latente: activos que sigues manteniendo
// (valor actual - aportado a ese activo). Realizada: activos que ya no
// tienes ninguna posición Y que en algún momento vendiste o retiraste del
// todo (aportado neto de ese activo pasa a ser, con el signo cambiado, la
// ganancia o pérdida ya materializada). Un activo recién dado de alta que
// aún no tiene ni posición ni venta/retirada registrada no cuenta en
// ninguna de las dos — sigue pendiente de valorar, igual que en el aviso de
// "activos sin valor actual registrado".
//
// Limitación conocida: si vendes solo PARTE de un activo que sigues
// manteniendo, esa ganancia parcial ya realizada queda mezclada dentro de
// "latente" para ese activo (no hay un desglose por lote/participación
// individual) — separarlo del todo requeriría trackear coste por lote, que
// hoy no se registra.
export function plusvaliaRealizadaVsLatente() {
  const data = store.get();
  const latestByAsset = new Map();
  for (const p of latestPositionsByAssetEntity()) latestByAsset.set(p.assetId, p);

  let latente = 0;
  let realizada = 0;

  for (const asset of data.assets) {
    const aportado = aportadoNetoPorActivo(asset.id);
    const latest = latestByAsset.get(asset.id);
    if (latest) {
      latente += valueOfPosition(latest) - aportado;
      continue;
    }
    const fueVendidoORetirado = data.movements.some((m) => m.assetId === asset.id && (m.type === "venta" || m.type === "retirada"));
    if (fueVendidoORetirado) realizada += -aportado;
  }

  return { realizada, latente, total: realizada + latente };
}

// --- Fiscalidad ---

// Ganancias/pérdidas patrimoniales REALIZADAS cuyo cierre (venta o retirada
// completa del activo) cayó dentro de un año concreto — a diferencia de
// plusvaliaRealizadaVsLatente(), que da el acumulado histórico sin partir
// por año. Misma limitación: solo detecta activos vendidos/retirados del
// TODO (sin posición actual); una venta parcial de un activo que sigues
// manteniendo queda mezclada en su plusvalía latente.
export function gananciasRealizadasEnAño(year) {
  const data = store.get();
  const latestByAsset = new Map();
  for (const p of latestPositionsByAssetEntity()) latestByAsset.set(p.assetId, p);

  let total = 0;
  const detalle = [];
  for (const asset of data.assets) {
    if (latestByAsset.has(asset.id)) continue;
    const exitMovs = data.movements.filter((m) => m.assetId === asset.id && (m.type === "venta" || m.type === "retirada"));
    if (!exitMovs.length) continue;
    const exitDate = exitMovs.reduce((max, m) => (m.date > max ? m.date : max), exitMovs[0].date);
    if (Number(exitDate.slice(0, 4)) !== year) continue;
    const ganancia = -aportadoNetoPorActivo(asset.id);
    total += ganancia;
    detalle.push({ asset, ganancia });
  }
  return { total, detalle };
}

export function dividendosEnAño(year) {
  const data = store.get();
  return data.movements
    .filter((m) => m.type === "dividendo" && Number(m.date.slice(0, 4)) === year)
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);
}

export function comisionesEnAño(year) {
  const data = store.get();
  return data.movements
    .filter((m) => m.type === "comision" && Number(m.date.slice(0, 4)) === year)
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);
}

// Cuota estimada aplicando una escala de tramos progresivos (cada tramo
// tributa solo por la parte que le corresponde) — se usa tanto para el IRPF
// del ahorro como para el Impuesto sobre el Patrimonio.
// tramos: [{hasta: number|null, pct}] — hasta:null en un tramo cubre el
// resto sin límite superior; se reordenan aquí por si no vienen ordenados.
export function cuotaProgresiva(base, tramos) {
  if (!base || base <= 0 || !tramos?.length) return 0;
  const ordenados = [...tramos].sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity));
  let cuota = 0;
  let restante = base;
  let desde = 0;
  for (const t of ordenados) {
    const hasta = t.hasta ?? Infinity;
    const enTramo = Math.min(restante, hasta - desde);
    if (enTramo > 0) cuota += enTramo * (Number(t.pct) / 100);
    restante -= enTramo;
    desde = hasta;
    if (restante <= 0) break;
  }
  return cuota;
}

// Base del Impuesto sobre el Patrimonio del hogar, a repartir entre los 2
// cónyuges (gananciales al 50%, 2 sujetos pasivos): todos los activos
// financieros a valor de mercado actual (incluidas cuentas corrientes: la
// Agencia Tributaria ya tiene ese dato vía las entidades) + inmuebles
// físicos a su "valor a efectos de Patrimonio" (no el valor de mercado ni el
// precio de compra: por normativa es el mayor entre valor catastral, valor
// comprobado por la Administración a otros efectos, o valor de adquisición
// — hay que introducirlo aparte por activo) − deudas pendientes. La vivienda
// habitual descuenta primero su exención (300.000 € por contribuyente,
// 600.000 € en total al ser 2 sujetos pasivos) y solo el exceso, si lo hay,
// entra en la base.
export function baseImponiblePatrimonio() {
  let base = 0;
  let exencionViviendaHabitual = 0;

  for (const p of latestPositionsByAssetEntity()) {
    const asset = assetById(p.assetId);
    if (!asset) continue;
    const esInmuebleFisico = asset.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(asset.subclass);
    if (!esInmuebleFisico) {
      base += valueOfPosition(p);
      continue;
    }
    const valorFiscal = Number(asset.wealthTaxValue) || 0;
    if (asset.viviendaHabitual) {
      const exento = Math.min(valorFiscal, 600000);
      exencionViviendaHabitual += exento;
      base += valorFiscal - exento;
    } else {
      base += valorFiscal;
    }
  }

  const deuda = totalDeudaPendiente();
  const patrimonioNetoFiscal = base - deuda;
  return { base, exencionViviendaHabitual, deuda, patrimonioNetoFiscal, basePorSujeto: patrimonioNetoFiscal / 2 };
}

// Cuota estimada del Impuesto sobre el Patrimonio: aplica el mínimo exento
// y la escala de tramos por contribuyente (por defecto, la de Galicia), más
// la bonificación autonómica sobre la cuota íntegra, y duplica el resultado
// para el total del matrimonio (2 sujetos pasivos con base idéntica al
// repartirse el patrimonio al 50%).
export function cuotaPatrimonioEstimada() {
  const data = store.get();
  const detalle = baseImponiblePatrimonio();
  const minimoExento = Number(data.meta.patrimonioMinimoExento) || 0;
  const bonificacionPct = Number(data.meta.patrimonioBonificacionPct) || 0;
  const tramos = data.meta.tramosPatrimonio || [];

  const baseLiquidablePorSujeto = Math.max(0, detalle.basePorSujeto - minimoExento);
  const cuotaIntegraPorSujeto = cuotaProgresiva(baseLiquidablePorSujeto, tramos);
  const cuotaFinalPorSujeto = cuotaIntegraPorSujeto * (1 - bonificacionPct / 100);

  return {
    ...detalle,
    minimoExento,
    baseLiquidablePorSujeto,
    cuotaIntegraPorSujeto,
    bonificacionPct,
    cuotaFinalPorSujeto,
    cuotaFinalTotal: cuotaFinalPorSujeto * 2,
  };
}

// --- Fase 5: proyección de jubilación ---

// Ingreso anual por alquiler de todos los activos marcados como "en
// rentabilidad" (hoy solo inmuebles físicos tienen ese check, pero no se
// restringe aquí por si algún día se marca otro tipo de activo).
export function alquilerAnualTotal() {
  const data = store.get();
  return data.assets.filter((a) => a.rented).reduce((s, a) => s + (Number(a.rentaAnual) || 0), 0);
}

// Simulación año a año de cuánto dura el patrimonio FINANCIERO (los
// inmuebles no se venden ni se cuentan como fondo gastable, solo aportan su
// alquiler si se activa) a un ritmo de gasto anual que crece con la
// inflación, con una rentabilidad anual constante asumida. Es una
// simplificación deliberada: no modela volatilidad de mercado ni riesgo de
// secuencia de rentabilidad, fiscalidad sobre los reembolsos, ni pensión
// pública. Corta a los 60 años si el patrimonio no se agota antes.
const DURACION_MAX_ANIOS = 60;

export function duracionPatrimonio({ gastoAnual, rentabilidadPct, inflacionPct, incluirAlquileres }) {
  const patrimonioInicial = financialBreakdownBySubclass().total;
  const alquilerAnual = incluirAlquileres ? alquilerAnualTotal() : 0;
  const rentabilidad = (Number(rentabilidadPct) || 0) / 100;
  const inflacion = (Number(inflacionPct) || 0) / 100;

  let patrimonio = patrimonioInicial;
  const serie = [{ anio: 0, patrimonio }];

  for (let anio = 1; anio <= DURACION_MAX_ANIOS; anio++) {
    const factorInflacion = Math.pow(1 + inflacion, anio - 1);
    const gastoNeto = (Number(gastoAnual) || 0) * factorInflacion - alquilerAnual * factorInflacion;
    patrimonio = patrimonio * (1 + rentabilidad) - gastoNeto;
    if (patrimonio <= 0) {
      serie.push({ anio, patrimonio: 0 });
      return { patrimonioInicial, alquilerAnual, aniosDuracion: anio, agotado: true, serie };
    }
    serie.push({ anio, patrimonio });
  }
  return { patrimonioInicial, alquilerAnual, aniosDuracion: DURACION_MAX_ANIOS, agotado: false, serie };
}

// Simula la compra de una propiedad adicional financiada con hipoteca a
// tipo fijo: impuestos de la operación (ITP progresivo si es vivienda usada,
// o IVA+AJD si es nueva) + otros gastos (notaría, registro, gestoría),
// entrada necesaria, cuota mensual (sistema francés, cuota constante) y el
// impacto real en patrimonio neto y liquidez. El precio pagado se convierte
// en un activo del mismo valor, así que el patrimonio neto solo baja por
// los costes de la operación (impuestos + otros gastos), no por el precio
// en sí — la entrada y la hipoteca son solo la forma de financiarlo.
export function simulacionCompraPropiedad({ precio, tipoVivienda, importeHipoteca, tipoInteresPct, plazoAnios }) {
  const data = store.get();
  const otrosGastosPct = Number(data.meta.otrosGastosCompraPct) || 0;

  const impuestos =
    tipoVivienda === "nueva"
      ? precio * ((Number(data.meta.ivaViviendaNuevaPct) || 0) / 100) + precio * ((Number(data.meta.ajdViviendaNuevaPct) || 0) / 100)
      : cuotaProgresiva(precio, data.meta.tramosItpVivienda || []);

  const otrosGastos = precio * (otrosGastosPct / 100);
  const costeTotalAdquisicion = precio + impuestos + otrosGastos;
  const entradaNecesaria = costeTotalAdquisicion - importeHipoteca;

  const tipoMensual = (Number(tipoInteresPct) || 0) / 100 / 12;
  const meses = Math.round((Number(plazoAnios) || 0) * 12);
  let cuotaMensual = 0;
  if (importeHipoteca > 0 && meses > 0) {
    cuotaMensual =
      tipoMensual === 0
        ? importeHipoteca / meses
        : (importeHipoteca * tipoMensual * Math.pow(1 + tipoMensual, meses)) / (Math.pow(1 + tipoMensual, meses) - 1);
  }
  const totalIntereses = cuotaMensual * meses - importeHipoteca;

  const liquidezActual = patrimonioConsolidado().liquidez;
  const patrimonioNetoActual = patrimonioNeto();

  return {
    impuestos,
    otrosGastos,
    costeTotalAdquisicion,
    entradaNecesaria,
    cuotaMensual,
    totalIntereses,
    liquidezActual,
    liquidezRestante: liquidezActual - entradaNecesaria,
    patrimonioNetoActual,
    impactoPatrimonioNeto: -(impuestos + otrosGastos),
    cuotaMensualActual: totalCuotaMensual(),
    cuotaMensualTotalDespues: totalCuotaMensual() + cuotaMensual,
  };
}

// Simulador "¿y si vendo todo hoy?": parte de la plusvalía latente total
// (todo lo que sigues manteniendo, si se materializara íntegra hoy) y estima
// el coste fiscal INCREMENTAL de hacerlo — no aislado, sino sumado a lo que
// ya llevas realizado este año (ganancias + dividendos) — porque los tramos
// del ahorro son progresivos y el coste real de una nueva ganancia depende
// de en qué tramo te deja lo que ya has realizado. Si la latente es negativa
// (más pérdidas que ganancias en lo que mantienes), el resultado puede salir
// negativo: significaría ahorro de cuota, no coste, al compensar pérdidas
// contra lo ya realizado. No contempla gastos/deducciones específicos de la
// venta de inmuebles (notaría, plusvalía municipal...) ni límites reales de
// compensación de pérdidas entre categorías.
export function simulacionVenderTodoHoy(year) {
  const data = store.get();
  const { latente } = plusvaliaRealizadaVsLatente();
  const yaRealizadoEsteAño = gananciasRealizadasEnAño(year).total + dividendosEnAño(year);
  const tramos = data.meta.tramosAhorro || [];

  const cuotaYaDebida = cuotaProgresiva(Math.max(0, yaRealizadoEsteAño), tramos);
  const cuotaSiVendieraTodo = cuotaProgresiva(Math.max(0, yaRealizadoEsteAño + latente), tramos);

  return { latente, yaRealizadoEsteAño, cuotaYaDebida, cuotaSiVendieraTodo, costeIncremental: cuotaSiVendieraTodo - cuotaYaDebida };
}

// Colchón de liquidez (cuentas corrientes + ahorro + depósitos) mes a mes,
// desde el primer mes con alguna posición de liquidez hasta el actual —
// mismo criterio de "última posición conocida hasta la fecha de corte" que
// evolucionAnualPatrimonio(), pero mensual en vez de anual, y solo sobre la
// clase Liquidez (sin inmobiliario ni el resto de lo financiero).
export function evolucionMensualLiquidez() {
  const data = store.get();
  const isLiquidez = (assetId) => assetById(assetId)?.class === "liquidez";
  const liquidezDates = data.positions.filter((p) => isLiquidez(p.assetId)).map((p) => p.date);
  if (!liquidezDates.length) return [];

  const firstMonth = liquidezDates.reduce((min, d) => (d < min ? d : min)).slice(0, 7);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const months = [];
  let [y, m] = firstMonth.split("-").map(Number);
  const [cy, cm] = currentMonth.split("-").map(Number);
  while (y < cy || (y === cy && m <= cm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const points = months.map((monthKey) => {
    const cutoff = `${monthKey}-31`;
    const map = new Map();
    for (const p of data.positions) {
      if (!isLiquidez(p.assetId)) continue;
      if (p.date > cutoff) continue;
      const key = p.entityId + "|" + p.assetId;
      const prev = map.get(key);
      if (!prev || p.date >= prev.date) map.set(key, p);
    }
    let total = 0;
    for (const p of map.values()) total += valueOfPosition(p);
    return { month: monthKey, total };
  });

  return points.map((pt, i) => ({
    ...pt,
    momPct: i === 0 || !points[i - 1].total ? null : ((pt.total - points[i - 1].total) / points[i - 1].total) * 100,
  }));
}

// --- Fase 4: alertas y rebalanceo ---

// Compara el reparto real por clase (totalsByClass, ya reparte los Mixtos
// con % RV/RF definido) contra el % objetivo configurado en Ajustes, y
// marca alerta cuando la desviación absoluta supera el umbral.
export function desviacionAsignacion() {
  const data = store.get();
  const totals = totalsByClass();
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const objetivo = data.meta.objetivoClase || {};
  const umbral = Number(data.meta.desviacionUmbralPct) || 0;

  return Object.keys(ASSET_CLASSES).map((cls) => {
    const actualPct = total ? (totals[cls] / total) * 100 : 0;
    const objetivoPct = Number(objetivo[cls]) || 0;
    const desviacion = actualPct - objetivoPct;
    return { cls, label: ASSET_CLASSES[cls].label, actualPct, objetivoPct, desviacion, alerta: Math.abs(desviacion) > umbral };
  });
}

// Concentración por activo individual, solo sobre patrimonio FINANCIERO
// (excluye inmobiliario, igual que financialBreakdownBySubclass): tener tu
// vivienda no es un riesgo de concentración que se pueda rebalancear, así
// que incluirla solo generaría ruido. No detecta concentración real por
// emisor si un mismo valor está repartido entre varios fondos — eso
// requiere un análisis look-through, todavía no implementado.
export function concentracionPorActivo() {
  const { total } = financialBreakdownBySubclass();
  const umbral = Number(store.get().meta.concentracionActivoUmbralPct) || 0;

  return financialPositions()
    .map(({ p, asset }) => {
      const value = valueOfPosition(p);
      return { asset, value, pct: total ? (value / total) * 100 : 0 };
    })
    .filter((r) => r.pct > umbral)
    .sort((a, b) => b.pct - a.pct);
}

// Concentración por entidad custodia, sobre el mismo patrimonio financiero
// que financialTotalsByEntity() (excluye inmobiliario).
export function concentracionPorEntidad() {
  const { rows, total } = financialTotalsByEntity();
  const umbral = Number(store.get().meta.concentracionEntidadUmbralPct) || 0;
  return rows.map((r) => ({ ...r, pct: total ? (r.value / total) * 100 : 0 })).filter((r) => r.pct > umbral);
}

// Depósitos a plazo y bonos/obligaciones con vencimiento dentro de los
// próximos N días configurados (o ya vencidos), entre los que sigues
// manteniendo (con posición actual). Se ordenan por más urgente primero.
export function vencimientosProximos() {
  const data = store.get();
  const diasAviso = Number(data.meta.vencimientoDiasAviso) || 0;
  const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const latestByAsset = new Map();
  for (const p of latestPositionsByAssetEntity()) latestByAsset.set(p.assetId, p);

  return data.assets
    .filter((a) => a.vencimiento && latestByAsset.has(a.id))
    .map((a) => ({ asset: a, dias: Math.round((new Date(a.vencimiento + "T00:00:00") - hoy) / 86400000) }))
    .filter((r) => r.dias <= diasAviso)
    .sort((a, b) => a.dias - b.dias);
}
