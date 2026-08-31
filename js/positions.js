import { UNIT_TRADED_SUBCLASSES, REAL_ESTATE_SUBCLASSES } from "./model.js";
import { store, latestPositionsByAssetEntity, latestLiabilityPositions } from "./store.js";
import { aportadoNetoPorActivo, valueOfPosition } from "./metrics.js";
import { openModal } from "./modal.js";

let bulkMode = false;
let showZeroPositions = false;
let historyYearFilter = "todos";

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

  if (bulkMode) {
    renderBulkUpdate(container, data);
    return;
  }

  const assetById = (id) => data.assets.find((a) => a.id === id);
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";

  const sorted = [...data.positions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const resumenRowsAll = data.assets
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

  // Un activo con valor actual a 0€ significa que se traspasó/vendió del
  // todo (ver invariante Posiciones vs. Movimientos): se sigue conservando
  // el dato, pero por defecto se oculta de "lo que tengo en cartera" para
  // no distorsionar la vista — un enlace lo despliega ocasionalmente.
  const resumenRowsZero = resumenRowsAll.filter((r) => r.valorActual != null && r.valorActual <= 0);
  const resumenRows = showZeroPositions ? resumenRowsAll : resumenRowsAll.filter((r) => r.valorActual == null || r.valorActual > 0);

  const historyYears = [...new Set(data.positions.map((p) => p.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const filteredSorted = historyYearFilter === "todos" ? sorted : sorted.filter((p) => p.date.slice(0, 4) === historyYearFilter);
  const { altas, bajas } = historyYearFilter === "todos" ? { altas: [], bajas: [] } : altasBajasEnAnio(data, historyYearFilter);

  container.innerHTML = `
    <div class="section-head">
      <h3>Posiciones</h3>
      <div class="btn-row">
        <button id="btn-bulk-update">📅 Actualización mensual</button>
        <button id="btn-new-position">+ Nueva posición</button>
      </div>
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
                  (r) => `<tr${r.valorActual != null && r.valorActual <= 0 ? ' class="row-zero"' : ""}>
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
      ${
        resumenRowsZero.length
          ? `<button type="button" id="btn-toggle-zero" class="link-btn">${showZeroPositions ? "Ocultar posiciones a cero" : `Ver también posiciones a cero (${resumenRowsZero.length})`}</button>`
          : ""
      }
    </section>

    <section class="card">
      <div class="section-head">
        <h3>Histórico de posiciones</h3>
        <select id="history-year-filter">
          <option value="todos" ${historyYearFilter === "todos" ? "selected" : ""}>Todos los años</option>
          ${historyYears.map((y) => `<option value="${y}" ${y === historyYearFilter ? "selected" : ""}>${y}</option>`).join("")}
        </select>
      </div>
      ${
        historyYearFilter !== "todos"
          ? `<p class="muted">En ${historyYearFilter}: ${altas.length} activo${altas.length === 1 ? "" : "s"} nuevo${altas.length === 1 ? "" : "s"}${
              altas.length ? ` (${altas.map((a) => a.name).join(", ")})` : ""
            } · ${bajas.length} dado${bajas.length === 1 ? "" : "s"} de baja${bajas.length ? ` (${bajas.map((a) => a.name).join(", ")})` : ""}</p>`
          : ""
      }
      <div class="table-wrap">
        <table class="table table-history">
          <thead><tr><th>Fecha</th><th>Entidad</th><th>Activo</th><th>Unidades</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            ${
              filteredSorted
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
                .join("") ||
              `<tr><td colspan="6" class="muted">${historyYearFilter === "todos" ? "Sin posiciones todavía" : `Sin posiciones en ${historyYearFilter}`}</td></tr>`
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
      const assetLabel = (a) => (a.entityId ? `${a.name} — ${entityName(a.entityId)}` : a.name);
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

  container.querySelector("#btn-toggle-zero")?.addEventListener("click", () => {
    showZeroPositions = !showZeroPositions;
    renderPositions(container);
  });

  container.querySelector("#history-year-filter").addEventListener("change", (ev) => {
    historyYearFilter = ev.target.value;
    renderPositions(container);
  });

  container.querySelector("#btn-bulk-update").addEventListener("click", () => {
    bulkMode = true;
    renderPositions(container);
  });

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

function isRealEstateAsset(a) {
  return a.class === "inmobiliario" && REAL_ESTATE_SUBCLASSES.includes(a.subclass);
}

// Altas (primera posición registrada ese año) y bajas (última posición
// registrada ese año, y es una posición a 0€ — el criterio ya establecido
// para "traspasado/vendido del todo") de un año concreto.
function altasBajasEnAnio(data, year) {
  const altas = [];
  const bajas = [];
  for (const asset of data.assets) {
    const posiciones = data.positions.filter((p) => p.assetId === asset.id);
    if (!posiciones.length) continue;
    const fechas = [...posiciones.map((p) => p.date)].sort();
    const primera = fechas[0];
    const ultima = fechas[fechas.length - 1];
    if (primera.slice(0, 4) === year) altas.push(asset);
    if (ultima.slice(0, 4) === year) {
      const ultimaPos = posiciones.find((p) => p.date === ultima);
      if (valueOfPosition(ultimaPos) <= 0) bajas.push(asset);
    }
  }
  return { altas, bajas };
}

function renderBulkUpdate(container, data) {
  const assetById = (id) => data.assets.find((a) => a.id === id);
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";

  const latestPosByAsset = new Map();
  for (const p of [...data.positions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    latestPosByAsset.set(p.assetId, p);
  }
  const latestLiabPos = new Map(latestLiabilityPositions().map((p) => [p.liabilityId, p]));

  // Un activo con última posición a 0€ ya se traspasó/vendió del todo: no
  // tiene sentido ofrecerlo en la actualización mensual (nada que
  // actualizar). Si algún día hiciera falta reactivarlo, se usa el "+ Nueva
  // posición" individual, que sí lista todos los activos sin filtrar.
  const estaZeroed = (a) => {
    const latest = latestPosByAsset.get(a.id);
    return latest && valueOfPosition(latest) <= 0;
  };
  const simpleAssets = data.assets.filter((a) => !isRealEstateAsset(a) && !estaZeroed(a));
  const realEstateAssets = data.assets.filter((a) => isRealEstateAsset(a) && !estaZeroed(a));

  function valuationRowHtml(v) {
    return `<div class="btn-row bulk-re-source-row">
      <input class="bulk-re-source-name" value="${v.source || ""}" placeholder="Fuente" />
      <input class="bulk-re-source-value" type="number" step="any" value="${v.value ?? ""}" placeholder="Valor (€)" />
      <button type="button" class="link-btn danger bulk-re-remove">quitar</button>
    </div>`;
  }

  container.innerHTML = `
    <div class="section-head">
      <h3>Actualización mensual</h3>
      <button id="btn-bulk-cancel" class="link-btn">← Volver</button>
    </div>

    <section class="card">
      <label>Fecha de esta actualización <input type="date" id="bulk-date" value="${todayIso()}" required /></label>
      <p class="muted">Deja un campo en blanco para no registrar ninguna posición nueva en ese activo o deuda.</p>
    </section>

    <section class="card">
      <h3>Activos</h3>
      <div class="bulk-rows">
        ${
          simpleAssets
            .map((a) => {
              const latest = latestPosByAsset.get(a.id);
              return `<div class="bulk-row">
                <span class="bulk-row-label">${a.name} <span class="muted">— ${entityName(a.entityId)}</span></span>
                <input type="number" step="any" class="bulk-value" data-asset-id="${a.id}" value="${latest && latest.value != null ? latest.value : ""}" placeholder="Valor (€)" />
              </div>`;
            })
            .join("") || '<p class="muted">Sin activos.</p>'
        }
      </div>
    </section>

    ${
      realEstateAssets.length
        ? `<section class="card">
      <h3>Inmuebles</h3>
      ${realEstateAssets
        .map((a) => {
          const latest = latestPosByAsset.get(a.id);
          const valuations = latest?.valuations?.length ? latest.valuations : [{ source: "", value: "" }];
          return `<div class="bulk-realestate" data-asset-id="${a.id}" style="margin-bottom:16px">
            <div class="bulk-row-label">${a.name} <span class="muted">— ${entityName(a.entityId)}</span></div>
            <div class="bulk-re-sources">${valuations.map(valuationRowHtml).join("")}</div>
            <button type="button" class="link-btn bulk-re-add">+ Añadir fuente</button>
          </div>`;
        })
        .join("")}
    </section>`
        : ""
    }

    ${
      data.liabilities.length
        ? `<section class="card">
      <h3>Deudas</h3>
      <div class="bulk-rows">
        ${data.liabilities
          .map((l) => {
            const latest = latestLiabPos.get(l.id);
            return `<div class="bulk-row">
              <span class="bulk-row-label">${l.name}</span>
              <input type="number" step="any" class="bulk-liability-value" data-liability-id="${l.id}" value="${latest && latest.balance != null ? latest.balance : ""}" placeholder="Saldo pendiente (€)" />
            </div>`;
          })
          .join("")}
      </div>
    </section>`
        : ""
    }

    <div class="btn-row">
      <button id="btn-bulk-save">Guardar todo</button>
    </div>
  `;

  function wireValuationRow(row) {
    row.querySelector(".bulk-re-remove").addEventListener("click", () => row.remove());
  }
  container.querySelectorAll(".bulk-re-source-row").forEach(wireValuationRow);

  container.querySelectorAll(".bulk-re-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.previousElementSibling;
      const div = document.createElement("div");
      div.innerHTML = valuationRowHtml({ source: "", value: "" });
      const row = div.firstElementChild;
      wrap.appendChild(row);
      wireValuationRow(row);
    });
  });

  container.querySelector("#btn-bulk-cancel").addEventListener("click", () => {
    bulkMode = false;
    renderPositions(container);
  });

  container.querySelector("#btn-bulk-save").addEventListener("click", () => {
    const date = container.querySelector("#bulk-date").value;
    if (!date) {
      alert("Elige una fecha.");
      return;
    }

    let count = 0;

    container.querySelectorAll(".bulk-value").forEach((input) => {
      const val = input.value.trim();
      if (val === "") return;
      const assetId = input.dataset.assetId;
      const asset = assetById(assetId);
      store.addPosition({
        date,
        entityId: asset?.entityId || null,
        assetId,
        units: null,
        navValue: null,
        value: Number(val),
      });
      count++;
    });

    container.querySelectorAll(".bulk-realestate").forEach((block) => {
      const assetId = block.dataset.assetId;
      const asset = assetById(assetId);
      const valuations = [...block.querySelectorAll(".bulk-re-source-row")]
        .map((row) => ({
          source: row.querySelector(".bulk-re-source-name").value.trim(),
          value: parseFloat(row.querySelector(".bulk-re-source-value").value),
        }))
        .filter((v) => !isNaN(v.value));
      if (!valuations.length) return;
      store.addPosition({
        date,
        entityId: asset?.entityId || null,
        assetId,
        units: null,
        navValue: null,
        value: null,
        valuations,
      });
      count++;
    });

    container.querySelectorAll(".bulk-liability-value").forEach((input) => {
      const val = input.value.trim();
      if (val === "") return;
      const liabilityId = input.dataset.liabilityId;
      store.addLiabilityPosition({ date, liabilityId, balance: Number(val) });
      count++;
    });

    bulkMode = false;
    alert(`Guardadas ${count} posiciones con fecha ${date}.`);
    renderPositions(container);
  });
}
