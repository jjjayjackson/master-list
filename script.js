const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
);
/* All the above is hooking up my backend to Supabase. */

const thevariableforwhereIactuallytype = document.getElementById("whereIactuallytype");
// const saveButton = document.getElementById("save");

let returnToSaveTimer = null;

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

/*
function setButtonLabel(text) {
  clearTimeout(returnToSaveTimer);
  saveButton.textContent = text;
  returnToSaveTimer = setTimeout(() => {
    saveButton.textContent = "Save";
  }, 700);
}
  */

async function save(content) {
  // Disable the save button so the user can't click it again while saving
  // saveButton.disabled = true;

  try {
    // Ask Supabase to save the content
    const { error } = await supabase.from("master_list_page").upsert({
      id: 1,
      content,
    });

    // If Supabase returned an error, throw it so we go to the catch block
    if (error) throw error;

    // If we got here, the save succeeded
   // setButtonLabel("Saved");

  } catch (error) {
    // Log the error for debugging
    console.error(error);

    // Tell the user the save failed
   // setButtonLabel("Not saved");
  } finally {
    // Always re-enable the save button, whether the save succeeded or failed
   // saveButton.disabled = false;
  }
}

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

    // Save the content to Supabase
    save(content);

  }

});

thevariableforwhereIactuallytype.addEventListener("input", thisExtendsTheTextBox);
// Extends the textbox upon text entry. 

thevariableforwhereIactuallytype.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();

    const textarea = event.currentTarget;
    textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");

    const inputEvent = new Event("input");
    textarea.dispatchEvent(inputEvent);
  }
});

// Functions responsible for saving content. 
/* saveButton.addEventListener("click", () => {
  save(thevariableforwhereIactuallytype.value);
}); */
// This one actually saves shit when you click save. 

document.addEventListener("visibilitychange", () => {
  // for when I close it or something
  if (document.visibilityState === "hidden") {
    save(thevariableforwhereIactuallytype.value);
  }
});

function debouncing() {
  let saveTimer = null;

  thevariableforwhereIactuallytype.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save(thevariableforwhereIactuallytype.value);
    }, 300);
  });
}

// Call it once, when the element exists
debouncing();

async function boot() {
  // initializes everything not strictly necessary, but I don't feel like removing it lol 
  try {
    thevariableforwhereIactuallytype.value = await loadPage();
  } catch (error) {
    console.error(error);
    return;
  }
  // saveButton.disabled = false;
  thisExtendsTheTextBox();
  thevariableforwhereIactuallytype.focus();
}

boot();
