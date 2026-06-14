const codeInput = document.getElementById("code");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const statusOutput = document.getElementById("status");

const STORAGE_KEY = "allTabsJsRunner.code";

function setStatus(message) {
  statusOutput.textContent = message;
}

function describeTab(tab) {
  return tab.title || tab.url || `Tab ${tab.id}`;
}

async function restoreCode() {
  const savedCode = await browser.storage.local.get(STORAGE_KEY);
  codeInput.value = savedCode[STORAGE_KEY] || "";
}

async function saveCode() {
  await browser.storage.local.set({ [STORAGE_KEY]: codeInput.value });
}

async function runInAllTabs() {
  const code = codeInput.value.trim();

  if (!code) {
    setStatus("Enter JavaScript before running.");
    return;
  }

  runButton.disabled = true;
  setStatus("Finding tabs...");

  try {
    await saveCode();
    const tabs = await browser.tabs.query({});
    let succeeded = 0;
    const failures = [];

    for (const tab of tabs) {
      if (typeof tab.id !== "number") {
        continue;
      }

      try {
        await browser.tabs.executeScript(tab.id, { code });
        succeeded += 1;
      } catch (error) {
        failures.push(`${describeTab(tab)}: ${error.message}`);
      }
    }

    const summary = `Finished. Ran in ${succeeded} of ${tabs.length} tabs.`;
    setStatus(failures.length ? `${summary}\n\nSkipped/failed:\n${failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", runInAllTabs);
clearButton.addEventListener("click", async () => {
  codeInput.value = "";
  await saveCode();
  setStatus("Cleared saved code.");
});
codeInput.addEventListener("input", saveCode);

restoreCode().catch((error) => setStatus(`Failed to restore saved code: ${error.message}`));
