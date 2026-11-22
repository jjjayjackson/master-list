// Top-level declarations

const supabase = window.supabase.createClient(
  window.MASTER_LIST_SUPABASE.url,
  window.MASTER_LIST_SUPABASE.key,
);

const LOCAL_STORAGE_KEY = "master-list-content";

const thevariableforwhereIactuallytype = document.getElementById("whereIactuallytype");

// Functions 
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

// Event Listeners & Handlers
// This one is responsible for the persistent indentation. 
thevariableforwhereIactuallytype.addEventListener("keydown", (event) => {

  if (event.key === "Enter") {

    const textarea = event.currentTarget;

    const cursorPosition = textarea.selectionStart;

    const textBeforeCursor = textarea.value.slice(0, cursorPosition);

    const currentLine = textBeforeCursor.split("\n").pop();

    const indentation = currentLine.match(/^ */)[0];

    event.preventDefault();

    textarea.setRangeText(
      "\n" + indentation,
      cursorPosition,
      textarea.selectionEnd,
      "end"
    );

		const inputEvent = new Event("input");

		textarea.dispatchEvent(inputEvent);

  }

});

// This here is responsible for tabbing.
thevariableforwhereIactuallytype.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();

    const textarea = event.currentTarget;
    textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");

    const inputEvent = new Event("input");
    textarea.dispatchEvent(inputEvent);
  }
});

thevariableforwhereIactuallytype.addEventListener("input", thisExtendsTheTextBox);

function debouncing() {
  let saveTimer = null;

  thevariableforwhereIactuallytype.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      save(thevariableforwhereIactuallytype.value);
    }, 200);
  });
}

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
