import { ASSET_CLASSES, SUBCLASSES, RISK_SCALE_MAX, REAL_ESTATE_SUBCLASSES } from "./model.js";
import { store } from "./store.js";

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

let editingAssetId = null;

export function renderCatalog(container) {
  const data = store.get();
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";
  const editing = editingAssetId ? data.assets.find((a) => a.id === editingAssetId) : null;

  container.innerHTML = `
    <div class="cat-grid">
      <section class="card">
        <h3>Entidades</h3>
        <form id="form-entity" class="inline-form">
          <input name="name" placeholder="Nombre de la entidad (ej. MyInvestor)" required />
          <button type="submit">Añadir</button>
        </form>
        <ul class="simple-list">
          ${data.entities
            .map((e) => `<li>${e.name} <button data-remove-entity="${e.id}" class="link-btn danger">eliminar</button></li>`)
            .join("") || '<li class="muted">Sin entidades todavía</li>'}
        </ul>
      </section>

      <section class="card">
        <h3>Activos</h3>
        ${
          data.entities.length === 0
            ? `<p class="muted">Añade primero al menos una entidad (a la izquierda); cada activo pertenece a una entidad concreta.</p>`
            : `<form id="form-asset" class="stacked-form">
                <label>Entidad
                  <select name="entityId" id="entity-select" required>
                    <option value="" ${!editing?.entityId ? "selected" : ""}>(sin entidad — patrimonio propio)</option>
                    ${data.entities
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
                  <label class="checkbox-label"><input name="rented" type="checkbox" ${editing?.rented ? "checked" : ""} /> En rentabilidad (alquilado)</label>
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
              ${data.assets
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
                    <td>${a.subclass || "—"}${a.class === "mixto" && a.mixRvPct != null ? ` (${a.mixRvPct}% RV / ${100 - a.mixRvPct}% RF)` : ""}${a.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(a.subclass) ? ` <span class="muted">(compra ${fmtEUR(a.purchasePrice)}${a.rented ? " · en rentabilidad" : ""})</span>` : ""}</td>
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
    </div>
  `;

  const classSelect = container.querySelector('select[name="class"]');
  const subclassSelect = container.querySelector('select[name="subclass"]');
  const entitySelect = container.querySelector("#entity-select");
  const mixField = container.querySelector("#mix-field");
  const realEstateFields = container.querySelector("#real-estate-fields");
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
    }
    classSelect.addEventListener("change", () => {
      refreshSubclasses();
      refreshMixField();
      refreshRealEstateFields();
    });
    subclassSelect.addEventListener("change", refreshRealEstateFields);
    if (!editing) refreshSubclasses();
    else {
      // Aseguramos que las opciones de subclase correspondan a la clase ya seleccionada al editar
      classSelect.value = editing.class;
      refreshSubclasses();
    }
    refreshMixField();
    refreshRealEstateFields();
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
    const payload = {
      entityId: fd.get("entityId") || null,
      name: fd.get("name").trim(),
      class: fd.get("class"),
      subclass: fd.get("subclass"),
      isin: fd.get("isin").trim(),
      riskScore: fd.get("riskScore") ? Number(fd.get("riskScore")) : null,
      mixRvPct: fd.get("class") === "mixto" && fd.get("mixRvPct") ? Number(fd.get("mixRvPct")) : null,
      purchasePrice: isRealEstate && fd.get("purchasePrice") ? Number(fd.get("purchasePrice")) : null,
      rented: isRealEstate ? fd.get("rented") === "on" : false,
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
