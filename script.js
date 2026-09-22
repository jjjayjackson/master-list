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
const addEl = document.getElementById("add");
const savedEl = document.getElementById("saved");

let items = [];
let ready = false;
let drag = null;
let savedTimer = 0;
let cloudTimer = 0;
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

function scheduleCloud() {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    saveCloud();
  }, 400);
}

function saveCloud() {
  clearTimeout(cloudTimer);
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
  clearTimeout(cloudTimer);
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

function bindDraft(field, apply) {
  field.enterKeyHint = "done";
  field.addEventListener("input", () => {
    apply();
    saveLocal();
    scheduleCloud();
  });
  field.addEventListener("change", () => {
    apply();
    saveLocal();
    scheduleCloud();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    if (field.tagName === "TEXTAREA" && event.shiftKey) return;
    event.preventDefault();
    apply();
    saveLocal();
    field.blur();
    saveCloud().then((ok) => {
      showToast(ok ? "Saved." : "Not saved.");
    });
  });
}

function render(focusId, focusTarget) {
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
  bindDraft(input, () => {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.text = input.value;
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.setAttribute("aria-label", "Remove");
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    const id = item.id;
    items = items.filter((entry) => entry.id !== id);
    saveLocal();
    deleteCloud(id);
    render();
  });

  parent.append(handle, input, remove);
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
  bindDraft(textarea, () => {
    const entry = findItem(item.id);
    if (!entry) return;
    entry.note = textarea.value;
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
    saveLocal();
    saveCloud();
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
  render(item.id);
});

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
