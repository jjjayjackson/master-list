const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
);
/* All the above is hooking up my backend to Supabase. */

const thevariableforwhereIactuallytype = document.getElementById("whereIactuallytype");
const saveButton = document.getElementById("save");

let ready = false;
let returnToSaveTimer = null;

function thisExtendsTheTextBox() {
  thevariableforwhereIactuallytype.style.height = "auto";
  thevariableforwhereIactuallytype.style.height = `${thevariableforwhereIactuallytype.scrollHeight}px`;
}

async function loadPage() {
  const { data, error } = await supabase
    .from("master_list_page")
    .select("content")
    .eq("id", 1)
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

function setButtonLabel(text) {
  clearTimeout(returnToSaveTimer);
  saveButton.textContent = text;
  returnToSaveTimer = setTimeout(() => {
    saveButton.textContent = "Save";
  }, 700);
}

async function persist(content) {
  // Disable the save button so the user can't click it again while saving
  saveButton.disabled = true;

  try {
    // Ask Supabase to save the content
    const { error } = await supabase.from("master_list_page").upsert({
      id: 1,
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
  }
}

thevariableforwhereIactuallytype.addEventListener("input", thisExtendsTheTextBox);

saveButton.addEventListener("click", () => {
  // calls on persist, which actually saves the content inside
  if (!ready) return;
  persist(thevariableforwhereIactuallytype.value);
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
  thisExtendsTheTextBox();
  thevariableforwhereIactuallytype.focus();
}

boot();
