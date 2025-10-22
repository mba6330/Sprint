```javascript
/* app.js
 *
 * RIT Enrollment + Class Calendar (vanilla JS)
 * ------------------------------------------------------
 * EXPECTED HTML ELEMENT IDS:
 * - enrollForm            <form> with inputs named:
 *     name, email, major, year, notes,
 *     courseCode, courseName, day, start, end, location
 *   (day: Mon/Tue/Wed/Thu/Fri/Sat/Sun; start/end in "HH:MM")
 * - tbody                 <tbody> for the enrollments table
 * - table                 <table> wrapper (for width)
 * - search                <input type="search">
 * - exportCsv             <button>
 * - rowCount              <span> to show count
 * - toast                 <div> for small status messages
 * - year                  <span> in footer for current year
 * - calendarGrid          <div> where the weekly grid is rendered
 *
 * COLORS (use in CSS): #F76902 (orange), #FFFFFF, #000000, #D0D3D4
 */

(() => {
  const LS_KEY = "rit_enrollments_v2";

  // Cache DOM
  const form = document.getElementById("enrollForm");
  const tbody = document.getElementById("tbody");
  const searchInput = document.getElementById("search");
  const exportBtn = document.getElementById("exportCsv");
  const rowCountEl = document.getElementById("rowCount");
  const toast = document.getElementById("toast");
  const yearEl = document.getElementById("year");
  const calendarGrid = document.getElementById("calendarGrid");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --------- Data layer ---------
  const load = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const save = (rows) => localStorage.setItem(LS_KEY, JSON.stringify(rows));

  let rows = load();

  // --------- Helpers ---------
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const trim = (s) => (s || "").toString().trim();

  const isRitEmail = (email) => /@rit\.edu$/i.test(trim(email));

  // Time helpers
  const parseHHMM = (t) => {
    // returns minutes since 00:00, or null
    if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
    const [h, m] = t.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const DAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const DAY_ORDER = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // Conflict detection: same day and time overlap
  const hasConflict = (candidate, allRows, ignoreId = null) => {
    const d = candidate.day;
    const s = parseHHMM(candidate.start);
    const e = parseHHMM(candidate.end);
    if (!d || s == null || e == null) return false; // only check when complete

    return allRows.some(r => {
      if (ignoreId && r.id === ignoreId) return false;
      if (r.day !== d) return false;
      const rs = parseHHMM(r.start);
      const re = parseHHMM(r.end);
      if (rs == null || re == null) return false;
      // overlap if start < otherEnd && end > otherStart
      return s < re && e > rs;
    });
  };

  const showToast = (msg, type = "info") => {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  };

  const sanitize = (s) => trim(s).replace(/[<>]/g, "");

  // --------- Render: Table ---------
  const renderTable = () => {
    if (!tbody) return;
    const q = trim(searchInput?.value || "").toLowerCase();

    const filtered = rows.filter(r => {
      if (!q) return true;
      return (
        (r.name || "").toLowerCase().includes(q) ||
        (r.major || "").toLowerCase().includes(q) ||
        (r.courseCode || "").toLowerCase().includes(q) ||
        (r.courseName || "").toLowerCase().includes(q)
      );
    });

    tbody.innerHTML = "";
    filtered
      .sort((a,b) => {
        // order by day then start time then name
        const ai = DAY_INDEX[a.day] || 9;
        const bi = DAY_INDEX[b.day] || 9;
        if (ai !== bi) return ai - bi;
        const as = parseHHMM(a.start) ?? 9999;
        const bs = parseHHMM(b.start) ?? 9999;
        if (as !== bs) return as - bs;
        return (a.name||"").localeCompare(b.name||"");
      })
      .forEach(r => tbody.appendChild(rowToTr(r)));

    if (rowCountEl) rowCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? "row" : "rows"}`;

    // mark conflicts in current list
    markConflictsInTable();
  };

  const rowToTr = (r) => {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;

    const conflict = hasConflict(r, rows, r.id);
    const conflictBadge = conflict ? `<span class="badge badge-warn" title="Time conflict">Conflict</span>` : "";

    tr.innerHTML = `
      <td>
        <div class="cell-main">
          <strong>${escapeHtml(r.name)}</strong>
          ${conflictBadge}
          <div class="muted small">${escapeHtml(r.email)}</div>
        </div>
      </td>
      <td>
        <div><strong>${escapeHtml(r.courseCode || "")}</strong> ${escapeHtml(r.courseName || "")}</div>
        <div class="muted small">${escapeHtml(r.major || "")}</div>
      </td>
      <td>${escapeHtml(r.day || "")}</td>
      <td>${escapeHtml(r.start || "")}–${escapeHtml(r.end || "")}</td>
      <td>${escapeHtml(r.location || "")}</td>
      <td class="col-actions">
        <button class="btn tiny" data-action="edit">Edit</button>
        <button class="btn tiny danger" data-action="delete">Delete</button>
      </td>
    `;
    return tr;
  };

  const escapeHtml = (s) => sanitize(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  const markConflictsInTable = () => {
    // add a subtle highlight for conflicting rows
    const idsWithConflict = new Set();
    rows.forEach(r => {
      if (hasConflict(r, rows, r.id)) idsWithConflict.add(r.id);
    });
    [...tbody.querySelectorAll("tr")].forEach(tr => {
      tr.classList.toggle("conflict", idsWithConflict.has(tr.dataset.id));
    });
  };

  // --------- Render: Calendar (weekly grid) ---------
  // The HTML should contain a <div id="calendarGrid"></div>.
  // We draw columns for Mon–Sun and place class blocks.
  const HOURS_START = 8;  // 8 AM
  const HOURS_END = 22;   // 10 PM

  const renderCalendar = () => {
    if (!calendarGrid) return;

    // build grid structure
    const hours = [];
    for (let h = HOURS_START; h <= HOURS_END; h++) {
      hours.push(h);
    }

    calendarGrid.innerHTML = "";

    // header row
    const header = document.createElement("div");
    header.className = "cal-row cal-header";
    header.appendChild(cell("", "cal-timecell"));
    DAY_ORDER.forEach(day => header.appendChild(cell(day, "cal-headcell")));
    calendarGrid.appendChild(header);

    // rows per hour
    hours.forEach(h => {
      const row = document.createElement("div");
      row.className = "cal-row";
      row.appendChild(cell(formatHour(h), "cal-timecell"));

      DAY_ORDER.forEach(day => {
        row.appendChild(cell("", "cal-cell", { "data-day": day, "data-hour": h }));
      });

      calendarGrid.appendChild(row);
    });

    // place events
    rows.forEach(r => {
      if (!r.day || parseHHMM(r.start) == null || parseHHMM(r.end) == null) return;
      placeEventBlock(r);
    });
  };

  const cell = (text, cls = "", attrs = {}) => {
    const div = document.createElement("div");
    div.className = cls;
    for (const k in attrs) div.setAttribute(k, attrs[k]);
    if (text) div.textContent = text;
    return div;
  };

  const formatHour = (h) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12}:00 ${ampm}`;
    };

  const placeEventBlock = (r) => {
    const day = r.day;
    const sMin = parseHHMM(r.start);
    const eMin = parseHHMM(r.end);
    if (sMin == null || eMin == null) return;

    // Find the column for that day (all .cal-cell with data-day=day)
    const dayCells = [...calendarGrid.querySelectorAll(`.cal-cell[data-day="${day}"]`)];
    if (!dayCells.length) return;

    // Compute relative position (top offset within the day column)
    const minsPerHour = 60;
    const topUnits = (sMin/60) - HOURS_START;    // in hours from grid start
    const durUnits = (eMin - sMin)/60;           // in hours

    // Create block and absolutely position it inside the column wrapper
    const column = ensureColumnWrapper(day);
    const block = document.createElement("div");
    block.className = "cal-event";
    block.dataset.id = r.id;

    const conflict = hasConflict(r, rows, r.id);
    if (conflict) block.classList.add("warn");

    block.innerHTML = `
      <div class="cal-title">${escapeHtml(r.courseCode || "")}</div>
      <div class="cal-sub">${escapeHtml(r.courseName || "")}</div>
      <div class="cal-time">${escapeHtml(r.start)}–${escapeHtml(r.end)}</div>
      <div class="cal-loc">${escapeHtml(r.location || "")}</div>
    `;

    // Position (CSS sets 1 hour = 60px height; adjust in CSS if needed)
    block.style.top = `${topUnits * 60}px`;
    block.style.height = `${durUnits * 60}px`;

    column.appendChild(block);
  };

  const ensureColumnWrapper = (day) => {
    // Create a positioned wrapper on first use so events can be absolutely positioned
    let col = calendarGrid.querySelector(`.cal-column[data-day="${day}"]`);
    if (col) return col;

    // Find the first cell for that day to infer column placement
    const firstCell = calendarGrid.querySelector(`.cal-cell[data-day="${day}"]`);
    if (!firstCell) return null;

    // Create wrapper and overlay it on the column
    col = document.createElement("div");
    col.className = "cal-column";
    col.dataset.day = day;

    // Insert wrapper into the DOM flow next to the grid so it aligns via CSS
    calendarGrid.appendChild(col);
    return col;
  };

  // --------- Form handling ---------
  const getFormData = () => {
    const fd = new FormData(form);
    return {
      id: uid(),
      name: sanitize(fd.get("name")),
      email: sanitize(fd.get("email")),
      major: sanitize(fd.get("major")),
      year: sanitize(fd.get("year")),
      notes: sanitize(fd.get("notes")),
      courseCode: sanitize(fd.get("courseCode")),
      courseName: sanitize(fd.get("courseName")),
      day: sanitize(fd.get("day")),
      start: sanitize(fd.get("start")),
      end: sanitize(fd.get("end")),
      location: sanitize(fd.get("location")),
      createdAt: Date.now()
    };
  };

  const validate = (obj, isEdit = false, idToIgnore = null) => {
    const errors = {};

    if (!trim(obj.name)) errors.name = "Name is required.";

    if (!trim(obj.email)) {
      errors.email = "Email is required.";
    } else if (!isRitEmail(obj.email)) {
      errors.email = "Use your RIT email (@rit.edu).";
    }

    if (!trim(obj.major)) errors.major = "Major is required.";
    if (!trim(obj.year)) errors.year = "Year is required.";

    // If any of the class fields are entered, require all three (day/start/end)
    const anyClass =
      trim(obj.courseCode) || trim(obj.courseName) || trim(obj.day) || trim(obj.start) || trim(obj.end) || trim(obj.location);

    if (anyClass) {
      if (!trim(obj.day)) errors.day = "Day is required.";
      const s = parseHHMM(obj.start);
      const e = parseHHMM(obj.end);
      if (s == null) errors.start = "Start must be HH:MM.";
      if (e == null) errors.end = "End must be HH:MM.";
      if (s != null && e != null && e <= s) errors.end = "End must be after start.";

      if (!errors.start && !errors.end && !errors.day) {
        const conf = hasConflict(obj, rows, idToIgnore);
        if (conf) errors._conflict = "Warning: this class conflicts with another one.";
      }
    }

    return errors;
  };

  const showInlineErrors = (errors) => {
    [...form.querySelectorAll(".error")].forEach(el => (el.style.display = "none", el.textContent = ""));
    Object.entries(errors).forEach(([name, msg]) => {
      if (name === "_conflict") return; // shown via toast
      const field = form.querySelector(`[name="${name}"]`);
      const errorEl = field?.closest("label")?.querySelector(".error");
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = "block";
      }
    });
  };

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const obj = getFormData();
    const errors = validate(obj);
    showInlineErrors(errors);

    if (errors._conflict) {
      // show toast but still allow save (you can change this to block if you want)
      showToast(errors._conflict, "warn");
    }

    // if we have field errors, stop
    const hasFieldErr = Object.keys(errors).some(k => k !== "_conflict");
    if (hasFieldErr) return;

    rows.push(obj);
    save(rows);
    form.reset();
    showToast("Enrollment added", "ok");
    renderTable();
    renderCalendar();
  });

  form?.addEventListener("reset", () => {
    [...form.querySelectorAll(".error")].forEach(el => (el.style.display = "none", el.textContent = ""));
  });

  // Table actions (edit/delete)
  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr?.dataset.id;
    const row = rows.find(r => r.id === id);
    if (!row) return;

    const action = btn.dataset.action;
    if (action === "delete") {
      if (confirm("Delete this enrollment?")) {
        rows = rows.filter(r => r.id !== id);
        save(rows);
        renderTable();
        renderCalendar();
        showToast("Deleted", "ok");
      }
    } else if (action === "edit") {
      enterEditMode(tr, row);
    }
  });

  const enterEditMode = (tr, row) => {
    tr.classList.add("editing");
    tr.innerHTML = `
      <td>
        <input class="in" type="text" data-f="name" value="${escapeHtml(row.name)}" />
        <input class="in" type="email" data-f="email" value="${escapeHtml(row.email)}" />
        <div class="muted small">Major/Year stay below</div>
      </td>
      <td>
        <input class="in" type="text" data-f="courseCode" value="${escapeHtml(row.courseCode||"")}" placeholder="Course Code"/>
        <input class="in" type="text" data-f="courseName" value="${escapeHtml(row.courseName||"")}" placeholder="Course Name"/>
        <input class="in" type="text" data-f="major" value="${escapeHtml(row.major)}" placeholder="Major"/>
        <input class="in" type="text" data-f="year" value="${escapeHtml(row.year)}" placeholder="Year"/>
      </td>
      <td>
        <select class="in" data-f="day">
          ${DAY_ORDER.map(d => `<option ${row.day===d?"selected":""}>${d}</option>`).join("")}
        </select>
      </td>
      <td>
        <input class="in" type="time" data-f="start" value="${escapeHtml(row.start||"")}" />
        <input class="in" type="time" data-f="end" value="${escapeHtml(row.end||"")}" />
      </td>
      <td>
        <input class="in" type="text" data-f="location" value="${escapeHtml(row.location||"")}" placeholder="Location"/>
      </td>
      <td class="col-actions">
        <button class="btn tiny" data-action="save">Save</button>
        <button class="btn tiny" data-action="cancel">Cancel</button>
      </td>
    `;

    tr.querySelector('[data-action="save"]').addEventListener("click", () => {
      const edited = { ...row };
      tr.querySelectorAll(".in").forEach(inp => edited[inp.dataset.f] = sanitize(inp.value));

      const errs = validate(edited, true, edited.id);
      if (errs._conflict) showToast(errs._conflict, "warn");
      const hasFieldErr = Object.keys(errs).some(k => k !== "_conflict");
      if (hasFieldErr) {
        showToast("Fix validation errors", "warn");
        return;
      }

      const idx = rows.findIndex(r => r.id === row.id);
      rows[idx] = edited;
      save(rows);
      renderTable();
      renderCalendar();
      showToast("Saved", "ok");
    });

    tr.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      renderTable();
    });
  };

  // Search
  searchInput?.addEventListener("input", () => renderTable());

  // Export CSV
  exportBtn?.addEventListener("click", () => {
    if (!rows.length) return showToast("Nothing to export", "warn");
    const headers = [
      "Name","Email","Major","Year","Notes",
      "Course Code","Course Name","Day","Start","End","Location"
    ];
    const lines = [headers.join(",")];

    rows.forEach(r => {
      const vals = [
        r.name, r.email, r.major, r.year, r.notes,
        r.courseCode, r.courseName, r.day, r.start, r.end, r.location
      ].map(csvSafe);
      lines.push(vals.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "rit_enrollments.csv"
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const csvSafe = (s="") => {
    const v = (s ?? "").toString();
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g,'""')}"`;
    return v;
  };

  // Initial paint
  renderTable();
  renderCalendar();

  // --------------- Accessibility touch for keyboard focus ---------------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toast?.classList.remove("show");
  });
})();
```
