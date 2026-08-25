import { emptyData, uid } from "./model.js";

const KEY = "gestorPatrimonial:data";

// Renombre de subclases antiguas (redundantes con la Clase) a las nuevas.
const SUBCLASS_MIGRATIONS = {
  "Fondo RF": "Fondo",
  "ETF RF": "ETF",
  "Plan de pensiones RF": "Plan de pensiones",
  "Fondo RV": "Fondo",
  "ETF RV": "ETF",
  "Plan de pensiones RV": "Plan de pensiones",
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    const merged = { ...emptyData(), ...parsed };
    // Los activos ahora pertenecen a una entidad fija. Si un activo antiguo no tenía
    // entidad y solo hay una dada de alta, se le asigna automáticamente.
    const singleEntityId = merged.entities.length === 1 ? merged.entities[0].id : null;
    merged.assets = (merged.assets || []).map((a) => ({
      ...a,
      subclass: SUBCLASS_MIGRATIONS[a.subclass] || a.subclass,
      entityId: a.entityId || singleEntityId || null,
    }));
    return merged;
  } catch (e) {
    console.error("Error cargando datos, se usa un estado vacío.", e);
    return emptyData();
  }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export const store = {
  get() {
    return data;
  },

  // --- Entidades ---
  addEntity(name) {
    const e = { id: uid(), name };
    data.entities.push(e);
    persist();
    return e;
  },
  removeEntity(id) {
    data.entities = data.entities.filter((e) => e.id !== id);
    persist();
  },

  // --- Activos ---
  addAsset(asset) {
    const a = { id: uid(), isin: "", ticker: "", currency: "EUR", riskScore: null, ...asset };
    data.assets.push(a);
    persist();
    return a;
  },
  updateAsset(id, patch) {
    data.assets = data.assets.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persist();
  },
  removeAsset(id) {
    data.assets = data.assets.filter((a) => a.id !== id);
    persist();
  },

  // --- Posiciones (snapshots mensuales) ---
  // Si ya existe una posición para la misma entidad+activo+fecha, la sobrescribe
  // en lugar de crear un duplicado (evita que quede "escondida" una versión antigua).
  addPosition(pos) {
    const existing = data.positions.find(
      (p) => p.entityId === pos.entityId && p.assetId === pos.assetId && p.date === pos.date
    );
    if (existing) {
      Object.assign(existing, pos);
      persist();
      return existing;
    }
    const p = { id: uid(), ...pos };
    data.positions.push(p);
    persist();
    return p;
  },
  updatePosition(id, patch) {
    const existing = data.positions.find((p) => p.id === id);
    if (existing) Object.assign(existing, patch);
    persist();
    return existing;
  },
  removePosition(id) {
    data.positions = data.positions.filter((p) => p.id !== id);
    persist();
  },

  // --- Movimientos ---
  addMovement(mov) {
    const m = { id: uid(), ...mov };
    data.movements.push(m);
    persist();
    return m;
  },
  updateMovement(id, patch) {
    const existing = data.movements.find((m) => m.id === id);
    if (existing) Object.assign(existing, patch);
    persist();
    return existing;
  },
  removeMovement(id) {
    data.movements = data.movements.filter((m) => m.id !== id);
    persist();
  },

  // --- Meta ---
  updateMeta(patch) {
    data.meta = { ...data.meta, ...patch };
    persist();
  },

  // --- Import / Export ---
  exportJson() {
    return JSON.stringify(data, null, 2);
  },
  importJson(json) {
    const parsed = JSON.parse(json);
    data = { ...emptyData(), ...parsed };
    persist();
  },
  replaceAll(newData) {
    data = { ...emptyData(), ...newData };
    persist();
  },
};

// --- Helpers de consulta ---

// Última posición conocida de cada (entidad, activo), sin importar la fecha.
// Ante un empate de fecha, se queda con la registrada/editada más recientemente.
export function latestPositionsByAssetEntity() {
  const map = new Map();
  for (const p of data.positions) {
    const key = p.entityId + "|" + p.assetId;
    const prev = map.get(key);
    if (!prev || p.date >= prev.date) map.set(key, p);
  }
  return [...map.values()];
}

export function assetById(id) {
  return data.assets.find((a) => a.id === id);
}

export function entityById(id) {
  return data.entities.find((e) => e.id === id);
}
