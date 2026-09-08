import {
  ASSET_CLASSES,
  SUBCLASSES,
  RISK_SCALE_MAX,
  REAL_ESTATE_SUBCLASSES,
  SUBCLASSES_CON_VENCIMIENTO,
  GEO_REGIONS,
  LIQUIDEZ_OPERATIVA_SUBCLASSES,
  COST_FIELDS,
} from "./model.js";
import { store } from "./store.js";

// Mismo criterio que esInversionFinanciera() en metrics.js (TWR, look-through
// del X-Ray...), pero sobre los valores sueltos del formulario en vez de un
// objeto Asset ya guardado.
function esFinancieroLookThrough(classVal, subclassVal) {
  return classVal !== "inmobiliario" && !LIQUIDEZ_OPERATIVA_SUBCLASSES.includes(subclassVal);
}

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

let editingAssetId = null;

export function renderCatalog(container) {
  const data = store.get();
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";
  const editing = editingAssetId ? data.assets.find((a) => a.id === editingAssetId) : null;

  const sortedEntities = [...data.entities].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const sortedAssets = [...data.assets].sort((a, b) => {
    const entityCmp = entityName(a.entityId).localeCompare(entityName(b.entityId), "es");
    if (entityCmp !== 0) return entityCmp;
    return a.name.localeCompare(b.name, "es");
  });

  container.innerHTML = `
    <section class="card">
      <h3>Entidades</h3>
      <form id="form-entity" class="inline-form">
        <input name="name" placeholder="Nombre de la entidad (ej. MyInvestor)" required />
        <button type="submit">Añadir</button>
      </form>
      <ul class="entity-chips">
        ${sortedEntities
          .map((e) => `<li>${e.name} <button data-remove-entity="${e.id}" class="link-btn danger">×</button></li>`)
          .join("") || '<li class="muted">Sin entidades todavía</li>'}
      </ul>
    </section>

    <section class="card">
      <h3>Activos</h3>
      ${
        data.entities.length === 0
          ? `<p class="muted">Añade primero al menos una entidad (arriba); cada activo pertenece a una entidad concreta.</p>`
          : `<form id="form-asset" class="stacked-form">
                <label>Entidad
                  <select name="entityId" id="entity-select" required>
                    <option value="" ${!editing?.entityId ? "selected" : ""}>(sin entidad — patrimonio propio)</option>
                    ${sortedEntities
                      .map((e) => `<option value="${e.id}" ${e.id === editing?.entityId ? "selected" : ""}>${e.name}</option>`)
                      .join("")}
                  </select>
                </label>
                <label>Nombre <input name="name" required placeholder="Ej. Vanguard Global Stock Index" value="${editing?.name || ""}" /></label>
                <label>Clase
                  <select name="class" required>
                    ${Object.entries(ASSET_CLASSES)
                      .map(([k, c]) => `<option value="${k}" ${k === editing?.class ? "selected" : ""}>${c.label}</option>`)
                      .join("")}
                  </select>
                </label>
                <label>Subclase
                  <select name="subclass"></select>
                </label>
                <label>ISIN / Ticker <input name="isin" placeholder="Opcional" value="${editing?.isin || ""}" /></label>
                <label>Score de riesgo (SRRI, 1-${RISK_SCALE_MAX}) <input name="riskScore" type="number" min="1" max="${RISK_SCALE_MAX}" step="1" value="${editing?.riskScore ?? ""}" placeholder="Por defecto según clase" /></label>
                <label id="mix-field" style="display:none">% en Renta variable (el resto se asume Renta fija)
                  <input name="mixRvPct" type="number" min="0" max="100" step="1" value="${editing?.mixRvPct ?? ""}" placeholder="Ej. 60 (para 60% RV / 40% RF)" />
                </label>
                <div id="real-estate-fields" style="display:none">
                  <label>Precio de compra (€) <input name="purchasePrice" type="number" step="any" value="${editing?.purchasePrice ?? ""}" placeholder="Opcional" /></label>
                  <label>Fecha de adquisición <input name="acquisitionDate" type="date" value="${editing?.acquisitionDate || ""}" placeholder="Opcional" /></label>
                  <label class="checkbox-label"><input name="rented" type="checkbox" ${editing?.rented ? "checked" : ""} /> En rentabilidad (alquilado)</label>
                  <label id="renta-anual-field" style="display:none">Ingreso anual por alquiler (€)
                    <input name="rentaAnual" type="number" step="any" min="0" value="${editing?.rentaAnual ?? ""}" placeholder="Total al año, antes de gastos/impuestos" />
                  </label>
                  <label id="vivienda-habitual-field" style="display:none" class="checkbox-label">
                    <input name="viviendaHabitual" type="checkbox" ${editing?.viviendaHabitual ? "checked" : ""} /> Es tu vivienda habitual
                  </label>
                  <label>Valor a efectos de Impuesto sobre Patrimonio (€)
                    <input name="wealthTaxValue" type="number" step="any" value="${editing?.wealthTaxValue ?? ""}" placeholder="El mayor entre valor catastral, valor comprobado por la Administración y precio de compra" />
                  </label>
                </div>
                <label id="vencimiento-field" style="display:none">Fecha de vencimiento
                  <input name="vencimiento" type="date" value="${editing?.vencimiento || ""}" />
                </label>
                <div id="lookthrough-field" style="display:none">
                  <label class="checkbox-label"><input name="hedged" type="checkbox" ${editing?.hedged ? "checked" : ""} /> Cubierto a EUR (hedged)</label>
                  <p class="muted">Opcional: de dónde vienen de verdad sus posiciones subyacentes (según el KIID/factsheet del fondo), para el informe X-Ray. Déjalo en blanco si no lo sabes — no hace falta rellenarlo para todos los fondos a la vez, el informe funciona con los que vayas completando.</p>
                  ${GEO_REGIONS.map(
                    (r) => `<label>${r.label} (%) <input name="geo_${r.key}" type="number" min="0" max="100" step="any" value="${editing?.geoBreakdown?.[r.key] ?? ""}" /></label>`
                  ).join("")}
                </div>
                <div id="costes-field" style="display:none">
                  <p class="muted">Opcional: costes recurrentes anuales, para el seguimiento de costes de Fiscalidad. Déjalo en blanco lo que no sepas o no aplique (p.ej. TER en una acción individual) — no hace falta rellenarlo todo de golpe.</p>
                  ${COST_FIELDS.map(
                    (f) => `<label>${f.label} <input name="coste_${f.key}" type="number" min="0" step="any" value="${editing?.costes?.[f.key] ?? ""}" /></label>`
                  ).join("")}
                </div>
                <div class="btn-row">
                  <button type="submit">${editing ? "Guardar cambios" : "Añadir activo"}</button>
                  ${editing ? `<button type="button" id="cancel-edit-asset">Cancelar</button>` : ""}
                </div>
              </form>`
      }

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Nombre</th><th>Entidad</th><th>Clase</th><th>Subclase</th><th>ISIN</th><th>Riesgo</th><th></th></tr></thead>
          <tbody>
            ${sortedAssets
              .map(
                  (a) => `<tr>
                    <td>${a.name}</td>
                    <td>${
                      a.entityId
                        ? entityName(a.entityId)
                        : a.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(a.subclass)
                        ? '<span class="muted">patrimonio propio</span>'
                        : '<span class="neg">sin asignar</span>'
                    }</td>
                    <td>${ASSET_CLASSES[a.class]?.label || a.class}</td>
                    <td>${a.subclass || "—"}${a.class === "mixto" && a.mixRvPct != null ? ` (${a.mixRvPct}% RV / ${100 - a.mixRvPct}% RF)` : ""}${
                      a.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(a.subclass)
                        ? ` <span class="muted">(compra ${fmtEUR(a.purchasePrice)}${a.acquisitionDate ? ` el ${a.acquisitionDate}` : ""}${a.rented ? ` · en rentabilidad${a.rentaAnual ? ` (${fmtEUR(a.rentaAnual)}/año)` : ""}` : ""}${a.viviendaHabitual ? " · vivienda habitual" : ""}${a.wealthTaxValue ? ` · Patrimonio ${fmtEUR(a.wealthTaxValue)}` : ""})</span>`
                        : ""
                    }${a.vencimiento ? ` <span class="muted">(vence ${a.vencimiento})</span>` : ""}${
                      a.geoBreakdown ? ` <span class="muted">(look-through${a.hedged ? " · hedged" : ""})</span>` : ""
                    }${a.costes ? ` <span class="muted">(costes)</span>` : ""}</td>
                    <td>${a.isin || "—"}</td>
                    <td>${a.riskScore ?? "—"}</td>
                    <td>
                      <button data-edit-asset="${a.id}" class="link-btn">editar</button>
                      <button data-remove-asset="${a.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`
              )
              .join("") || '<tr><td colspan="7" class="muted">Sin activos todavía</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const classSelect = container.querySelector('select[name="class"]');
  const subclassSelect = container.querySelector('select[name="subclass"]');
  const entitySelect = container.querySelector("#entity-select");
  const mixField = container.querySelector("#mix-field");
  const realEstateFields = container.querySelector("#real-estate-fields");
  const viviendaHabitualField = container.querySelector("#vivienda-habitual-field");
  const vencimientoField = container.querySelector("#vencimiento-field");
  const lookthroughField = container.querySelector("#lookthrough-field");
  const costesField = container.querySelector("#costes-field");
  const rentedCheckbox = container.querySelector('input[name="rented"]');
  const rentaAnualField = container.querySelector("#renta-anual-field");
  if (rentedCheckbox) {
    function refreshRentaAnualField() {
      rentaAnualField.style.display = rentedCheckbox.checked ? "" : "none";
    }
    rentedCheckbox.addEventListener("change", refreshRentaAnualField);
    refreshRentaAnualField();
  }
  if (classSelect && subclassSelect) {
    function refreshSubclasses() {
      const opts = SUBCLASSES[classSelect.value] || [];
      subclassSelect.innerHTML = opts
        .map((s) => `<option value="${s}" ${s === editing?.subclass ? "selected" : ""}>${s}</option>`)
        .join("");
    }
    function refreshMixField() {
      mixField.style.display = classSelect.value === "mixto" ? "" : "none";
    }
    function refreshRealEstateFields() {
      // Un inmueble físico (no un fondo/REIT) puede no tener ninguna entidad
      // custodia (p.ej. una vivienda sin hipoteca ni gestión de terceros):
      // para el resto de clases sí es obligatorio elegir una entidad.
      const isRealEstate = classSelect.value === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(subclassSelect.value);
      realEstateFields.style.display = isRealEstate ? "" : "none";
      entitySelect.required = !isRealEstate;
      // Solo una "Vivienda" puede ser la habitual, no un Local/Oficina.
      viviendaHabitualField.style.display = isRealEstate && subclassSelect.value === "Vivienda" ? "" : "none";
    }
    function refreshVencimientoField() {
      vencimientoField.style.display = SUBCLASSES_CON_VENCIMIENTO.includes(subclassSelect.value) ? "" : "none";
    }
    function refreshLookthroughField() {
      lookthroughField.style.display = esFinancieroLookThrough(classSelect.value, subclassSelect.value) ? "" : "none";
    }
    function refreshCostesField() {
      costesField.style.display = esFinancieroLookThrough(classSelect.value, subclassSelect.value) ? "" : "none";
    }
    classSelect.addEventListener("change", () => {
      refreshSubclasses();
      refreshMixField();
      refreshRealEstateFields();
      refreshVencimientoField();
      refreshLookthroughField();
      refreshCostesField();
    });
    subclassSelect.addEventListener("change", () => {
      refreshRealEstateFields();
      refreshVencimientoField();
      refreshLookthroughField();
      refreshCostesField();
    });
    if (!editing) refreshSubclasses();
    else {
      // Aseguramos que las opciones de subclase correspondan a la clase ya seleccionada al editar
      classSelect.value = editing.class;
      refreshSubclasses();
    }
    refreshMixField();
    refreshRealEstateFields();
    refreshVencimientoField();
    refreshLookthroughField();
    refreshCostesField();
  }

  container.querySelector("#form-entity").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    store.addEntity(fd.get("name").trim());
    renderCatalog(container);
  });

  container.querySelector("#form-asset")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const isRealEstate = fd.get("class") === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(fd.get("subclass"));
    const esFinanciero = esFinancieroLookThrough(fd.get("class"), fd.get("subclass"));
    let geoBreakdown = null;
    if (esFinanciero) {
      const valores = GEO_REGIONS.map((r) => fd.get(`geo_${r.key}`));
      if (valores.some((v) => v !== "" && v != null)) {
        geoBreakdown = {};
        GEO_REGIONS.forEach((r, i) => {
          geoBreakdown[r.key] = valores[i] === "" || valores[i] == null ? 0 : Number(valores[i]);
        });
      }
    }
    let costes = null;
    if (esFinanciero) {
      const valoresCoste = COST_FIELDS.map((f) => fd.get(`coste_${f.key}`));
      if (valoresCoste.some((v) => v !== "" && v != null)) {
        costes = {};
        COST_FIELDS.forEach((f, i) => {
          costes[f.key] = valoresCoste[i] === "" || valoresCoste[i] == null ? null : Number(valoresCoste[i]);
        });
      }
    }
    const payload = {
      entityId: fd.get("entityId") || null,
      name: fd.get("name").trim(),
      class: fd.get("class"),
      subclass: fd.get("subclass"),
      isin: fd.get("isin").trim(),
      riskScore: fd.get("riskScore") ? Number(fd.get("riskScore")) : null,
      mixRvPct: fd.get("class") === "mixto" && fd.get("mixRvPct") ? Number(fd.get("mixRvPct")) : null,
      purchasePrice: isRealEstate && fd.get("purchasePrice") ? Number(fd.get("purchasePrice")) : null,
      acquisitionDate: isRealEstate && fd.get("acquisitionDate") ? fd.get("acquisitionDate") : null,
      rented: isRealEstate ? fd.get("rented") === "on" : false,
      rentaAnual: isRealEstate && fd.get("rented") === "on" && fd.get("rentaAnual") ? Number(fd.get("rentaAnual")) : null,
      wealthTaxValue: isRealEstate && fd.get("wealthTaxValue") ? Number(fd.get("wealthTaxValue")) : null,
      viviendaHabitual: isRealEstate && fd.get("subclass") === "Vivienda" ? fd.get("viviendaHabitual") === "on" : false,
      vencimiento: SUBCLASSES_CON_VENCIMIENTO.includes(fd.get("subclass")) && fd.get("vencimiento") ? fd.get("vencimiento") : null,
      hedged: esFinanciero ? fd.get("hedged") === "on" : false,
      geoBreakdown,
      costes,
    };
    if (editingAssetId) {
      store.updateAsset(editingAssetId, payload);
      editingAssetId = null;
    } else {
      store.addAsset(payload);
    }
    renderCatalog(container);
  });

  container.querySelector("#cancel-edit-asset")?.addEventListener("click", () => {
    editingAssetId = null;
    renderCatalog(container);
  });

  container.querySelectorAll("[data-edit-asset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      editingAssetId = btn.dataset.editAsset;
      renderCatalog(container);
    })
  );

  container.querySelectorAll("[data-remove-entity]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar esta entidad? Los activos y posiciones asociados no se borrarán automáticamente.")) {
        store.removeEntity(btn.dataset.removeEntity);
        renderCatalog(container);
      }
    })
  );

  container.querySelectorAll("[data-remove-asset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar este activo? Las posiciones asociadas no se borrarán automáticamente.")) {
        store.removeAsset(btn.dataset.removeAsset);
        if (editingAssetId === btn.dataset.removeAsset) editingAssetId = null;
        renderCatalog(container);
      }
    })
  );
}
