const STORAGE_KEY = "master-list";
const TABLE = "master_list_items";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  },
);

const listEl = document.getElementById("list");
const columnEl = document.querySelector(".column");
const addEl = document.getElementById("add");
const savedEl = document.getElementById("saved");
const menuEl = document.getElementById("menu");

let items = [];
let ready = false;
let drag = null;
let editing = null;
let editSnapshot = null;
let menuContext = null;
let savedTimer = 0;
let cloudQueue = Promise.resolve(true);

function newId() {
  return crypto.randomUUID();
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function normalizeItem(item, index) {
  return {
    id: isUuid(item.id) ? item.id : newId(),
    text: typeof item.text === "string" ? item.text : "",
    note: typeof item.note === "string" ? item.note : null,
    noteCollapsed: Boolean(item.noteCollapsed),
    position: index,
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map(normalizeItem);
  } catch {
    return [];
  }
}

function saveLocal() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(items.map(({ id, text, note, noteCollapsed }) => ({
      id,
      text,
      note,
      noteCollapsed,
    }))),
  );
}

function toRow(item, index) {
  return {
    id: item.id,
    text: item.text,
    note: item.note,
    note_collapsed: Boolean(item.noteCollapsed),
    position: index,
  };
}

function fromRow(row) {
  return {
    id: row.id,
    text: typeof row.text === "string" ? row.text : "",
    note: typeof row.note === "string" ? row.note : null,
    noteCollapsed: Boolean(row.note_collapsed),
  };
}

function enqueue(task) {
  const run = cloudQueue.then(task, task);
  cloudQueue = run.then(
    (ok) => ok !== false,
    () => false,
  );
  return run;
}

function saveCloud() {
  return enqueue(async () => {
    if (!items.length) return true;
    const rows = items.map(toRow);
    const { error } = await supabase.from(TABLE).upsert(rows);
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  });
}

function deleteCloud(id) {
  return enqueue(async () => {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) {
      console.error(error);
      return false;
    }
    if (items.length) {
      const { error: orderError } = await supabase.from(TABLE).upsert(items.map(toRow));
      if (orderError) {
        console.error(orderError);
        return false;
      }
    }
    return true;
  });
}

async function loadCloud() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, text, note, note_collapsed, position")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []).map(fromRow);
}

function showToast(message) {
  savedEl.textContent = message;
  savedEl.hidden = false;
  savedEl.classList.remove("is-visible");
  void savedEl.offsetWidth;
  savedEl.classList.add("is-visible");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedEl.classList.remove("is-visible");
    savedEl.hidden = true;
  }, 2200);
}

function hideMenu() {
  menuEl.hidden = true;
  menuContext = null;
}

function removeItem(id) {
  if (editing?.id === id) {
    editing = null;
    editSnapshot = null;
  }
  items = items.filter((entry) => entry.id !== id);
  saveLocal();
  deleteCloud(id);
  render();
}

function showMenu(x, y, id, target) {
  menuContext = { id, target };
  menuEl.hidden = false;
  const margin = 8;
  const rect = menuEl.getBoundingClientRect();
  let top = y;
  let left = x;
  if (top + rect.height > window.innerHeight - margin) top = y - rect.height;
  if (top < margin) top = Math.max(margin, window.innerHeight - margin - rect.height);
  if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - margin - rect.width;
  if (left < margin) left = margin;
  menuEl.style.top = `${top}px`;
  menuEl.style.left = `${left}px`;
}

function openContextMenu(event, id, target) {
  event.preventDefault();
  showMenu(event.clientX, event.clientY, id, target);
}

function revertEdit() {
  if (!editing) return;
  const entry = findItem(editing.id);
  if (entry) {
    if (editing.target === "item") entry.text = editSnapshot ?? "";
    else if (entry.note != null) entry.note = editSnapshot ?? "";
  }
  editing = null;
  editSnapshot = null;
}

function beginEdit(id, target) {
  if (editing && (editing.id !== id || editing.target !== target)) revertEdit();
  const entry = findItem(id);
  if (!entry) return;
  if (target === "note") {
    if (entry.note == null) return;
    if (entry.noteCollapsed) {
      entry.noteCollapsed = false;
      saveLocal();
      saveCloud();
    }
  }
  editSnapshot = target === "item" ? entry.text : entry.note;
  editing = { id, target };
  hideMenu();
  render();
}

function cancelEdit() {
  revertEdit();
  render();
}

function commitItem(id, value) {
  const entry = findItem(id);
  if (!entry) return;
  entry.text = value;
  editing = null;
  editSnapshot = null;
  saveLocal();
  const pending = saveCloud();
  render();
  pending.then((ok) => showToast(ok ? "Saved." : "Not saved."));
}

function commitNote(id, value) {
  const entry = findItem(id);
  if (!entry || entry.note == null) return;
  entry.note = value;
  editing = null;
  editSnapshot = null;
  saveLocal();
  saveCloud();
  render();
}

function focusField(field) {
  requestAnimationFrame(() => {
    field.focus();
    const end = field.value.length;
    if (typeof field.setSelectionRange === "function") field.setSelectionRange(end, end);
  });
}

function placeColumn() {
  const fields = [...listEl.querySelectorAll(".item-view, input.item")];
  const textWidth = fields.reduce((max, el) => Math.max(max, el.offsetWidth), 0);
  const viewport = document.documentElement.clientWidth;
  const naturalLeft = (fields[0] || addEl).getBoundingClientRect().left;
  const block = fields.length ? textWidth : addEl.offsetWidth;
  const target = Math.max(16, Math.round((viewport - block) / 2));
  const current = parseFloat(columnEl.style.marginLeft) || 0;
  const next = Math.max(0, current + target - naturalLeft);
  columnEl.style.marginLeft = `${next}px`;
  columnEl.style.setProperty("--column-left", `${next}px`);
}

function render() {
  hideMenu();
  listEl.replaceChildren();
  for (const item of items) {
    listEl.append(rowEl(item));
  }
  placeColumn();
}

function rowEl(item) {
  const li = document.createElement("li");
  li.className = "row";
  li.dataset.id = item.id;
  if (item.note != null) li.classList.add("has-note");
  if (editing?.id === item.id && editing.target === "item") li.classList.add("is-editing");

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

  const editingItem = editing?.id === item.id && editing.target === "item";
  let itemField;
  if (editingItem) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "item";
    input.value = item.text;
    input.setAttribute("aria-label", "Item");
    input.autocomplete = "off";
    input.enterKeyHint = "done";
    input.addEventListener("input", () => {
      const entry = findItem(item.id);
      if (!entry) return;
      entry.text = input.value;
      placeColumn();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
        return;
      }
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      commitItem(item.id, input.value);
    });
    itemField = input;
    focusField(input);
  } else {
    const view = document.createElement("div");
    view.className = "item-view";
    view.textContent = item.text;
    view.addEventListener("contextmenu", (event) => openContextMenu(event, item.id, "item"));
    itemField = view;
  }

  parent.append(handle, itemField);
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
    saveLocal();
    saveCloud();
    beginEdit(item.id, "note");
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

  const editingNote = editing?.id === item.id && editing.target === "note";
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "note-preview";
  preview.textContent = item.note.trim() || "Note";
  preview.addEventListener("click", () => setNoteCollapsed(item.id, false));

  if (editingNote && !item.noteCollapsed) {
    const editor = document.createElement("div");
    editor.className = "note-editor";

    const textarea = document.createElement("textarea");
    textarea.className = "note-text";
    textarea.setAttribute("aria-label", "Note");
    textarea.value = item.note;
    textarea.rows = 1;
    textarea.addEventListener("input", () => {
      const entry = findItem(item.id);
      if (!entry) return;
      entry.note = textarea.value;
      autosizeNote(textarea);
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelEdit();
    });

    const saveNote = document.createElement("button");
    saveNote.type = "button";
    saveNote.className = "note-save";
    saveNote.textContent = "Save";
    saveNote.addEventListener("click", () => commitNote(item.id, textarea.value));

    editor.append(textarea, saveNote);
    body.append(elbow, editor);
    focusField(textarea);
    requestAnimationFrame(() => autosizeNote(textarea));
  } else {
    const view = document.createElement("div");
    view.className = "note-view";
    view.textContent = item.note;
    body.append(elbow, view, preview);
  }

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

  actions.append(toggle);
  note.append(body, actions);
  note.addEventListener("contextmenu", (event) => openContextMenu(event, item.id, "note"));
  return note;
}

function removeNote(id) {
  const entry = findItem(id);
  if (!entry) return;
  if (editing?.id === id && editing.target === "note") {
    editing = null;
    editSnapshot = null;
  }
  entry.note = null;
  entry.noteCollapsed = false;
  saveLocal();
  saveCloud();
  render();
}

function setNoteCollapsed(id, collapsed) {
  const entry = findItem(id);
  if (!entry || entry.note == null) return;
  entry.noteCollapsed = Boolean(collapsed);
  saveLocal();
  saveCloud();
  render();
}

function autosizeNote(textarea) {
  textarea.style.height = "auto";
  const max = parseFloat(getComputedStyle(textarea).maxHeight);
  textarea.style.height = `${Math.min(textarea.scrollHeight, max)}px`;
}

function syncOrderFromDom() {
  const ids = [...listEl.querySelectorAll(".row")].map((row) => row.dataset.id);
  items = ids
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  saveLocal();
  saveCloud();
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
  if (!ready) return;
  const item = { id: newId(), text: "", note: null, noteCollapsed: false };
  items.push(item);
  saveLocal();
  saveCloud();
  beginEdit(item.id, "item");
});

menuEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !menuContext) return;
  const { id, target } = menuContext;
  if (button.dataset.action === "edit") {
    beginEdit(id, target);
    return;
  }
  if (button.dataset.action === "delete" && target === "item") {
    hideMenu();
    removeItem(id);
    return;
  }
  if (button.dataset.action === "delete" && target === "note") {
    hideMenu();
    removeNote(id);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (menuEl.hidden || menuEl.contains(event.target)) return;
  hideMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || menuEl.hidden) return;
  hideMenu();
});

window.addEventListener("resize", () => {
  hideMenu();
  placeColumn();
});
window.addEventListener("scroll", hideMenu, true);

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);

async function boot() {
  const local = loadLocal();
  try {
    const cloud = await loadCloud();
    if (cloud.length) {
      items = cloud;
      saveLocal();
    } else if (local.length) {
      items = local;
      saveLocal();
      await saveCloud();
    } else {
      items = [];
    }
  } catch (error) {
    console.error(error);
    items = local;
  }
  ready = true;
  render();
}

boot();
