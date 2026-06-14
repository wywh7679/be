const codeInput = document.getElementById("code");
const selectorInput = document.getElementById("selector");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const downloadOpenDocumentsButton = document.getElementById("download-open-documents");
const downloadSelectorDocumentsButton = document.getElementById("download-selector-documents");
const clearSelectorButton = document.getElementById("clear-selector");
const statusOutput = document.getElementById("status");

const STORAGE_KEYS = {
  code: "allTabsDocumentRunner.code",
  selector: "allTabsDocumentRunner.selector"
};

const DOCUMENT_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".tif", ".tiff"];

function setStatus(message) {
  statusOutput.textContent = message;
}

function describeTab(tab) {
  return tab.title || tab.url || `Tab ${tab.id}`;
}

function isDownloadableUrl(url) {
  return typeof url === "string" && /^(https?|file|ftp):/i.test(url);
}

function isDocumentUrl(url) {
  if (!isDownloadableUrl(url)) {
    return false;
  }

  try {
    const { pathname } = new URL(url);
    const normalizedPath = pathname.toLowerCase();
    return DOCUMENT_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
  } catch (_error) {
    return false;
  }
}

function uniqueUrls(urls) {
  return [...new Set(urls.filter(isDownloadableUrl))];
}

function downloadUrl(url) {
  return browser.downloads.download({
    conflictAction: "uniquify",
    saveAs: false,
    url
  });
}

function setBusy(isBusy) {
  runButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  downloadOpenDocumentsButton.disabled = isBusy;
  downloadSelectorDocumentsButton.disabled = isBusy;
  clearSelectorButton.disabled = isBusy;
}

async function restoreSavedValues() {
  const savedValues = await browser.storage.local.get(Object.values(STORAGE_KEYS));
  codeInput.value = savedValues[STORAGE_KEYS.code] || "";
  selectorInput.value = savedValues[STORAGE_KEYS.selector] || "";
}

async function saveCode() {
  await browser.storage.local.set({ [STORAGE_KEYS.code]: codeInput.value });
}

async function saveSelector() {
  await browser.storage.local.set({ [STORAGE_KEYS.selector]: selectorInput.value });
}

async function runInAllTabs() {
  const code = codeInput.value.trim();

  if (!code) {
    setStatus("Enter JavaScript before running.");
    return;
  }

  setBusy(true);
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
    setBusy(false);
  }
}

async function downloadUrls(urls) {
  let downloaded = 0;
  const failures = [];

  for (const url of uniqueUrls(urls)) {
    try {
      await downloadUrl(url);
      downloaded += 1;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }

  return { downloaded, failures };
}

async function saveOpenDocuments() {
  setBusy(true);
  setStatus("Finding open image/PDF document tabs...");

  try {
    const tabs = await browser.tabs.query({});
    const documentUrls = tabs.map((tab) => tab.url).filter(isDocumentUrl);
    const { downloaded, failures } = await downloadUrls(documentUrls);
    const summary = `Queued ${downloaded} open image/PDF document download${downloaded === 1 ? "" : "s"}.`;
    setStatus(failures.length ? `${summary}\n\nFailed downloads:\n${failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to save open documents: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function buildSelectorCollector(selector) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const attributes = ["href", "src", "currentSrc", "data", "poster"];
    const urls = [];

    for (const element of document.querySelectorAll(selector)) {
      if (element.currentSrc) {
        urls.push(element.currentSrc);
      }

      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (value) {
          urls.push(new URL(value, document.baseURI).href);
        }
      }
    }

    return [...new Set(urls)];
  })();`;
}

async function collectUrlsFromSelector(tabs, selector) {
  const urls = [];
  const failures = [];
  const code = buildSelectorCollector(selector);

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    try {
      const [tabUrls] = await browser.tabs.executeScript(tab.id, { code });
      urls.push(...tabUrls);
    } catch (error) {
      failures.push(`${describeTab(tab)}: ${error.message}`);
    }
  }

  return { urls, failures };
}

async function saveSelectorDocuments() {
  const selector = selectorInput.value.trim();

  if (!selector) {
    setStatus("Enter a CSS selector before saving selector matches.");
    return;
  }

  setBusy(true);
  setStatus("Finding documents that match the selector...");

  try {
    await saveSelector();
    const tabs = await browser.tabs.query({});
    const { urls, failures: collectionFailures } = await collectUrlsFromSelector(tabs, selector);
    const { downloaded, failures: downloadFailures } = await downloadUrls(urls);
    const failures = [...collectionFailures, ...downloadFailures];
    const summary = `Queued ${downloaded} selector-based document download${downloaded === 1 ? "" : "s"}.`;
    setStatus(failures.length ? `${summary}\n\nSkipped/failed:\n${failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to save selector matches: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

runButton.addEventListener("click", runInAllTabs);
clearButton.addEventListener("click", async () => {
  codeInput.value = "";
  await saveCode();
  setStatus("Cleared saved code.");
});
downloadOpenDocumentsButton.addEventListener("click", saveOpenDocuments);
downloadSelectorDocumentsButton.addEventListener("click", saveSelectorDocuments);
clearSelectorButton.addEventListener("click", async () => {
  selectorInput.value = "";
  await saveSelector();
  setStatus("Cleared saved selector.");
});
codeInput.addEventListener("input", saveCode);
selectorInput.addEventListener("input", saveSelector);

restoreSavedValues().catch((error) => setStatus(`Failed to restore saved values: ${error.message}`));
