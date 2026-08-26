/* ---- Site admin: Google-sign-in + Sheets CRUD (no backend) ----

SETUP
1. console.cloud.google.com -> create a project (use the church's Google account
   so ownership stays with them; add your own as a collaborator during the build).
2. APIs & Services -> enable "Google Sheets API".
3. OAuth consent screen -> External -> app name + support email -> save ->
   add the admins' Google accounts as test users.
4. Credentials -> Create credentials -> OAuth client ID -> Web application ->
   Authorized JavaScript origins:
       http://localhost:8000
       http://127.0.0.1:8000
       https://alewis98.github.io
     (+ the church's real domain when it exists)
5. Paste the Client ID below.

The Google account you sign in with must have EDITOR access to the sheet
(Sheet -> Share -> add the account). The public pages only ever use the
read-only endpoint, so visitors are unaffected by any of this.
*/

const CLIENT_ID = "402191675357-e7ui4cpqbkie35q5q2mvpakjb6nm5avd.apps.googleusercontent.com";
/* SHEET_ID comes from js/gsheets.js (same spreadsheet, loaded first) */
const SCOPES = "https://www.googleapis.com/auth/spreadsheets openid email";
const TOKEN_KEY = "lakewood_admin_token";
const DEFAULT_HEADERS = ["Title", "Subtitle", "Text", "Start Date", "End Date", "Display Date", "Image URL"];

const state = {
  token: null,
  email: "",
  tab: "Announcements",
  headerRow: DEFAULT_HEADERS.slice(),
  headers: DEFAULT_HEADERS.map((h) => h.toLowerCase().replace(/[^a-z]/g, "")),
  rows: [],
  editRow: -1,
  previewRow: -1,
  padTo: 0,
  sheetIds: {}
};

const $ = (id) => document.getElementById(id);
const gate = $("gate");
const app = $("app");
const list = $("entryList");
const formPanel = $("formPanel");

let tokenClient = null;
let rearmTimer = null;

/* ---- auth ---- */

function initAuth() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          gateMessage(resp.error === "popup_closed_by_user" ? "Sign-in was closed before finishing." : "Sign-in failed: " + resp.error);
          return;
        }
        state.token = resp.access_token;
        sessionStorage.setItem(TOKEN_KEY, state.token);
        enterEditor();
        whoami();
        loadTab().catch(() => {});
      }
    });
  } catch (err) {
    gateMessage("Google sign-in could not load (" + err.message + "). Disable content blockers and reload.");
  }
}

function signIn() {
  if (CLIENT_ID.indexOf("PASTE") === 0) {
    gateMessage("Not configured yet \u2014 paste your OAuth Client ID into js/admin.js (see the setup notes at the top of that file).");
    return;
  }
  if (!tokenClient) {
    gateMessage("Google sign-in is unavailable \u2014 check that nothing is blocking accounts.google.com.");
    return;
  }
  setSpinner(true);
  tokenClient.requestAccessToken({ prompt: "" });
}

function signOut() {
  const token = state.token;
  state.token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  showGate("Signed out.");
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
}

async function whoami() {
  try {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + state.token }
    });
    if (r.ok) {
      const u = await r.json();
      state.email = u.email || "";
    }
  } catch (e) { /* non-fatal */ }
  $("whoami").textContent = state.email;
}

function enterEditor() {
  setSpinner(false);
  gate.hidden = true;
  app.hidden = false;
  $("signOutBtn").hidden = false;
  $("whoami").textContent = state.email;
}

function showGate(message) {
  state.token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  app.hidden = true;
  $("signOutBtn").hidden = true;
  gate.hidden = false;
  setSpinner(false);
  $("gateStatus").textContent = message || "";
}

function gateMessage(message) {
  setSpinner(false);
  $("gateStatus").textContent = message;
}

function setSpinner(on) {
  $("gateSpinner").style.display = on ? "block" : "none";
  $("signInBtn").hidden = on;
}

/* ---- Sheets API ---- */

async function api(path, opts = {}) {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID + path, {
    method: opts.method || "GET",
    headers: {
      Authorization: "Bearer " + state.token,
      "Content-Type": "application/json"
    },
    body: opts.body
  });
  if (res.status === 401 || res.status === 403) {
    showGate("Session expired or access denied \u2014 sign in again. Make sure this account has EDITOR access to the sheet.");
    throw new Error("auth");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error("Sheets API error " + res.status + ": " + detail);
  }
  return res.json();
}

function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - r) / 26);
  }
  return s;
}

async function sheetIdFor(tab) {
  if (state.sheetIds[tab]) return state.sheetIds[tab];
  const res = await api("?fields=sheets(properties)");
  const found = (res.sheets || []).find((s) => s.properties.title === tab);
  if (!found) throw new Error("Tab not found: " + tab);
  state.sheetIds[tab] = found.properties.sheetId;
  return state.sheetIds[tab];
}

async function loadTab() {
  status("Loading\u2026");
  const res = await api("/values/" + encodeURIComponent(state.tab) + "!A1:Z100");
  const vals = res.values || [];
  state.headerRow = vals[0] || DEFAULT_HEADERS.slice();
  state.headers = state.headerRow.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  state.rows = vals.slice(1);
  renderList();
  status("Loaded " + state.rows.length + " entries.");
}

async function writeAllRows(oldDataCount) {
  const header = state.headerRow.length ? state.headerRow.slice() : DEFAULT_HEADERS.slice();
  const width = Math.min(26, Math.max(8, header.length, ...state.rows.map((r) => r.length)));
  const total = Math.max(state.padTo || 0, state.rows.length) + 1;
  const payload = [header.slice(0, width)];
  state.rows.forEach((r) => {
    const c = r.slice();
    while (c.length < width) c.push("");
    payload.push(c.slice(0, width));
  });
  while (payload.length < total) payload.push(new Array(width).fill(""));
  const range = state.tab + "!A1:" + colLetter(width) + total;
  await api("/values/" + encodeURIComponent(range) + "?valueInputOption=RAW", {
    method: "PUT",
    body: JSON.stringify({ values: payload })
  });
  state.padTo = 0;
}

/* ---- list ---- */

const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function statusOf(row) {
  const start = ChurchSheet.parseDate(row[3]);
  const end = ChurchSheet.parseDate(row[4]);
  const now = new Date();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (start && start > now) return "scheduled";
  if (end && end < endOfToday) return "expired";
  return "live";
}

function renderList() {
  list.innerHTML = "";
  if (!state.rows.length) {
    const div = document.createElement("div");
    div.className = "entry-row";
    div.innerHTML = '<span class="row-meta">This tab is empty \u2014 use \u201c+ New entry\u201d to add the first one.</span>';
    list.appendChild(div);
    return;
  }
  state.rows.forEach((row, i) => {
    const st = statusOf(row);
    const item = document.createElement("div");
    item.className = "entry-row" + (i === state.previewRow ? " selected" : "");
    const title = row[0] || "(untitled)";
    const dateSrc = ChurchSheet.parseDate(row[5]) || ChurchSheet.parseDate(row[3]);
    const dateText = dateSrc ? ChurchSheet.formatDate(dateSrc) : "";
    const images = row.slice(6).filter((c) => c && c.trim()).length;
    item.innerHTML =
      '<span class="row-num">#' + (i + 1) + "</span>" +
      '<span class="row-main"><span class="row-title">' + ChurchSheet.esc(title) + '</span>' +
      '<span class="row-meta"><span class="badge ' + st + '">' + st + "</span>" +
      (dateText ? "<span>" + ChurchSheet.esc(dateText) + "</span>" : "") +
      (images ? "<span>" + images + " image" + (images > 1 ? "s" : "") + "</span>" : "") +
      "</span></span>" +
      '<span class="entry-actions">' +
      '<button class="iconbtn" data-act="up" title="Move up" aria-label="Move up">' + UP + "</button>" +
      '<button class="iconbtn" data-act="down" title="Move down" aria-label="Move down">' + DOWN + "</button>" +
      '<button class="iconbtn" data-act="edit" title="Edit" aria-label="Edit">' + PENCIL + "</button>" +
      '<button class="iconbtn danger" data-act="del" title="Delete" aria-label="Delete">' + TRASH + "</button>" +
      "</span>";
    item.querySelector('[data-act="up"]').disabled = i === 0;
    item.querySelector('[data-act="down"]').disabled = i === state.rows.length - 1;
    item.querySelector('[data-act="up"]').addEventListener("click", () => moveRow(i, -1));
    item.querySelector('[data-act="down"]').addEventListener("click", () => moveRow(i, 1));
    item.querySelector('[data-act="edit"]').addEventListener("click", () => openForm(i));
    item.querySelector('[data-act="del"]').addEventListener("click", () => deleteRow(i));
    item.addEventListener("click", (e) => {
      if (e.target.closest(".iconbtn")) return;
      selectPreview(i);
    });
    list.appendChild(item);
  });
}

/* ---- mutations ---- */

async function moveRow(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.rows.length) return;
  status("Saving\u2026");
  try {
    const rows = state.rows.slice();
    const tmp = rows[i];
    rows[i] = rows[j];
    rows[j] = tmp;
    state.rows = rows;
    if (state.previewRow === i) state.previewRow = j;
    else if (state.previewRow === j) state.previewRow = i;
    await writeAllRows(rows.length);
    await loadTab();
    renderRowPreview(state.previewRow);
    [...list.children].forEach((el, k) => el.classList.toggle("selected", k === state.previewRow));
    status("Order updated.");
  } catch (err) {
    if (err.message !== "auth") status(err.message, true);
  }
}

async function deleteRow(i) {
  if (!confirm("Delete \u201c" + (state.rows[i][0] || "(untitled)") + "\u201d? This removes the row from the sheet.")) return;
  status("Deleting\u2026");
  try {
    state.padTo = state.rows.length;
    state.rows.splice(i, 1);
    if (state.previewRow === i) state.previewRow = -1;
    else if (state.previewRow > i) state.previewRow--;
    await writeAllRows();
    await loadTab();
    if (state.previewRow >= 0) renderRowPreview(state.previewRow);
    else $("formPreview").innerHTML = "";
    status("Entry deleted.");
  } catch (err) {
    if (err.message !== "auth") status(err.message, true);
  }
}

/* ---- form ---- */

const fTitle = $("fTitle"), fSubtitle = $("fSubtitle"), fText = $("fText");
const fStart = $("fStart"), fEnd = $("fEnd"), fDisplay = $("fDisplay");
const fImages = $("fImages"), formError = $("formError");

function imageInputRow(value) {
  const wrap = document.createElement("div");
  wrap.className = "img-row";
  const input = document.createElement("input");
  input.type = "url";
  input.value = value || "";
  input.placeholder = "https://\u2026 or Google Drive link";
  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "iconbtn danger";
  rm.innerHTML = TRASH;
  rm.setAttribute("aria-label", "Remove image");
  rm.addEventListener("click", () => wrap.remove());
  wrap.appendChild(input);
  wrap.appendChild(rm);
  return wrap;
}

function imageValues() {
  return [...fImages.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
}

function renderImageInputs(values) {
  fImages.innerHTML = "";
  (values.length ? values : [""]).forEach((v) => fImages.appendChild(imageInputRow(v)));
}

function toInputDate(s) {
  if (!s) return "";
  const d = ChurchSheet.parseDate(s);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function openForm(rowIndex) {
  state.editRow = rowIndex;
  formError.textContent = "";
  const row = rowIndex >= 0 ? state.rows[rowIndex] || [] : [];
  fTitle.value = row[0] || "";
  fSubtitle.value = row[1] || "";
  fText.value = row[2] || "";
  fStart.value = toInputDate(row[3]);
  fEnd.value = toInputDate(row[4]);
  fDisplay.value = toInputDate(row[5]);
  const extras = row.slice(7).filter((c) => c && c.trim());
  renderImageInputs(extras.length ? extras : row[6] ? [row[6]] : []);
  $("formHeading").textContent = rowIndex >= 0
    ? "Edit entry #" + (rowIndex + 1)
    : "New entry (will appear at the top)";
  formPanel.hidden = false;
  state.previewRow = rowIndex;
  [...list.children].forEach((el, k) => el.classList.toggle("selected", k === rowIndex));
  renderPreview();
  formPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeForm() {
  state.editRow = -1;
  formPanel.hidden = true;
  if (state.previewRow >= 0 && state.previewRow < state.rows.length) renderRowPreview(state.previewRow);
}

function collectRow() {
  const orig = state.editRow >= 0 ? state.rows[state.editRow] || [] : [];
  const row = orig.slice();
  while (row.length < 8) row.push("");
  const images = imageValues();
  row[0] = fTitle.value.trim();
  row[1] = fSubtitle.value.trim();
  row[2] = fText.value;
  row[3] = fStart.value;
  row[4] = fEnd.value;
  row[5] = fDisplay.value;
  images.forEach((u, k) => { row[6 + k] = u; });
  for (let i = 6 + images.length; i < row.length; i++) row[i] = "";
  return row;
}

function validateForm() {
  if (!fTitle.value.trim()) return "Title is required.";
  if (!fText.value.trim()) return "Text is required.";
  if (fStart.value && fEnd.value && fEnd.value < fStart.value) return "End Date cannot be before Start Date.";
  const bad = imageValues().find((u) => !/^https?:\/\//i.test(u) && !/drive\.google\.com/i.test(u));
  if (bad) return "Image links must start with http (or be a Google Drive share link).";
  return "";
}

function buildCard(opts) {
  const card = document.createElement("article");
  card.className = "post-card";
  if (opts.images.length) card.appendChild(ChurchSheet.buildMedia(opts.images));
  const body = document.createElement("div");
  body.className = "post-body";
  let html = "";
  if (opts.dateSrc) {
    const d = ChurchSheet.parseDate(opts.dateSrc);
    if (d) html += '<p class="post-date">' + ChurchSheet.esc(ChurchSheet.formatDate(d)) + "</p>";
  }
  if (opts.title) html += "<h3>" + ChurchSheet.esc(opts.title) + "</h3>";
  if (opts.subtitle) html += '<p class="post-sub">' + ChurchSheet.esc(opts.subtitle) + "</p>";
  if (opts.text) html += "<p>" + ChurchSheet.esc(opts.text) + "</p>";
  body.innerHTML = html;
  card.appendChild(body);
  return card;
}

function renderPreview() {
  const holder = $("formPreview");
  holder.innerHTML = "";
  holder.appendChild(buildCard({
    images: imageValues(),
    dateSrc: fDisplay.value || fStart.value,
    title: fTitle.value.trim(),
    subtitle: fSubtitle.value.trim(),
    text: fText.value.trim()
  }));
}

function renderRowPreview(i) {
  const holder = $("formPreview");
  if (i < 0 || i >= state.rows.length) { holder.innerHTML = ""; return; }
  const row = state.rows[i];
  holder.innerHTML = "";
  holder.appendChild(buildCard({
    images: row.slice(6).filter((c) => c && c.trim()),
    dateSrc: row[5] || row[3],
    title: row[0],
    subtitle: row[1],
    text: row[2]
  }));
}

function selectPreview(i) {
  state.previewRow = i;
  renderRowPreview(i);
  [...list.children].forEach((el, k) => el.classList.toggle("selected", k === i));
}

async function saveForm() {
  const err = validateForm();
  formError.textContent = err;
  if (err) return;
  const row = collectRow();
  const isEdit = state.editRow >= 0;
  const savedIndex = isEdit ? state.editRow : 0;
  status(isEdit ? "Saving\u2026" : "Publishing\u2026");
  try {
    if (isEdit) {
      state.rows[state.editRow] = row;
      await writeAllRows(state.rows.length);
    } else {
      state.rows.unshift(row);
      await writeAllRows(state.rows.length);
    }
    closeForm();
    await loadTab();
    state.previewRow = savedIndex;
    renderRowPreview(savedIndex);
    [...list.children].forEach((el, k) => el.classList.toggle("selected", k === savedIndex));
    status(isEdit ? "Entry updated." : "Entry published at the top.");
  } catch (e) {
    if (e.message !== "auth") status(e.message, true);
  }
}

/* ---- CSV ---- */

function exportCSV() {
  const csv = ChurchSheet.buildCSV([state.headerRow, ...state.rows]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.tab.toLowerCase() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  status("Exported " + (state.rows.length + 1) + " rows (including header).");
}

async function importCSV(file) {
  const text = await file.text();
  const rows = ChurchSheet.parseCSV(text);
  if (!rows.length || !rows[0].some((h) => h.trim().toLowerCase().includes("title"))) {
    status("Import failed: the first row must be the header row (Title, \u2026).", true);
    return;
  }
  const dataCount = rows.length - 1;
  if (!confirm("Import " + dataCount + " rows into \u201c" + state.tab + "\u201d?\n\nThis REPLACES all current data in this tab.")) return;
  status("Importing\u2026");
  try {
    state.headerRow = rows[0];
    state.headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
    state.rows = rows.slice(1);
    state.padTo = dataCount;
    await writeAllRows();
    await loadTab();
    status("Imported " + dataCount + " rows.");
  } catch (err) {
    if (err.message !== "auth") status(err.message, true);
  }
}

/* ---- keyboard: arrows move the selection when the form is closed ---- */

window.addEventListener("keydown", (e) => {
  if (!formPanel.hidden) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  if (!state.rows.length) return;
  e.preventDefault();
  const dir = e.key === "ArrowDown" ? 1 : -1;
  const next = Math.min(state.rows.length - 1, Math.max(0, state.previewRow + dir));
  if (next === state.previewRow) return;
  selectPreview(next);
  const el = list.children[next];
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
});

/* ---- status + wiring ---- */

function status(message, isError) {
  const el = $("statusMsg");
  el.textContent = message;
  el.classList.toggle("err", !!isError);
}

$("signInBtn").addEventListener("click", signIn);
$("signOutBtn").addEventListener("click", signOut);
$("refreshBtn").addEventListener("click", () => loadTab().catch((e) => status(e.message, true)));
$("newBtn").addEventListener("click", () => openForm(-1));
$("cancelBtn").addEventListener("click", closeForm);
$("saveBtn").addEventListener("click", saveForm);
$("addImageBtn").addEventListener("click", () => {
  fImages.appendChild(imageInputRow(""));
  fImages.lastChild.querySelector("input").focus();
});
$("exportBtn").addEventListener("click", exportCSV);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  if (e.target.files[0]) importCSV(e.target.files[0]);
  e.target.value = "";
});
formPanel.addEventListener("input", renderPreview);

document.querySelectorAll(".tab-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".tab-pill").forEach((x) => x.classList.remove("active"));
      pill.classList.add("active");
      state.tab = pill.dataset.tab;
      state.previewRow = -1;
      $("formPreview").innerHTML = "";
      closeForm();
      loadTab().catch((e) => status(e.message, true));
    });
});

/* ---- boot ---- */

initAuth();

const saved = sessionStorage.getItem(TOKEN_KEY);
if (saved) {
  state.token = saved;
  whoami().then(() => {
    enterEditor();
    loadTab().catch(() => {});
  });
} else {
  showGate();
}
