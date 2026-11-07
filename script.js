const TABLE = "master_list_page";
const ROW_ID = 1;

const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
);
/* All the above is hooking up my backend to Supabase. */

const thevariableforwhereIactuallytype = document.getElementById("whereIactuallytype");
const saveButton = document.getElementById("save");
const clearButton = document.getElementById("clear");

let ready = false;
let returnToSaveTimer = null;

function setButtonLabel(text) {
  clearTimeout(returnToSaveTimer);
  saveButton.textContent = text;
  returnToSaveTimer = setTimeout(() => {
    saveButton.textContent = "Save";
  }, 700);
}

function thisExtendsTheTextBox() {
  thevariableforwhereIactuallytype.style.height = "auto";
  thevariableforwhereIactuallytype.style.height = `${thevariableforwhereIactuallytype.scrollHeight}px`;
}

async function loadPage() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("content")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  
  let content = "";

  if (data !== null && data !== undefined) {
    const value = data.content;

    if (typeof value === "string") {
      content = value;
    }
  }

  return content;
}

async function persist(content) {
  // Disable the save button so the user can't click it again while saving
  saveButton.disabled = true;

  // Disable the clear button for the same reason
  clearButton.disabled = true;

  try {
    // Ask Supabase to save the content
    const { error } = await supabase.from(TABLE).upsert({
      id: ROW_ID,
      content,
    });

    // If Supabase returned an error, throw it so we go to the catch block
    if (error) throw error;

    // If we got here, the save succeeded
    setButtonLabel("Saved");
    
  } catch (error) {
    // Log the error for debugging
    console.error(error);

    // Tell the user the save failed
    setButtonLabel("Not saved");
  } finally {
    // Always re-enable the save button, whether the save succeeded or failed
    saveButton.disabled = false;

    // Always re-enable the clear button
    clearButton.disabled = false;
  }
}

thevariableforwhereIactuallytype.addEventListener("input", thisExtendsTheTextBox);

saveButton.addEventListener("click", () => {
  if (!ready) return;
  persist(thevariableforwhereIactuallytype.value);
});

clearButton.addEventListener("click", () => {
  if (!ready) return;
  thevariableforwhereIactuallytype.value = "";
  thisExtendsTheTextBox();
  thevariableforwhereIactuallytype.focus();
  persist("");
});

document.addEventListener("keydown", (event) => {
  if (!ready) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    persist(thevariableforwhereIactuallytype.value);
  }
});

async function boot() {
  try {
    thevariableforwhereIactuallytype.value = await loadPage();
  } catch (error) {
    console.error(error);
    return;
  }
  ready = true;
  saveButton.disabled = false;
  clearButton.disabled = false;
  thisExtendsTheTextBox();
  thevariableforwhereIactuallytype.focus();
}

boot();
