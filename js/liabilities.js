import { store, latestLiabilityPositions, liabilityById, entityById } from "./store.js";
import { totalCuotaMensual } from "./metrics.js";
import { openModal } from "./modal.js";

let editingLiabilityId = null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtEUR(n) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export function renderLiabilities(container) {
  const data = store.get();
  const entityName = (id) => (id ? entityById(id)?.name || "—" : "—");
  const editing = editingLiabilityId ? data.liabilities.find((l) => l.id === editingLiabilityId) : null;

  const latestByLiability = new Map(latestLiabilityPositions().map((p) => [p.liabilityId, p]));
  const sortedPositions = [...data.liabilityPositions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const resumenRows = [...data.liabilities].sort((a, b) => a.name.localeCompare(b.name, "es"));

  container.innerHTML = `
    <div class="section-head">
      <h3>Deudas</h3>
    </div>

    <section class="card">
      <h3>Pasivos (hipotecas, préstamos...)</h3>
      <form id="form-liability" class="stacked-form">
        <label>Nombre <input name="name" required placeholder="Ej. Hipoteca vivienda habitual" value="${editing?.name || ""}" /></label>
        <label>Entidad
          <select name="entityId"><option value="">(sin especificar)</option>${data.entities
            .map((e) => `<option value="${e.id}" ${e.id === editing?.entityId ? "selected" : ""}>${e.name}</option>`)
            .join("")}</select>
        </label>
        <label>Cuota mensual (€) <input name="monthlyPayment" type="number" step="any" value="${editing?.monthlyPayment ?? ""}" placeholder="Opcional" /></label>
        <label>Notas <input name="notes" placeholder="Opcional" value="${editing?.notes || ""}" /></label>
        <div class="btn-row">
          <button type="submit">${editing ? "Guardar cambios" : "Añadir pasivo"}</button>
          ${editing ? `<button type="button" id="cancel-edit-liability">Cancelar</button>` : ""}
        </div>
      </form>

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Nombre</th><th>Entidad</th><th>Cuota mensual</th><th>Saldo pendiente</th><th></th></tr></thead>
          <tbody>
            ${
              resumenRows
                .map((l) => {
                  const latest = latestByLiability.get(l.id);
                  return `<tr>
                    <td>${l.name}</td>
                    <td>${entityName(l.entityId)}</td>
                    <td>${fmtEUR(l.monthlyPayment)}</td>
                    <td>${latest ? fmtEUR(latest.balance) : `<button data-add-balance="${l.id}" class="link-btn danger">sin saldo, añadir</button>`}</td>
                    <td>
                      <button data-edit-liability="${l.id}" class="link-btn">editar</button>
                      <button data-remove-liability="${l.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`;
                })
                .join("") || '<tr><td colspan="5" class="muted">Sin pasivos todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
      <p class="muted">Cuota mensual total: ${fmtEUR(totalCuotaMensual())}</p>
    </section>

    <section class="card">
      <div class="section-head">
        <h3>Histórico de saldo pendiente</h3>
        ${data.liabilities.length ? `<button id="btn-new-balance">+ Nuevo saldo</button>` : ""}
      </div>
      <div class="table-wrap">
        <table class="table table-history">
          <thead><tr><th>Fecha</th><th>Pasivo</th><th>Saldo pendiente</th><th></th></tr></thead>
          <tbody>
            ${
              sortedPositions
                .map((p) => {
                  const l = liabilityById(p.liabilityId);
                  return `<tr>
                    <td>${p.date}</td>
                    <td>${l?.name || "—"}</td>
                    <td>${fmtEUR(p.balance)}</td>
                    <td>
                      <button data-edit-balance="${p.id}" class="link-btn">editar</button>
                      <button data-remove-balance="${p.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`;
                })
                .join("") || '<tr><td colspan="4" class="muted">Sin saldos registrados todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  function openBalanceForm(editingPos, presetLiabilityId) {
    openModal(editingPos ? "Editar saldo pendiente" : "Nuevo saldo pendiente", (body, closeModal) => {
      const firstLiabilityId = editingPos?.liabilityId || presetLiabilityId || data.liabilities[0].id;
      body.innerHTML = `
        <form id="form-balance" class="stacked-form">
          <label>Fecha <input name="date" type="date" value="${editingPos?.date || todayIso()}" required /></label>
          <label>Pasivo
            <select name="liabilityId" required>${data.liabilities
              .map((l) => `<option value="${l.id}" ${l.id === firstLiabilityId ? "selected" : ""}>${l.name}</option>`)
              .join("")}</select>
          </label>
          <label>Saldo pendiente (€) <input name="balance" type="number" step="any" value="${editingPos?.balance ?? ""}" required /></label>
          <div class="btn-row">
            <button type="submit">${editingPos ? "Guardar cambios" : "Guardar saldo"}</button>
          </div>
        </form>
      `;
      body.querySelector("#form-balance").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const payload = {
          date: fd.get("date"),
          liabilityId: fd.get("liabilityId"),
          balance: Number(fd.get("balance")),
        };
        if (editingPos) {
          store.updateLiabilityPosition(editingPos.id, payload);
        } else {
          store.addLiabilityPosition(payload);
        }
        closeModal();
        renderLiabilities(container);
      });
    });
  }

  container.querySelector("#form-liability").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const payload = {
      name: fd.get("name").trim(),
      entityId: fd.get("entityId") || null,
      monthlyPayment: fd.get("monthlyPayment") ? Number(fd.get("monthlyPayment")) : null,
      notes: fd.get("notes") || "",
    };
    if (editingLiabilityId) {
      store.updateLiability(editingLiabilityId, payload);
      editingLiabilityId = null;
    } else {
      store.addLiability(payload);
    }
    renderLiabilities(container);
  });

  container.querySelector("#cancel-edit-liability")?.addEventListener("click", () => {
    editingLiabilityId = null;
    renderLiabilities(container);
  });

  container.querySelectorAll("[data-edit-liability]").forEach((btn) =>
    btn.addEventListener("click", () => {
      editingLiabilityId = btn.dataset.editLiability;
      renderLiabilities(container);
    })
  );

  container.querySelectorAll("[data-remove-liability]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar este pasivo? El histórico de saldos asociado no se borrará automáticamente.")) {
        store.removeLiability(btn.dataset.removeLiability);
        if (editingLiabilityId === btn.dataset.removeLiability) editingLiabilityId = null;
        renderLiabilities(container);
      }
    })
  );

  container.querySelector("#btn-new-balance")?.addEventListener("click", () => openBalanceForm(null));

  container.querySelectorAll("[data-add-balance]").forEach((btn) =>
    btn.addEventListener("click", () => openBalanceForm(null, btn.dataset.addBalance))
  );

  container.querySelectorAll("[data-edit-balance]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const pos = data.liabilityPositions.find((p) => p.id === btn.dataset.editBalance);
      openBalanceForm(pos);
    })
  );

  container.querySelectorAll("[data-remove-balance]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar este saldo pendiente?")) {
        store.removeLiabilityPosition(btn.dataset.removeBalance);
        renderLiabilities(container);
      }
    })
  );
}
