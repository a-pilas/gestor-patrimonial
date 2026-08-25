import { UNIT_TRADED_SUBCLASSES } from "./model.js";
import { store, latestPositionsByAssetEntity } from "./store.js";
import { aportadoNetoPorActivo } from "./metrics.js";
import { openModal } from "./modal.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export function renderPositions(container) {
  const data = store.get();

  if (!data.entities.length || !data.assets.length) {
    container.innerHTML = `<section class="card">
      <p>Antes de introducir posiciones necesitas dar de alta al menos una <strong>entidad</strong> y un <strong>activo</strong> en la pestaña "Activos".</p>
    </section>`;
    return;
  }

  const assetById = (id) => data.assets.find((a) => a.id === id);
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";

  const sorted = [...data.positions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const resumenRows = data.assets
    .map((a) => {
      const latest = latestPositionsByAssetEntity().find((p) => p.assetId === a.id);
      const valorActual = latest ? Number(latest.value) : null;
      const aportado = aportadoNetoPorActivo(a.id);
      const plusvalia = valorActual != null ? valorActual - aportado : null;
      return { asset: a, valorActual, aportado, plusvalia };
    })
    .sort((a, b) => (b.valorActual || 0) - (a.valorActual || 0));

  container.innerHTML = `
    <div class="section-head">
      <h3>Posiciones</h3>
      <button id="btn-new-position">+ Nueva posición</button>
    </div>

    <section class="card">
      <h3>Resumen por activo</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Activo</th><th>Entidad</th><th>Aportado</th><th>Valor actual</th><th>Plusvalía</th></tr></thead>
          <tbody>
            ${
              resumenRows
                .map(
                  (r) => `<tr>
                    <td>${r.asset.name}</td>
                    <td>${entityName(r.asset.entityId)}</td>
                    <td>${fmtEUR(r.aportado)}</td>
                    <td>${r.valorActual != null ? fmtEUR(r.valorActual) : `<button data-add-position="${r.asset.id}" class="link-btn danger">sin posición, añadir</button>`}</td>
                    <td class="${r.plusvalia >= 0 ? "pos" : "neg"}">${r.plusvalia != null ? fmtEUR(r.plusvalia) : "—"}</td>
                  </tr>`
                )
                .join("") || '<tr><td colspan="5" class="muted">Sin activos todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h3>Histórico de posiciones</h3>
      <div class="table-wrap">
        <table class="table table-history">
          <thead><tr><th>Fecha</th><th>Entidad</th><th>Activo</th><th>Unidades</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            ${
              sorted
                .map((p) => {
                  const asset = assetById(p.assetId);
                  return `<tr>
                    <td>${p.date}</td>
                    <td>${asset ? entityName(asset.entityId) : "—"}</td>
                    <td>${asset?.name || "—"}</td>
                    <td>${p.units ?? "—"}</td>
                    <td>${fmtEUR(p.value)}</td>
                    <td>
                      <button data-edit="${p.id}" class="link-btn">editar</button>
                      <button data-remove="${p.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`;
                })
                .join("") || '<tr><td colspan="6" class="muted">Sin posiciones todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  function openPositionForm(editing, presetAssetId) {
    openModal(editing ? "Editar posición" : "Nueva posición", (body, closeModal) => {
      const isUnitTraded = (assetId) => {
        const a = assetById(assetId);
        return a && UNIT_TRADED_SUBCLASSES.includes(a.subclass);
      };
      const assetLabel = (a) => `${a.name} — ${entityName(a.entityId)}`;
      const firstAssetId = editing?.assetId || presetAssetId || data.assets[0].id;

      body.innerHTML = `
        <form id="form-position" class="stacked-form">
          <label>Fecha <input name="date" type="date" value="${editing?.date || todayIso()}" required /></label>
          <label>Activo
            <select name="assetId" required>${data.assets
              .map((a) => `<option value="${a.id}" ${a.id === firstAssetId ? "selected" : ""}>${assetLabel(a)}</option>`)
              .join("")}</select>
          </label>
          <label>Unidades / participaciones <input name="units" type="number" step="any" value="${editing?.units ?? ""}" placeholder="Opcional" /></label>
          <label id="nav-field" style="display:none">Valor liquidativo (€/participación)
            <input name="navValue" type="number" step="any" value="${editing?.navValue ?? ""}" placeholder="Se usa para calcular el valor total" />
          </label>
          <label>Valor total (€) <input name="value" type="number" step="any" value="${editing?.value ?? ""}" required /></label>
          <div class="btn-row">
            <button type="submit">${editing ? "Guardar cambios" : "Guardar posición"}</button>
          </div>
        </form>
      `;

      const form = body.querySelector("#form-position");
      const assetSelect = form.querySelector('select[name="assetId"]');
      const unitsInput = form.querySelector('input[name="units"]');
      const navField = form.querySelector("#nav-field");
      const navInput = form.querySelector('input[name="navValue"]');
      const valueInput = form.querySelector('input[name="value"]');

      function refreshNavVisibility() {
        navField.style.display = isUnitTraded(assetSelect.value) ? "" : "none";
      }
      function recalcValue() {
        const units = parseFloat(unitsInput.value);
        const nav = parseFloat(navInput.value);
        if (!isNaN(units) && !isNaN(nav)) valueInput.value = (units * nav).toFixed(2);
      }
      assetSelect.addEventListener("change", refreshNavVisibility);
      unitsInput.addEventListener("input", recalcValue);
      navInput.addEventListener("input", recalcValue);
      refreshNavVisibility();

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const asset = assetById(fd.get("assetId"));
        const payload = {
          date: fd.get("date"),
          entityId: asset?.entityId || null,
          assetId: fd.get("assetId"),
          units: fd.get("units") ? Number(fd.get("units")) : null,
          navValue: fd.get("navValue") ? Number(fd.get("navValue")) : null,
          value: Number(fd.get("value")),
        };
        if (editing) {
          store.updatePosition(editing.id, payload);
        } else {
          store.addPosition(payload);
        }
        closeModal();
        renderPositions(container);
      });
    });
  }

  container.querySelector("#btn-new-position").addEventListener("click", () => openPositionForm(null));

  container.querySelectorAll("[data-add-position]").forEach((btn) =>
    btn.addEventListener("click", () => openPositionForm(null, btn.dataset.addPosition))
  );

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const pos = data.positions.find((p) => p.id === btn.dataset.edit);
      openPositionForm(pos);
    })
  );

  container.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar esta posición?")) {
        store.removePosition(btn.dataset.remove);
        renderPositions(container);
      }
    })
  );
}
