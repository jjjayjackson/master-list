const TABLE = "master_list_page";
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

const editor = document.getElementById("page");
const saveButton = document.getElementById("save");
const clearButton = document.getElementById("clear");
const statusEl = document.getElementById("status");

let ready = false;
let cloudQueue = Promise.resolve();
let labelTimer = 0;

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

async function persist(content) {
  saveButton.disabled = true;
  clearButton.disabled = true;
  try {
    await savePage(content);
    if (editor.value === content) flashLabel("Saved");
  } catch (error) {
    console.error(error);
    flashLabel("Not saved");
  } finally {
    saveButton.disabled = false;
    clearButton.disabled = false;
  }
}

editor.addEventListener("input", fit);

saveButton.addEventListener("click", () => {
  if (!ready) return;
  persist(editor.value);
});

clearButton.addEventListener("click", () => {
  if (!ready) return;
  editor.value = "";
  fit();
  editor.focus();
  persist("");
});

document.addEventListener("keydown", (event) => {
  if (!ready) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    persist(editor.value);
  }
});

async function boot() {
  try {
    editor.value = await loadPage();
  } catch (error) {
    console.error(error);
    setStatus("Couldn't load", true);
    return;
  }
  ready = true;
  editor.readOnly = false;
  saveButton.disabled = false;
  clearButton.disabled = false;
  fit();
  editor.focus();
}

boot();
