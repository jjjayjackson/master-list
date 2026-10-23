const TABLE = "master_list_page";
const HOLDING = "holding_entries";
const ROW_ID = 1;

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

const holdingView = document.getElementById("holding-view");
const editor = document.getElementById("page");
const saveButton = document.getElementById("save");
const clearButton = document.getElementById("clear");
const holdingButton = document.getElementById("holding");
const popup = document.getElementById("add-holding");
const statusEl = document.getElementById("status");

let ready = false;
let busy = false;
let lockEditor = false;
let holdingOpen = false;
let cloudQueue = Promise.resolve();
let labelTimer = 0;
let clockTimer = 0;
let expiryTimer = 0;
let popupFrame = 0;
let clockOffset = 0;
let holdingEntries = [];
let pending = null;
let armed = null;
let pointerOnPopup = false;

function fit() {
  editor.style.height = "auto";
  editor.style.height = `${editor.scrollHeight}px`;
}

function setStatus(message, visible) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-visible", Boolean(visible));
}

function flashLabel(text) {
  clearTimeout(labelTimer);
  saveButton.textContent = text;
  setStatus(text, text !== "Saved");
  labelTimer = setTimeout(() => {
    saveButton.textContent = "Save";
    if (statusEl.textContent === text) setStatus("", false);
  }, 1400);
}

function enqueue(task) {
  const run = cloudQueue.then(task, task);
  cloudQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

function syncControls() {
  const locked = !ready || busy;
  editor.readOnly = !ready || lockEditor;
  saveButton.hidden = holdingOpen;
  clearButton.hidden = holdingOpen;
  saveButton.disabled = locked;
  clearButton.disabled = locked;
  holdingButton.disabled = locked;
}

function serverNow() {
  return Date.now() + clockOffset;
}

function noteServerNow(value) {
  const time = new Date(value).getTime();
  if (!Number.isNaN(time)) clockOffset = time - Date.now();
}

function normalizeEntry(entry) {
  return {
    id: Number(entry.id),
    content: entry.content,
    created_at: entry.created_at,
    expires_at: entry.expires_at,
  };
}

function sortEntries() {
  holdingEntries.sort((a, b) => {
    const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (delta) return delta;
    return a.id - b.id;
  });
}

function applyHoldingPayload(payload) {
  const body = typeof payload === "string" ? JSON.parse(payload) : payload;
  noteServerNow(body?.server_now);
  holdingEntries = Array.isArray(body?.entries) ? body.entries.map(normalizeEntry) : [];
  sortEntries();
}

async function loadPage() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("content")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.content === "string" ? data.content : "";
}

function savePage(content) {
  return enqueue(async () => {
    const { error } = await supabase.from(TABLE).upsert({
      id: ROW_ID,
      content,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  });
}

async function fetchHolding() {
  const { data, error } = await supabase.rpc("load_holding_entries");
  if (error) throw error;
  return data;
}

async function refreshHolding() {
  applyHoldingPayload(await fetchHolding());
  renderHolding();
  scheduleExpiry();
}

async function persist(content) {
  busy = true;
  syncControls();
  try {
    await savePage(content);
    if (editor.value === content) flashLabel("Saved");
  } catch (error) {
    console.error(error);
    flashLabel("Not saved");
  } finally {
    busy = false;
    syncControls();
  }
}

function remainingLabel(expiresAt) {
  const ms = new Date(expiresAt).getTime() - serverNow();
  if (ms <= 0) return "Expired";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms >= day) {
    const days = Math.floor(ms / day);
    const hours = Math.floor((ms % day) / hour);
    return hours ? `${days}d ${hours}h left` : `${days}d left`;
  }
  if (ms >= hour) {
    const hours = Math.floor(ms / hour);
    const minutes = Math.floor((ms % hour) / minute);
    return minutes ? `${hours}h ${minutes}m left` : `${hours}h left`;
  }
  if (ms < minute) return "under 1m left";
  return `${Math.ceil(ms / minute)}m left`;
}

function activeEntries() {
  const now = serverNow();
  return holdingEntries.filter((entry) => new Date(entry.expires_at).getTime() > now);
}

function renderHolding() {
  holdingView.replaceChildren();
  const entries = activeEntries();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "holding-empty";
    empty.textContent = "Empty";
    holdingView.append(empty);
    return;
  }

  for (const entry of entries) {
    const article = document.createElement("article");
    article.className = "holding-entry";

    const text = document.createElement("p");
    text.className = "holding-text";
    text.textContent = entry.content;

    const remaining = document.createElement("p");
    remaining.className = "holding-remaining";
    remaining.dataset.expires = entry.expires_at;
    remaining.textContent = remainingLabel(entry.expires_at);

    const actions = document.createElement("div");
    actions.className = "holding-actions";

    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Add back to Master List";
    restore.addEventListener("click", () => {
      restoreEntry(entry);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      deleteEntry(entry);
    });

    actions.append(restore, remove);
    article.append(text, remaining, actions);
    holdingView.append(article);
  }
}

function updateRemaining() {
  let expired = false;
  holdingView.querySelectorAll("[data-expires]").forEach((node) => {
    const ms = new Date(node.dataset.expires).getTime() - serverNow();
    node.textContent = remainingLabel(node.dataset.expires);
    if (ms <= 0) expired = true;
  });
  if (expired && holdingOpen) {
    enqueue(() => refreshHolding()).catch((error) => {
      console.error(error);
      renderHolding();
    });
  }
}

function startClock() {
  stopClock();
  clockTimer = setInterval(updateRemaining, 30000);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = 0;
}

function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const now = serverNow();
  let next = Infinity;
  for (const entry of holdingEntries) {
    const time = new Date(entry.expires_at).getTime();
    if (time > now && time < next) next = time;
  }
  if (next === Infinity) return;
  const delay = Math.max(0, Math.min(next - now + 500, 2147483647));
  expiryTimer = setTimeout(() => {
    enqueue(() => refreshHolding()).catch((error) => {
      console.error(error);
      renderHolding();
    });
  }, delay);
}

function appendToList(page, text) {
  if (!page) return text;
  if (page.endsWith("\n") || text.startsWith("\n")) return page + text;
  return `${page}\n${text}`;
}

function hidePopup() {
  popup.hidden = true;
  pending = null;
}

function caretOffset(textarea, index) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const props = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "boxSizing",
  ];
  mirror.style.position = "absolute";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = `${textarea.clientWidth}px`;
  for (const prop of props) mirror.style[prop] = style[prop];
  mirror.textContent = textarea.value.slice(0, index);
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const offset = { top: marker.offsetTop, left: marker.offsetLeft };
  mirror.remove();
  return offset;
}

function placePopup(endIndex) {
  const caret = caretOffset(editor, endIndex);
  const editorRect = editor.getBoundingClientRect();
  if (editorRect.bottom < 0 || editorRect.top > window.innerHeight) {
    hidePopup();
    return;
  }
  popup.hidden = false;
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const caretLeft = editorRect.left + caret.left;
  const caretTop = editorRect.top + caret.top;
  let left = Math.min(Math.max(8, caretLeft), Math.max(8, window.innerWidth - width - 8));
  let top = caretTop - height - 8;
  const spaceAbove = caretTop - 8;
  const spaceBelow = window.innerHeight - caretTop - 28;
  if (height > spaceAbove && spaceBelow > spaceAbove) top = caretTop + 22;
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function updatePopup() {
  if (pointerOnPopup) return;
  if (!ready || busy || holdingOpen || document.activeElement !== editor) {
    hidePopup();
    return;
  }
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value.slice(start, end);
  if (!text.trim()) {
    hidePopup();
    return;
  }
  pending = { start, end, text };
  placePopup(end);
}

function schedulePopup() {
  cancelAnimationFrame(popupFrame);
  popupFrame = requestAnimationFrame(updatePopup);
}

function beginHoldingEdit() {
  busy = true;
  lockEditor = true;
  syncControls();
}

function endHoldingEdit() {
  busy = false;
  lockEditor = false;
  syncControls();
}

async function addToHolding(choice) {
  if (!ready || busy) return;
  const before = editor.value;
  if (before.slice(choice.start, choice.end) !== choice.text) return;
  const next = before.slice(0, choice.start) + before.slice(choice.end);
  editor.value = next;
  editor.setSelectionRange(choice.start, choice.start);
  fit();
  hidePopup();
  beginHoldingEdit();
  try {
    const entry = await enqueue(async () => {
      const { data, error } = await supabase.rpc("move_to_holding", {
        new_content: next,
        held_text: choice.text,
      });
      if (error) throw error;
      return data;
    });
    if (!entry || entry.id == null || typeof entry.content !== "string") {
      throw new Error("Incomplete holding entry");
    }
    noteServerNow(entry.server_now);
    holdingEntries.push(normalizeEntry(entry));
    sortEntries();
    if (holdingOpen) renderHolding();
    scheduleExpiry();
    flashLabel("Saved");
  } catch (error) {
    console.error(error);
    if (editor.value === next) {
      editor.value = before;
      editor.setSelectionRange(choice.start, choice.end);
      fit();
    }
    flashLabel("Not saved");
  } finally {
    endHoldingEdit();
  }
}

async function restoreEntry(entry) {
  if (!ready || busy) return;
  const before = editor.value;
  const next = appendToList(before, entry.content);
  editor.value = next;
  beginHoldingEdit();
  try {
    const result = await enqueue(async () => {
      const { data, error } = await supabase.rpc("restore_holding_entry", {
        entry_id: entry.id,
        new_content: next,
      });
      if (error) throw error;
      return data;
    });
    noteServerNow(result?.server_now);
    holdingEntries = holdingEntries.filter((item) => item.id !== entry.id);
    renderHolding();
    scheduleExpiry();
    flashLabel("Saved");
  } catch (error) {
    console.error(error);
    try {
      editor.value = await loadPage();
      await refreshHolding();
    } catch (loadError) {
      console.error(loadError);
      if (editor.value === next) editor.value = before;
    }
    flashLabel("Not saved");
  } finally {
    endHoldingEdit();
  }
}

async function deleteEntry(entry) {
  if (!ready || busy) return;
  beginHoldingEdit();
  try {
    await enqueue(async () => {
      const { error } = await supabase.from(HOLDING).delete().eq("id", entry.id);
      if (error) throw error;
    });
    holdingEntries = holdingEntries.filter((item) => item.id !== entry.id);
    renderHolding();
    scheduleExpiry();
  } catch (error) {
    console.error(error);
    setStatus("Not saved", true);
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => {
      if (statusEl.textContent === "Not saved") setStatus("", false);
    }, 1400);
    try {
      await enqueue(() => refreshHolding());
    } catch (loadError) {
      console.error(loadError);
    }
  } finally {
    endHoldingEdit();
  }
}

function showHolding(open) {
  if (!ready || busy || open === holdingOpen) return;
  holdingOpen = open;
  if (open) holdingView.style.minHeight = `${editor.offsetHeight}px`;
  editor.hidden = open;
  holdingView.hidden = !open;
  holdingButton.setAttribute("aria-pressed", open ? "true" : "false");
  const label = open ? "Master list" : "Holding area";
  holdingButton.title = label;
  holdingButton.setAttribute("aria-label", label);
  hidePopup();
  syncControls();
  if (open) {
    renderHolding();
    startClock();
    enqueue(() => refreshHolding()).catch((error) => {
      console.error(error);
      setStatus("Couldn't load holding area", true);
    });
  } else {
    holdingView.style.minHeight = "";
    stopClock();
    fit();
    editor.focus();
  }
}

editor.addEventListener("input", () => {
  fit();
  schedulePopup();
});
editor.addEventListener("keyup", schedulePopup);
editor.addEventListener("mouseup", schedulePopup);
editor.addEventListener("touchend", schedulePopup);
document.addEventListener("selectionchange", schedulePopup);
window.addEventListener("resize", schedulePopup);
window.addEventListener("scroll", schedulePopup, true);

popup.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pointerOnPopup = true;
  armed = pending;
});

window.addEventListener("pointerup", (event) => {
  if (popup.contains(event.target)) return;
  pointerOnPopup = false;
  armed = null;
});

popup.addEventListener("pointercancel", () => {
  pointerOnPopup = false;
  armed = null;
});

popup.addEventListener("click", () => {
  const choice = armed || pending;
  armed = null;
  pointerOnPopup = false;
  if (!choice) return;
  hidePopup();
  addToHolding(choice);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hidePopup();
});

saveButton.addEventListener("click", () => {
  if (!ready || busy || holdingOpen) return;
  persist(editor.value);
});

clearButton.addEventListener("click", () => {
  if (!ready || busy || holdingOpen) return;
  editor.value = "";
  fit();
  editor.focus();
  persist("");
});

holdingButton.addEventListener("click", () => {
  showHolding(!holdingOpen);
});

async function boot() {
  try {
    editor.value = await loadPage();
  } catch (error) {
    console.error(error);
    setStatus("Couldn't load", true);
    return;
  }
  try {
    applyHoldingPayload(await fetchHolding());
    scheduleExpiry();
  } catch (error) {
    console.error(error);
    setStatus("Couldn't load holding area", true);
  }
  ready = true;
  syncControls();
  fit();
  editor.focus();
}

boot();
