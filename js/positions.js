import { UNIT_TRADED_SUBCLASSES, REAL_ESTATE_SUBCLASSES } from "./model.js";
import { store, latestPositionsByAssetEntity } from "./store.js";
import { aportadoNetoPorActivo, valueOfPosition } from "./metrics.js";
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
      const valorActual = latest ? valueOfPosition(latest) : null;
      const aportado = aportadoNetoPorActivo(a.id);
      const plusvalia = valorActual != null ? valorActual - aportado : null;
      return { asset: a, valorActual, aportado, plusvalia };
    })
    .sort((a, b) => {
      const entityCmp = entityName(a.asset.entityId).localeCompare(entityName(b.asset.entityId), "es");
      if (entityCmp !== 0) return entityCmp;
      return a.asset.name.localeCompare(b.asset.name, "es");
    });

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
                    <td>${fmtEUR(valueOfPosition(p))}${p.valuations ? ` <span class="muted">(media ${p.valuations.length} fuentes)</span>` : ""}</td>
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
      const isRealEstate = (assetId) => {
        const a = assetById(assetId);
        return a && a.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(a.subclass);
      };
      const assetLabel = (a) => `${a.name} — ${entityName(a.entityId)}`;
      const firstAssetId = editing?.assetId || presetAssetId || data.assets[0].id;
      const initialValuations = editing?.valuations?.length ? editing.valuations : [{ source: "", value: "" }];

      body.innerHTML = `
        <form id="form-position" class="stacked-form">
          <label>Fecha <input name="date" type="date" value="${editing?.date || todayIso()}" required /></label>
          <label>Activo
            <select name="assetId" required>${data.assets
              .map((a) => `<option value="${a.id}" ${a.id === firstAssetId ? "selected" : ""}>${assetLabel(a)}</option>`)
              .join("")}</select>
          </label>
          <label id="units-field">Unidades / participaciones <input name="units" type="number" step="any" value="${editing?.units ?? ""}" placeholder="Opcional" /></label>
          <label id="nav-field" style="display:none">Valor liquidativo (€/participación)
            <input name="navValue" type="number" step="any" value="${editing?.navValue ?? ""}" placeholder="Se usa para calcular el valor total" />
          </label>
          <label id="value-field">Valor total (€) <input name="value" type="number" step="any" value="${editing?.value ?? ""}" /></label>
          <div id="valuations-field" style="display:none">
            <label>Fuentes de valoración (se promedian)</label>
            <div id="valuations-rows"></div>
            <button type="button" id="btn-add-valuation" class="link-btn">+ Añadir fuente</button>
            <p id="valuations-preview" class="muted"></p>
          </div>
          <div class="btn-row">
            <button type="submit">${editing ? "Guardar cambios" : "Guardar posición"}</button>
          </div>
        </form>
      `;

      const form = body.querySelector("#form-position");
      const assetSelect = form.querySelector('select[name="assetId"]');
      const unitsField = form.querySelector("#units-field");
      const unitsInput = form.querySelector('input[name="units"]');
      const navField = form.querySelector("#nav-field");
      const navInput = form.querySelector('input[name="navValue"]');
      const valueField = form.querySelector("#value-field");
      const valueInput = form.querySelector('input[name="value"]');
      const valuationsField = form.querySelector("#valuations-field");
      const valuationsRows = form.querySelector("#valuations-rows");
      const valuationsPreview = form.querySelector("#valuations-preview");

      function renderValuationRow(row) {
        const div = document.createElement("div");
        div.className = "btn-row valuation-row";
        div.innerHTML = `
          <input class="val-source" placeholder="Fuente (ej. Idealista)" value="${row.source || ""}" />
          <input class="val-value" type="number" step="any" placeholder="Valor (€)" value="${row.value ?? ""}" />
          <button type="button" class="link-btn danger btn-remove-valuation">quitar</button>
        `;
        div.querySelector(".val-source").addEventListener("input", refreshValuationsPreview);
        div.querySelector(".val-value").addEventListener("input", refreshValuationsPreview);
        div.querySelector(".btn-remove-valuation").addEventListener("click", () => {
          if (valuationsRows.children.length > 1) {
            div.remove();
            refreshValuationsPreview();
          }
        });
        valuationsRows.appendChild(div);
      }

      function currentValuations() {
        return [...valuationsRows.querySelectorAll(".valuation-row")]
          .map((row) => ({
            source: row.querySelector(".val-source").value.trim(),
            value: parseFloat(row.querySelector(".val-value").value),
          }))
          .filter((v) => !isNaN(v.value));
      }

      function refreshValuationsPreview() {
        const vals = currentValuations();
        if (!vals.length) {
          valuationsPreview.textContent = "";
          return;
        }
        const avg = vals.reduce((s, v) => s + v.value, 0) / vals.length;
        const safetyPct = Number(store.get().meta.realEstateSafetyPct) || 0;
        const final = avg * (1 - safetyPct / 100);
        valuationsPreview.textContent = `Media: ${avg.toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · Con coeficiente de seguridad (${safetyPct}%): ${final.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`;
      }

      initialValuations.forEach(renderValuationRow);
      refreshValuationsPreview();

      form.querySelector("#btn-add-valuation").addEventListener("click", () => {
        renderValuationRow({ source: "", value: "" });
        refreshValuationsPreview();
      });

      function refreshFieldVisibility() {
        const realEstate = isRealEstate(assetSelect.value);
        valuationsField.style.display = realEstate ? "" : "none";
        valueField.style.display = realEstate ? "none" : "";
        unitsField.style.display = realEstate ? "none" : "";
        navField.style.display = !realEstate && isUnitTraded(assetSelect.value) ? "" : "none";
        valueInput.required = !realEstate;
      }
      function recalcValue() {
        const units = parseFloat(unitsInput.value);
        const nav = parseFloat(navInput.value);
        if (!isNaN(units) && !isNaN(nav)) valueInput.value = (units * nav).toFixed(2);
      }
      assetSelect.addEventListener("change", refreshFieldVisibility);
      unitsInput.addEventListener("input", recalcValue);
      navInput.addEventListener("input", recalcValue);
      refreshFieldVisibility();

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const asset = assetById(fd.get("assetId"));
        const realEstate = isRealEstate(fd.get("assetId"));
        const payload = {
          date: fd.get("date"),
          entityId: asset?.entityId || null,
          assetId: fd.get("assetId"),
          units: !realEstate && fd.get("units") ? Number(fd.get("units")) : null,
          navValue: !realEstate && fd.get("navValue") ? Number(fd.get("navValue")) : null,
          value: realEstate ? null : Number(fd.get("value")),
          valuations: realEstate ? currentValuations() : null,
        };
        if (realEstate && !payload.valuations.length) {
          alert("Añade al menos una fuente de valoración con su importe.");
          return;
        }
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
