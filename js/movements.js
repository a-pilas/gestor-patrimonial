import { MOVEMENT_TYPES, UNIT_TRADED_SUBCLASSES } from "./model.js";
import { store } from "./store.js";
import { openModal } from "./modal.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export function renderMovements(container) {
  const data = store.get();

  if (!data.entities.length) {
    container.innerHTML = `<section class="card">
      <p>Antes de registrar movimientos necesitas dar de alta al menos una <strong>entidad</strong> en la pestaña "Activos".</p>
    </section>`;
    return;
  }

  const sorted = [...data.movements].sort((a, b) => (a.date < b.date ? 1 : -1));
  const assetById = (id) => data.assets.find((a) => a.id === id);
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";
  const assetLabel = (a) => (a.entityId ? `${a.name} — ${entityName(a.entityId)}` : a.name);
  const isUnitTraded = (assetId) => {
    const a = assetById(assetId);
    return a && UNIT_TRADED_SUBCLASSES.includes(a.subclass);
  };

  container.innerHTML = `
    <div class="section-head">
      <h3>Movimientos</h3>
      <button id="btn-new-movement">+ Nuevo movimiento</button>
    </div>

    <section class="card">
      <h3>Histórico de movimientos</h3>
      <div class="table-wrap">
        <table class="table table-history">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Entidad</th><th>Activo</th><th>Unidades</th><th>Importe</th><th></th></tr></thead>
          <tbody>
            ${
              sorted
                .map((m) => {
                  const entity = data.entities.find((e) => e.id === m.entityId);
                  const asset = assetById(m.assetId);
                  return `<tr>
                    <td>${m.date}</td>
                    <td>${MOVEMENT_TYPES[m.type] || m.type}</td>
                    <td>${entity?.name || "—"}</td>
                    <td>${asset?.name || "—"}</td>
                    <td>${m.units ?? "—"}</td>
                    <td>${fmtEUR(m.amount)}</td>
                    <td>
                      <button data-edit="${m.id}" class="link-btn">editar</button>
                      <button data-remove="${m.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`;
                })
                .join("") || '<tr><td colspan="7" class="muted">Sin movimientos todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  function openMovementForm(editing) {
    openModal(editing ? "Editar movimiento" : "Nuevo movimiento", (body, closeModal) => {
      body.innerHTML = `
        <form id="form-movement" class="stacked-form">
          <label>Fecha <input name="date" type="date" value="${editing?.date || todayIso()}" required /></label>
          <label>Tipo
            <select name="type" required>${Object.entries(MOVEMENT_TYPES)
              .map(([k, v]) => `<option value="${k}" ${k === editing?.type ? "selected" : ""}>${v}</option>`)
              .join("")}</select>
          </label>
          <label>Activo relacionado
            <select name="assetId"><option value="">(ninguno / efectivo)</option>${data.assets
              .map((a) => `<option value="${a.id}" ${a.id === editing?.assetId ? "selected" : ""}>${assetLabel(a)}</option>`)
              .join("")}</select>
          </label>
          <label>Entidad
            <select name="entityId" required><option value="">(sin entidad)</option>${data.entities
              .map((e) => `<option value="${e.id}" ${e.id === editing?.entityId ? "selected" : ""}>${e.name}</option>`)
              .join("")}</select>
          </label>
          <label id="units-field" style="display:none">Unidades / participaciones
            <input name="units" type="number" step="any" value="${editing?.units ?? ""}" />
          </label>
          <label id="nav-field" style="display:none">Valor liquidativo (€/participación)
            <input name="navValue" type="number" step="any" value="${editing?.navValue ?? ""}" />
          </label>
          <label>Importe (€) <input name="amount" type="number" step="any" value="${editing?.amount ?? ""}" required /></label>
          <label>Notas <input name="notes" placeholder="Opcional" value="${editing?.notes || ""}" /></label>
          <button type="submit">${editing ? "Guardar cambios" : "Guardar movimiento"}</button>
        </form>
      `;

      const form = body.querySelector("#form-movement");
      const assetSelect = form.querySelector('select[name="assetId"]');
      const entitySelect = form.querySelector('select[name="entityId"]');
      const unitsField = form.querySelector("#units-field");
      const navField = form.querySelector("#nav-field");
      const unitsInput = form.querySelector('input[name="units"]');
      const navInput = form.querySelector('input[name="navValue"]');
      const amountInput = form.querySelector('input[name="amount"]');

      function refreshEntityFromAsset() {
        const asset = assetById(assetSelect.value);
        if (asset) {
          entitySelect.value = asset.entityId || "";
          entitySelect.disabled = true;
        } else {
          entitySelect.disabled = false;
        }
      }
      // Los campos de unidades/valor liquidativo se ofrecen para cualquier tipo de
      // movimiento (aportación, compra, traspaso...) siempre que el activo se compre
      // por participaciones, no solo para Compra/Venta.
      function refreshUnitsVisibility() {
        const show = isUnitTraded(assetSelect.value);
        unitsField.style.display = show ? "" : "none";
        navField.style.display = show ? "" : "none";
      }
      function recalcAmount() {
        const units = parseFloat(unitsInput.value);
        const nav = parseFloat(navInput.value);
        if (!isNaN(units) && !isNaN(nav)) amountInput.value = (units * nav).toFixed(2);
      }

      assetSelect.addEventListener("change", () => {
        refreshEntityFromAsset();
        refreshUnitsVisibility();
      });
      unitsInput.addEventListener("input", recalcAmount);
      navInput.addEventListener("input", recalcAmount);
      refreshEntityFromAsset();
      refreshUnitsVisibility();

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const asset = assetById(fd.get("assetId"));
        const payload = {
          date: fd.get("date"),
          type: fd.get("type"),
          entityId: asset ? asset.entityId : fd.get("entityId"),
          assetId: fd.get("assetId") || null,
          units: fd.get("units") ? Number(fd.get("units")) : null,
          navValue: fd.get("navValue") ? Number(fd.get("navValue")) : null,
          amount: Number(fd.get("amount")),
          notes: fd.get("notes") || "",
        };
        if (editing) {
          store.updateMovement(editing.id, payload);
        } else {
          store.addMovement(payload);
        }
        closeModal();
        renderMovements(container);
      });
    });
  }

  container.querySelector("#btn-new-movement").addEventListener("click", () => openMovementForm(null));

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const mov = data.movements.find((m) => m.id === btn.dataset.edit);
      openMovementForm(mov);
    })
  );

  container.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar este movimiento?")) {
        store.removeMovement(btn.dataset.remove);
        renderMovements(container);
      }
    })
  );
}
