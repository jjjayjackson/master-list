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
  const savedContent =
      localStorage.getItem(LOCAL_STORAGE_KEY);

  if (savedContent === null) {
      return null;
  }
  return JSON.parse(savedContent);
}

function saveToLocalStorage(content, updatedAt) {

  const dataToSave = {
      content: content,
      updatedAt: updatedAt
  };

  localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(dataToSave)
  );

}

async function uploadToSupabase(content, updatedAt) {
  const { error } = await supabase
    .from("master_list_page")
    .upsert({
      id: 1,
      content,
      updated_at: updatedAt
    });

  if (error) throw error;
}


async function loadFromSupabase() {

  const { data, error } = await supabase
      .from("master_list_page")
      .select("id, content, updated_at")
      .eq("id", 1)
      .maybeSingle();

  if (error) throw error;

  return data;

}

// This here would be the synchronization function. 
async function synchronizeWithSupabase() {

  const localCopy = loadFromLocalStorage();

  const cloudCopy = await loadFromSupabase();


  if (localCopy === null && cloudCopy === null) {
      return "";
  }
// If both are null, stop and don't do anything. 

  if (localCopy !== null && cloudCopy === null) {

      await uploadToSupabase(
          localCopy.content,
          localCopy.updatedAt
      );

      return localCopy.content;

  }
// If local is good but cloud sucks, upload the local then give back the local. 

  if (localCopy === null && cloudCopy !== null) {

      saveToLocalStorage(
          cloudCopy.content,
          cloudCopy.updated_at
      );

      return cloudCopy.content;

  }

/* if local is bad, but cloud is good, save the cloud to the localStorage then give back the cloud copy. 

This would be the inverse of the first one. 
*/

  const localTimestamp =
      new Date(localCopy.updatedAt).getTime();

  const cloudTimestamp =
      new Date(cloudCopy.updated_at).getTime();


  if (cloudTimestamp > localTimestamp) {

      saveToLocalStorage(
          cloudCopy.content,
          cloudCopy.updated_at
      );

      return cloudCopy.content;
  }
  
  // If the cloud copy is newer than the local, save the cloud to the localStorage and return it as well. 


  if (localTimestamp > cloudTimestamp) {

      await uploadToSupabase(
          localCopy.content,
          localCopy.updatedAt
      );

      return localCopy.content;

  }
// If the other way, then upload the local to the cloud

  return localCopy.content;

}

async function save(content) {
  const updatedAt = new Date().toISOString();
  saveToLocalStorage(content, updatedAt);

  try {
      await uploadToSupabase(content, updatedAt);

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

async function boot() {

  try {

      const content = await synchronizeWithSupabase();

      thevariableforwhereIactuallytype.value = content;

  } catch (error) {

      console.error(error);

      const localCopy = loadFromLocalStorage();

      if (localCopy !== null) {

        thevariableforwhereIactuallytype.value =
            localCopy.content;
    
      } else {
    
        thevariableforwhereIactuallytype.value = "";
    
    }
  }

  thisExtendsTheTextBox();

  thevariableforwhereIactuallytype.focus();

}

boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
