(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const names = {
      new: "New",
      contacted: "Contacted",
      quote_sent: "Quote sent",
      follow_up: "Follow-up",
      won: "Won",
      lost: "Lost",
    },
    sources = {
      website_shipping: "Shipping",
      website_service: "Services",
      website_callback: "Email help",
      external_freight: "Freight import",
      staff_email: "Staff email",
    };
  let state = { leads: [], staff: [], locations: [], offset: 0, total: 0 },
    view = "inbox",
    selected = null,
    importRows = [],
    sendId = crypto.randomUUID(),
    generation = 0;
  const date = (v) =>
    v
      ? new Date(v).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "No follow-up set";
  const loc = (id) =>
    state.locations.find((x) => x.id === id)?.name || id || "Needs a location";
  const staff = (id) =>
    state.staff.find((x) => x.id === id)?.name || "Unassigned";
  function notice(message, error = false) {
    $("notice").hidden = !message;
    $("notice").textContent = message;
    $("notice").className = error ? "error" : "";
  }
  async function api(action, body, method = "POST", params = "") {
    const r = await fetch("/api/crm?action=" + action + params, {
      method: body ? method : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (r.status === 401) {
      $("login").hidden = false;
      $("app").hidden = true;
      throw new Error("Sign in to view customer information.");
    }
    if (!r.ok || !d.ok) throw new Error(d.error || "Request failed.");
    return d;
  }
  function options(values, current) {
    return values
      .map(
        (x) =>
          '<option value="' +
          esc(x.id) +
          '"' +
          (x.id === current ? " selected" : "") +
          ">" +
          esc(x.name) +
          "</option>",
      )
      .join("");
  }
  function renderRows() {
    let leads = state.leads;
    if (view === "contacts") {
      const seen = new Set();
      leads = leads.filter(
        (l) => !seen.has(l.contact_id) && seen.add(l.contact_id),
      );
    }
    $("rows").innerHTML = leads
      .map((l) => {
        const overdue =
          l.due_at &&
          Date.parse(l.due_at) < Date.now() &&
          !["won", "lost"].includes(l.stage);
        const failed =
          Object.values(l.notifications || {}).some((x) => x === "failed") ||
          (l.emails || []).some(
            (x) =>
              x.kind === "email" &&
              ["failed", "pending"].includes(x.metadata.status),
          );
        return (
          "<tr><td><strong>" +
          esc(l.contact?.name || l.contact?.email) +
          "</strong><small>" +
          esc(l.contact?.email) +
          "</small><small>" +
          esc(l.title) +
          "</small>" +
          (failed
            ? '<small class="overdue">Email needs attention</small>'
            : "") +
          "</td><td>" +
          esc(loc(l.branch_id)) +
          "<small>" +
          esc(sources[l.source] || l.source) +
          " · " +
          esc(l.language) +
          '</small></td><td><span class="badge ' +
          esc(l.stage) +
          '">' +
          esc(names[l.stage]) +
          "</span></td><td>" +
          esc(staff(l.assigned_to)) +
          '<small class="' +
          (overdue ? "overdue" : "") +
          '">' +
          (overdue ? "Overdue · " : "") +
          esc(date(l.due_at)) +
          "</small></td><td>" +
          esc(date(l.created_at)) +
          '</td><td><button data-open="' +
          esc(l.id) +
          '">Open <span class="sr-only">' +
          esc(l.contact?.name || l.title) +
          "</span></button></td></tr>"
        );
      })
      .join("");
    $("empty").hidden = !!leads.length;
    $("listTitle").textContent =
      view === "today"
        ? "Follow-ups due within 24 hours"
        : view === "contacts"
          ? "Customers"
          : "Inquiry inbox";
    $("count").textContent =
      state.total +
      " matching inquiries" +
      (view === "contacts" ? " · customers grouped on this page" : "");
    $("pageLabel").textContent = state.total
      ? state.offset +
        1 +
        "–" +
        Math.min(state.offset + 100, state.total) +
        " of " +
        state.total
      : "0 results";
    $("previous").disabled = state.offset === 0;
    $("next").disabled = state.offset + 100 >= state.total;
  }
  async function load() {
    const run = ++generation;
    notice("Loading inquiries…");
    try {
      const params = new URLSearchParams({ offset: String(state.offset) });
      for (const k of ["stage", "branch", "source", "language", "search"])
        if ($(k).value) params.set(k, $(k).value);
      if (view === "today") params.set("due", "1");
      const d = await api("list", null, "GET", "&" + params);
      if (run !== generation) return;
      state = { ...state, ...d };
      $("login").hidden = true;
      $("app").hidden = false;
      if (!$("branch").dataset.ready) {
        $("branch").insertAdjacentHTML(
          "beforeend",
          options(state.locations, ""),
        );
        $("branch").dataset.ready = "1";
        $("branchCodes").textContent =
          "Branch IDs: " +
          state.locations.map((l) => l.name + " = " + l.id).join(" · ");
      }
      document.querySelector('[data-view="import"]').hidden = ![
        "owner",
        "manager",
      ].includes(state.user.role);
      renderRows();
      notice("");
    } catch (e) {
      if (run === generation) notice(e.message, true);
    }
  }
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      const r = await fetch("/api/auth-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Sign-in failed.");
      e.target.reset();
      await load();
    } catch (e) {
      notice(e.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  for (const key of ["stage", "branch", "source", "language"])
    $(key).addEventListener("change", () => {
      state.offset = 0;
      load();
    });
  let timer;
  $("search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.offset = 0;
      load();
    }, 350);
  });
  $("previous").onclick = () => {
    state.offset = Math.max(0, state.offset - 100);
    load();
  };
  $("next").onclick = () => {
    state.offset += 100;
    load();
  };
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      document.querySelectorAll("[data-view]").forEach((x) => {
        x.removeAttribute("aria-current");
        if (x === b) x.setAttribute("aria-current", "page");
      });
      for (const id of ["inbox", "reports", "import"])
        $(id).hidden =
          id !== (view === "reports" || view === "import" ? view : "inbox");
      state.offset = 0;
      if (view === "reports") reports();
      else if (view !== "import") load();
    }),
  );
  $("sync").onclick = async () => {
    const b = $("sync");
    b.disabled = true;
    let offset = 0,
      saved = 0;
    try {
      do {
        notice("Syncing saved inquiries… " + saved + " checked");
        const d = await api("sync", { offset });
        saved += d.saved;
        offset = d.next;
      } while (offset !== null);
      await load();
      notice(
        "Sync complete. " +
          saved +
          " inquiries checked; existing CRM stages and assignments kept.",
      );
    } catch (e) {
      notice(
        "Sync paused: " + e.message + " You can safely run it again.",
        true,
      );
    } finally {
      b.disabled = false;
    }
  };
  $("rows").onclick = (e) => {
    const b = e.target.closest("[data-open]");
    if (b) openDetail(b.dataset.open);
  };
  $("closeDetail").onclick = () => $("detail").close();
  async function openDetail(id, keepSend = false) {
    const d = $("detail");
    if (!d.open) d.showModal();
    $("detailTitle").textContent = "Loading…";
    $("detailBody").replaceChildren();
    $("detailStatus").textContent = "";
    try {
      const r = await api(
        "detail",
        null,
        "GET",
        "&id=" + encodeURIComponent(id),
      );
      selected = r.lead;
      const l = selected,
        c = l.contact;
      if (!keepSend) sendId = crypto.randomUUID();
      $("detailTitle").textContent = l.title;
      const stageOptions = Object.entries(names).map(([id, name]) => ({
        id,
        name,
      }));
      const dt = l.due_at
        ? new Date(
            Date.parse(l.due_at) -
              new Date(l.due_at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "";
      $("detailBody").innerHTML =
        '<div class="customer-card"><strong>' +
        esc(c.name || c.email) +
        "</strong><p>" +
        esc(c.email) +
        (c.phone ? " · " + esc(c.phone) : "") +
        "</p><p>" +
        esc(loc(l.branch_id)) +
        " · " +
        esc(l.language) +
        " · " +
        esc(sources[l.source]) +
        "</p><p>Marketing: " +
        (c.marketing_consent
          ? "Opted in · " + esc(date(c.consent_at))
          : "No active consent") +
        "</p>" +
        (c.marketing_consent
          ? '<button id="optoutCustomer">Record customer’s marketing opt-out</button>'
          : "") +
        "</div><pre>" +
        esc(l.details || "No additional details provided.") +
        '</pre><p class="muted">Campaign: ' +
        esc(Object.values(l.attribution || {}).join(" / ") || "Not recorded") +
        '</p><p class="muted">Original request status: ' +
        esc(l.source_status || "Email help / imported inquiry") +
        '</p><form id="workflow"><div class="detail-grid"><label>Stage<select name="stage">' +
        options(stageOptions, l.stage) +
        '</select></label><label>Assigned to<select name="assigned_to"><option value="">Unassigned</option>' +
        options(
          state.staff.filter(
            (s) => s.role === "owner" || s.locationId === l.branch_id,
          ),
          l.assigned_to,
        ) +
        '</select></label><label>Follow-up due (your local time)<input name="due_at" type="datetime-local" value="' +
        esc(dt) +
        '"></label><label>Quote value (USD)<input name="value" type="number" min="0" max="9999999999" step="0.01" value="' +
        esc(l.value ?? "") +
        '"></label>' +
        (state.user.role === "owner"
          ? '<label>Location<select name="branch_id"><option value="">Needs a location</option>' +
            options(state.locations, l.branch_id) +
            "</select></label>"
          : "") +
        '</div><label>Internal note<textarea name="note" rows="3" maxlength="4000" placeholder="What happened, and what should happen next?"></textarea></label><button class="primary">Save follow-up</button></form><details><summary>Write a service reply</summary><p class="muted">Sends to ' +
        esc(c.email) +
        '. Incoming replies go to the configured business inbox. This is for the customer’s request, not marketing.</p><form id="emailForm"><label>Subject<input name="subject" required maxlength="160" value="' +
        esc("CubicShip: " + l.title) +
        '"></label><label>Message<textarea name="message" rows="6" required maxlength="6000"></textarea></label><button class="primary">Send service email</button></form></details><h3>Customer’s requests at accessible locations</h3><div class="inline-actions">' +
        r.history
          .map(
            (h) =>
              '<button data-history="' +
              esc(h.id) +
              '">' +
              esc(h.title) +
              " · " +
              esc(names[h.stage]) +
              "</button>",
          )
          .join("") +
        '</div><h3>Recent history (latest 100)</h3><ul class="timeline">' +
        r.activities
          .map(
            (a) =>
              "<li><strong>" +
              esc(
                a.kind === "email"
                  ? "Email · " + (a.metadata.status || "unknown")
                  : a.kind,
              ) +
              "</strong> <small>" +
              esc(a.actor) +
              " · " +
              esc(date(a.created_at)) +
              "</small><p>" +
              esc(a.body) +
              "</p>" +
              (a.kind === "workflow"
                ? "<small>" +
                  esc(
                    Object.entries(a.metadata.after || {})
                      .map(
                        ([k, v]) =>
                          k.replaceAll("_", " ") +
                          ": " +
                          (k === "assigned_to" ? staff(v) : (v ?? "cleared")),
                      )
                      .join(" · "),
                  ) +
                  "</small>"
                : "") +
              (a.kind === "email" && a.metadata.status === "accepted"
                ? "<small>Accepted by email provider. Delivery and incoming replies are checked in the email inbox.</small>"
                : "") +
              "</li>",
          )
          .join("") +
        "</ul>";
      $("workflow").onsubmit = async (e) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.target)),
          note = values.note;
        delete values.note;
        values.due_at = values.due_at
          ? new Date(values.due_at).toISOString()
          : null;
        values.value = values.value === "" ? null : Number(values.value);
        await detailAction(e.target, () =>
          api("update", { id: l.id, version: l.version, patch: values, note }),
        );
      };
      const select = $("workflow").elements.branch_id;
      if (select)
        select.onchange = () => {
          $("workflow").elements.assigned_to.innerHTML =
            '<option value="">Unassigned</option>' +
            options(
              state.staff.filter(
                (s) => s.role === "owner" || s.locationId === select.value,
              ),
              "",
            );
        };
      $("emailForm").onsubmit = async (e) => {
        e.preventDefault();
        await detailAction(
          e.target,
          () =>
            api("email", {
              id: l.id,
              requestId: sendId,
              ...Object.fromEntries(new FormData(e.target)),
            }),
          true,
        );
      };
      if ($("optoutCustomer"))
        $("optoutCustomer").onclick = () =>
          detailAction(null, () => api("optout", { id: l.id }));
      $("detailBody")
        .querySelectorAll("[data-history]")
        .forEach((b) => (b.onclick = () => openDetail(b.dataset.history)));
    } catch (e) {
      $("detailTitle").textContent = "Request unavailable";
      $("detailStatus").textContent = e.message;
    }
  }
  async function detailAction(form, fn, email = false) {
    const b = form?.querySelector("button");
    if (b) b.disabled = true;
    $("detailStatus").className = "";
    $("detailStatus").textContent = email ? "Sending…" : "Saving…";
    try {
      await fn();
      await openDetail(selected.id);
      $("detailStatus").textContent = email
        ? "Email accepted by the provider. Check the inbox for replies."
        : "Saved.";
      await load();
    } catch (e) {
      $("detailStatus").className = "error";
      $("detailStatus").textContent = e.message;
    } finally {
      if (b) b.disabled = false;
    }
  }
  async function reports() {
    try {
      const d = await api("metrics");
      const totals = {},
        groups = {};
      for (const r of d.metrics) {
        totals[r.event] = (totals[r.event] || 0) + Number(r.count);
        const key = [r.language, r.branch_id, r.event].join("|");
        groups[key] = (groups[key] || 0) + Number(r.count);
      }
      const cards = [
        ["Page views", totals.page_view || 0],
        ["Saved inquiries", totals.inquiry_saved || 0],
        ["Email-help leads", totals.callback_saved || 0],
        ["Call button clicks", totals.call_click || 0],
      ];
      const stages = {},
        lanes = {};
      for (const l of d.pipeline) {
        stages[l.stage] = (stages[l.stage] || 0) + 1;
        const key = [
          l.source,
          l.language,
          loc(l.branch_id),
          l.attribution?.source || "Not recorded",
        ].join(" · ");
        const row =
          lanes[key] || (lanes[key] = { leads: 0, won: 0, lost: 0, value: 0 });
        row.leads++;
        if (l.stage === "won") {
          row.won++;
          row.value += Number(l.value) || 0;
        }
        if (l.stage === "lost") row.lost++;
      }
      cards.push(
        ["Won inquiries", stages.won || 0],
        ["Lost inquiries", stages.lost || 0],
        [
          "Open inquiries",
          d.pipeline.length - (stages.won || 0) - (stages.lost || 0),
        ],
        [
          "Win rate (closed)",
          (stages.won || 0) + (stages.lost || 0)
            ? Math.round(
                (100 * (stages.won || 0)) /
                  ((stages.won || 0) + (stages.lost || 0)),
              ) + "%"
            : "—",
        ],
      );
      $("pipelineRows").innerHTML = Object.entries(lanes)
        .map(
          ([key, n]) =>
            "<tr><td>" +
            esc(key) +
            "</td><td>" +
            n.leads +
            "</td><td>" +
            n.won +
            "</td><td>" +
            n.lost +
            "</td><td>" +
            n.value.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
            }) +
            "</td></tr>",
        )
        .join("");
      $("metricCards").innerHTML = cards
        .map(
          ([k, v]) =>
            '<div class="panel"><strong>' +
            v +
            "</strong><span>" +
            k +
            "</span></div>",
        )
        .join("");
      $("metricRows").innerHTML = Object.entries(groups)
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => {
          const [l, b, e] = key.split("|");
          return (
            "<tr><td>" +
            esc(l) +
            "</td><td>" +
            esc(b ? loc(b) : "Site-wide / no location") +
            "</td><td>" +
            esc(e.replaceAll("_", " ")) +
            "</td><td>" +
            n +
            "</td></tr>"
          );
        })
        .join("");
      $("metricNote").textContent =
        "Pipeline and outcomes cover inquiries created in the last 30 days. Won value is the staff-entered quote value, not payment revenue. Saved inquiry totals include synced historical inquiries on their original dates. Browser counts start with this release. External freight conversions appear after import. " +
        (d.metrics.length === d.limit || d.pipeline.length === d.limit
          ? "Showing the newest " +
            d.limit +
            " records per report; totals may be incomplete at this limit."
          : "") +
        (state.user.role === "owner"
          ? ""
          : " Site-wide browser metrics are visible to the owner only.");
      notice("");
    } catch (e) {
      notice(e.message, true);
    }
  }
  $("refreshReports").onclick = reports;
  function parseCSV(text) {
    const rows = [];
    let row = [],
      cell = "",
      quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quote && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quote = !quote;
      } else if (c === "," && !quote) {
        row.push(cell);
        cell = "";
      } else if ((c === "\n" || c === "\r") && !quote) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (quote) throw new Error("A quoted CSV cell was not closed.");
    row.push(cell);
    if (row.some((v) => v.trim())) rows.push(row);
    const headers = (rows.shift() || []).map((x) =>
      x
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
    );
    if (
      !["external_id", "email", "branch_id"].every((k) => headers.includes(k))
    )
      throw new Error(
        "CSV must include external_id, email and branch_id columns.",
      );
    if (new Set(headers).size !== headers.length)
      throw new Error("Duplicate column names.");
    return rows.map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
    );
  }
  $("importFile").onchange = async (e) => {
    importRows = [];
    $("importConfirm").disabled = true;
    $("importStatus").textContent = "";
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 140000) throw new Error("Use a CSV smaller than 140 KB.");
      const rows = parseCSV(await file.text());
      if (!rows.length || rows.length > 100)
        throw new Error("Choose 1–100 rows.");
      rows.forEach((r, i) => {
        if (
          !r.external_id ||
          !/^\S+@\S+\.\S+$/.test(r.email) ||
          !state.locations.some((l) => l.id === r.branch_id)
        )
          throw new Error("Check ID, email and branch on row " + (i + 1) + ".");
      });
      importRows = rows;
      $("importPreview").innerHTML =
        "<table><thead><tr><th>Entry ID</th><th>Customer</th><th>Location</th></tr></thead><tbody>" +
        rows
          .map(
            (r) =>
              "<tr><td>" +
              esc(r.external_id) +
              "</td><td>" +
              esc(r.name || r.email) +
              "</td><td>" +
              esc(loc(r.branch_id)) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table>";
      $("importConfirm").disabled = false;
    } catch (e) {
      $("importStatus").textContent = e.message;
      $("importPreview").replaceChildren();
    }
  };
  $("importConfirm").onclick = async () => {
    const b = $("importConfirm");
    b.disabled = true;
    try {
      const d = await api("import", { rows: importRows });
      $("importStatus").textContent =
        d.created +
        " new inquiries imported; " +
        d.existing +
        " already existed. No emails sent.";
      importRows = [];
    } catch (e) {
      $("importStatus").textContent =
        e.message + " Re-importing the same IDs is safe.";
      b.disabled = false;
    }
  };
  fetch("/assets/crm-languages.json")
    .then((r) => r.json())
    .then((list) =>
      $("language").insertAdjacentHTML(
        "beforeend",
        options(
          list.map((l) => ({ id: l.code, name: l.name })),
          "",
        ),
      ),
    )
    .catch(() => {});
  load();
})();
