const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
);
/* All the above is hooking up my backend to Supabase. */

const thevariableforwhereIactuallytype = document.getElementById("whereIactuallytype");

function thisExtendsTheTextBox() {

  const textarea = thevariableforwhereIactuallytype;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  thevariableforwhereIactuallytype.style.height = "auto";
  thevariableforwhereIactuallytype.style.height = `${thevariableforwhereIactuallytype.scrollHeight}px`;

  textarea.setSelectionRange(start, end);
  window.scrollTo(scrollX, scrollY);
}

const LOCAL_STORAGE_KEY = "master-list-content";

function loadFromLocalStorage() {
  return localStorage.getItem(LOCAL_STORAGE_KEY) ?? "";
}

function saveToLocalStorage(content) {
  localStorage.setItem(LOCAL_STORAGE_KEY, content);
}

async function uploadToSupabase(content) {
  const { error } = await supabase
    .from("master_list_page")
    .upsert({
      id: 1,
      content,
    });

  if (error) throw error;
}

async function save(content) {
  try {
    saveToLocalStorage(content);
    await uploadToSupabase(content);
  } catch (error) {
    console.error(error);
  }
}
// This here actually saves the content

/* All of these below regard actual user input: input and extending  the text box, clicking to save */

document.addEventListener("keydown", (event) => {

  // Check whether Command or Control is being held down
  const modifierKeyIsPressed = event.metaKey || event.ctrlKey;

  // Check whether the S key was pressed
  const sKeyWasPressed = event.key.toLowerCase() === "s";

  // Check whether both conditions are true
  if (modifierKeyIsPressed && sKeyWasPressed) {

    // Prevent the browser's default Save behavior
    event.preventDefault();

    // Get the current text inside the textarea
    const content = thevariableforwhereIactuallytype.value;

    save(content);

  }

});
// This here is for command + S saving the data. 

thevariableforwhereIactuallytype.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();

    const textarea = event.currentTarget;
    textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");

    const inputEvent = new Event("input");
    textarea.dispatchEvent(inputEvent);
  }
});
// This here is responsible for tabbing.

thevariableforwhereIactuallytype.addEventListener("input", thisExtendsTheTextBox);
// Extends the textbox upon text entry. 

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    save(thevariableforwhereIactuallytype.value);
  }
});
// for when I close it or something

function debouncing() {
  let saveTimer = null;

  thevariableforwhereIactuallytype.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save(thevariableforwhereIactuallytype.value);
    }, 300);
  });
}
// Wait 300 milliseconds until input has stopped to save.

// Call it once, when the element exists
debouncing();

function boot() {
  try {
    thevariableforwhereIactuallytype.value = loadFromLocalStorage();
  } catch (error) {
    console.error(error);
    return;
  }

  thisExtendsTheTextBox();
  thevariableforwhereIactuallytype.focus();
}

boot();
