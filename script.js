const STORAGE_KEY = "master-list";

const listEl = document.getElementById("list");
const addEl = document.getElementById("add");
const durationMenuEl = document.getElementById("duration-menu");

let items = load();
let drag = null;
let durationInput = null;

function newId() {
  return crypto.randomUUID();
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : newId(),
        text: typeof item.text === "string" ? item.text : "",
        duration: typeof item.duration === "string" ? item.duration : "",
        note: typeof item.note === "string" ? item.note : null,
        noteCollapsed: Boolean(item.noteCollapsed),
      }));
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function render(focusId, focusTarget) {
  hideDurationMenu();
  listEl.replaceChildren();
  for (const item of items) {
    listEl.append(rowEl(item));
  }
  if (!focusId) return;
  const row = listEl.querySelector(`[data-id="${focusId}"]`);
  if (focusTarget === "note") {
    row?.querySelector(".note-text")?.focus();
  } else {
    row?.querySelector("input.item")?.focus();
  }
}

function rowEl(item) {
  const li = document.createElement("li");
  li.className = "row";
  li.dataset.id = item.id;
  if (item.note != null) li.classList.add("has-note");

  const parent = document.createElement("div");
  parent.className = "parent";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "handle";
  handle.setAttribute("aria-label", "Reorder");
  handle.draggable = true;
  handle.textContent = "⋮⋮";
  handle.addEventListener("pointerdown", onHandlePointerDown);
  handle.addEventListener("dragstart", onHandleDragStart);
  handle.addEventListener("dragend", onHandleDragEnd);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "item";
  input.value = item.text;
  input.setAttribute("aria-label", "Item");
  input.autocomplete = "off";
  function commitText() {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.text = input.value;
    save();
  }
  input.addEventListener("input", commitText);
  input.addEventListener("change", commitText);

  const duration = document.createElement("input");
  duration.type = "text";
  duration.className = "duration";
  duration.value = item.duration;
  duration.setAttribute("aria-label", "Duration");
  duration.autocomplete = "off";
  function commitDuration() {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.duration = duration.value;
    save();
  }
  duration.addEventListener("input", commitDuration);
  duration.addEventListener("change", commitDuration);
  duration.addEventListener("focus", () => {
    requestAnimationFrame(() => {
      if (document.activeElement === duration) showDurationMenu(duration);
    });
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.setAttribute("aria-label", "Remove");
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    items = items.filter((entry) => entry.id !== item.id);
    save();
    render();
  });

  parent.append(handle, input, duration, remove);
  li.append(parent);

  const addNote = document.createElement("button");
  addNote.type = "button";
  addNote.className = "note-add";
  const addElbow = document.createElement("span");
  addElbow.className = "elbow";
  addElbow.setAttribute("aria-hidden", "true");
  const addLabel = document.createElement("span");
  addLabel.className = "note-add-label";
  addLabel.append(addElbow);
  const addText = document.createElement("span");
  addText.textContent = "+ Note";
  addLabel.append(addText);
  addNote.append(addLabel);
  addNote.addEventListener("click", () => {
    const entry = findItem(item.id);
    if (!entry || entry.note != null) return;
    entry.note = "";
    entry.noteCollapsed = false;
    save();
    render(item.id, "note");
  });
  li.append(addNote);

  if (item.note != null) {
    li.append(noteEl(item));
  }

  return li;
}

function findItem(id) {
  return items.find((candidate) => candidate.id === id);
}

function noteEl(item) {
  const note = document.createElement("div");
  note.className = "note";
  if (item.noteCollapsed) note.classList.add("is-collapsed");

  const elbow = document.createElement("span");
  elbow.className = "elbow";
  elbow.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "note-body";

  const textarea = document.createElement("textarea");
  textarea.className = "note-text";
  textarea.setAttribute("aria-label", "Note");
  textarea.value = item.note;
  textarea.rows = 1;
  textarea.addEventListener("input", () => {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.note = textarea.value;
    save();
    autosizeNote(textarea);
  });

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "note-preview";
  preview.textContent = item.note.trim() || "Note";
  preview.addEventListener("click", () => setNoteCollapsed(item.id, false));

  body.append(elbow, textarea, preview);

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "note-toggle";
  toggle.setAttribute("aria-label", item.noteCollapsed ? "Expand note" : "Collapse note");
  toggle.textContent = item.noteCollapsed ? "▸" : "▾";
  toggle.addEventListener("click", () => {
    setNoteCollapsed(item.id, !findItem(item.id)?.noteCollapsed);
  });

  const removeNote = document.createElement("button");
  removeNote.type = "button";
  removeNote.className = "note-remove";
  removeNote.setAttribute("aria-label", "Remove note");
  removeNote.textContent = "×";
  removeNote.addEventListener("click", () => {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.note = null;
    entry.noteCollapsed = false;
    save();
    render();
  });

  actions.append(toggle, removeNote);
  note.append(body, actions);
  if (!item.noteCollapsed) {
    requestAnimationFrame(() => autosizeNote(textarea));
  }
  return note;
}

function setNoteCollapsed(id, collapsed) {
  const entry = findItem(id);
  if (!entry || entry.note == null) return;
  entry.noteCollapsed = Boolean(collapsed);
  save();
  render();
}

function autosizeNote(textarea) {
  textarea.style.height = "auto";
  const max = parseFloat(getComputedStyle(textarea).maxHeight);
  textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
}

function hideDurationMenu() {
  durationMenuEl.hidden = true;
  durationInput = null;
}

function showDurationMenu(input) {
  durationInput = input;
  durationMenuEl.hidden = false;
  const rect = input.getBoundingClientRect();
  const menuRect = durationMenuEl.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  let top = rect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - gap;
  }
  if (top < margin) {
    top = Math.max(margin, window.innerHeight - margin - menuRect.height);
  }
  let left = rect.left;
  if (left + menuRect.width > window.innerWidth - margin) {
    left = window.innerWidth - margin - menuRect.width;
  }
  if (left < margin) left = margin;
  durationMenuEl.style.top = `${top}px`;
  durationMenuEl.style.left = `${left}px`;
}

function syncOrderFromDom() {
  const ids = [...listEl.querySelectorAll(".row")].map((row) => row.dataset.id);
  items = ids
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  save();
}

function placeRow(row, clientY, over) {
  if (!over || over === row) return;
  const rect = over.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  const marker = after ? over.nextSibling : over;
  if (marker === row) return;
  listEl.insertBefore(row, marker);
}

function onHandlePointerDown(event) {
  if (event.pointerType === "mouse") return;
  if (event.button != null && event.button !== 0) return;
  const row = event.currentTarget.closest(".row");
  if (!row) return;

  drag = { row, pointerId: event.pointerId };
  row.classList.add("is-dragging");
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    /* capture is best-effort */
  }
  event.preventDefault();
}

function onHandleDragStart(event) {
  const row = event.currentTarget.closest(".row");
  if (!row) return;
  drag = { row, pointerId: null };
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.id);
}

function onHandleDragEnd() {
  if (!drag) return;
  drag.row.classList.remove("is-dragging");
  drag = null;
  syncOrderFromDom();
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const over = document.elementFromPoint(event.clientX, event.clientY)?.closest(".row");
  placeRow(drag.row, event.clientY, over);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.row.classList.remove("is-dragging");
  drag = null;
  syncOrderFromDom();
}

listEl.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!drag?.row) return;
  const over = event.target.closest(".row");
  placeRow(drag.row, event.clientY, over);
});

addEl.addEventListener("click", () => {
  const item = { id: newId(), text: "", duration: "", note: null, noteCollapsed: false };
  items.push(item);
  save();
  render(item.id);
});

durationMenuEl.addEventListener("pointerdown", (event) => {
  event.preventDefault();
});

durationMenuEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-fill]");
  if (!button || !durationInput) return;
  durationInput.value = button.dataset.fill;
  durationInput.dispatchEvent(new Event("input"));
  hideDurationMenu();
});

document.addEventListener("focusin", (event) => {
  if (event.target.closest?.(".duration")) return;
  if (durationMenuEl.contains(event.target)) return;
  hideDurationMenu();
});

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest?.(".duration")) return;
  if (durationMenuEl.contains(event.target)) return;
  hideDurationMenu();
});

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

render();
