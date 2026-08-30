import { DECISION_STATUSES } from "./model.js";
import { store } from "./store.js";
import { openModal } from "./modal.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function renderDecisions(container) {
  const data = store.get();
  const entityName = (id) => data.entities.find((e) => e.id === id)?.name || "—";

  const sorted = [...data.decisions].sort((a, b) => (a.date < b.date ? 1 : -1));

  container.innerHTML = `
    <div class="section-head">
      <h3>Decisiones</h3>
      <button id="btn-new-decision">+ Nueva decisión</button>
    </div>

    <section class="card">
      <p class="muted">Registro de propuestas recibidas del asesor (o de la entidad) y la decisión familiar tomada sobre cada una — para tener trazabilidad de por qué se aceptó, rechazó o modificó algo con el tiempo.</p>
      <div class="table-wrap">
        <table class="table table-history">
          <thead><tr><th>Fecha</th><th>Entidad</th><th>Asesor</th><th>Propuesta</th><th>Decisión</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            ${
              sorted
                .map(
                  (d) => `<tr>
                    <td>${d.date}</td>
                    <td>${d.entityId ? entityName(d.entityId) : "—"}</td>
                    <td>${d.asesor || "—"}</td>
                    <td>${d.propuesta}</td>
                    <td>${DECISION_STATUSES[d.decision] || d.decision}</td>
                    <td>${d.notas || "—"}</td>
                    <td>
                      <button data-edit="${d.id}" class="link-btn">editar</button>
                      <button data-remove="${d.id}" class="link-btn danger">eliminar</button>
                    </td>
                  </tr>`
                )
                .join("") || '<tr><td colspan="7" class="muted">Sin decisiones registradas todavía</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  function openDecisionForm(editing) {
    openModal(editing ? "Editar decisión" : "Nueva decisión", (body, closeModal) => {
      body.innerHTML = `
        <form id="form-decision" class="stacked-form">
          <label>Fecha <input name="date" type="date" value="${editing?.date || todayIso()}" required /></label>
          <label>Entidad
            <select name="entityId"><option value="">(sin entidad)</option>${data.entities
              .map((e) => `<option value="${e.id}" ${e.id === editing?.entityId ? "selected" : ""}>${e.name}</option>`)
              .join("")}</select>
          </label>
          <label>Asesor <input name="asesor" placeholder="Opcional" value="${editing?.asesor || ""}" /></label>
          <label>Propuesta recibida <textarea name="propuesta" rows="3" required>${editing?.propuesta || ""}</textarea></label>
          <label>Decisión tomada
            <select name="decision" required>${Object.entries(DECISION_STATUSES)
              .map(([k, v]) => `<option value="${k}" ${k === editing?.decision ? "selected" : ""}>${v}</option>`)
              .join("")}</select>
          </label>
          <label>Notas <textarea name="notas" rows="2" placeholder="Opcional">${editing?.notas || ""}</textarea></label>
          <button type="submit">${editing ? "Guardar cambios" : "Guardar decisión"}</button>
        </form>
      `;

      const form = body.querySelector("#form-decision");
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const payload = {
          date: fd.get("date"),
          entityId: fd.get("entityId") || null,
          asesor: fd.get("asesor").trim(),
          propuesta: fd.get("propuesta").trim(),
          decision: fd.get("decision"),
          notas: fd.get("notas").trim(),
        };
        if (editing) {
          store.updateDecision(editing.id, payload);
        } else {
          store.addDecision(payload);
        }
        closeModal();
        renderDecisions(container);
      });
    });
  }

  container.querySelector("#btn-new-decision").addEventListener("click", () => openDecisionForm(null));

  container.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const decision = data.decisions.find((d) => d.id === btn.dataset.edit);
      openDecisionForm(decision);
    })
  );

  container.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar esta decisión?")) {
        store.removeDecision(btn.dataset.remove);
        renderDecisions(container);
      }
    })
  );
}
