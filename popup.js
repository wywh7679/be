const codeInput = document.getElementById("code");
const selectorInput = document.getElementById("selector");
const downloadFolderInput = document.getElementById("download-folder");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const clearFolderButton = document.getElementById("clear-folder");
const downloadOpenDocumentsButton = document.getElementById("download-open-documents");
const downloadSelectorDocumentsButton = document.getElementById("download-selector-documents");
const previewSelectorImagesButton = document.getElementById("preview-selector-images");
const clearSelectorButton = document.getElementById("clear-selector");
const statusOutput = document.getElementById("status");

const STORAGE_KEYS = {
  code: "allTabsDocumentRunner.code",
  selector: "allTabsDocumentRunner.selector",
  downloadFolder: "allTabsDocumentRunner.downloadFolder",
  previewImages: "allTabsDocumentRunner.previewImages"
};

const DOCUMENT_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".tif", ".tiff"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".tif", ".tiff"];

function setStatus(message) {
  statusOutput.textContent = message;
}

function describeTab(tab) {
  return tab.title || tab.url || `Tab ${tab.id}`;
}

function isDownloadableUrl(url) {
  return typeof url === "string" && /^(https?|file|ftp):/i.test(url);
}

function hasExtension(url, extensions) {
  if (!isDownloadableUrl(url)) {
    return false;
  }

  try {
    const { pathname } = new URL(url);
    const normalizedPath = pathname.toLowerCase();
    return extensions.some((extension) => normalizedPath.endsWith(extension));
  } catch (_error) {
    return false;
  }
}

function isDocumentUrl(url) {
  return hasExtension(url, DOCUMENT_EXTENSIONS);
}

function isImageUrl(url) {
  return hasExtension(url, IMAGE_EXTENSIONS);
}

function uniqueUrls(urls) {
  return [...new Set(urls.filter(isDownloadableUrl))];
}

function sanitizeFolder(folder) {
  return folder
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001F]/g, "").trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function filenameFromUrl(url, index) {
  try {
    const { pathname } = new URL(url);
    const rawName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    const cleanName = rawName.replace(/[<>:"|?*\u0000-\u001F]/g, "_").trim();
    return cleanName || `download-${index + 1}`;
  } catch (_error) {
    return `download-${index + 1}`;
  }
}

function filenameForDownload(url, index, folder = getDownloadFolder()) {
  const filename = filenameFromUrl(url, index);
  return folder ? `${folder}/${filename}` : filename;
}

function downloadUrl(url, index, folder = getDownloadFolder()) {
  return browser.downloads.download({
    conflictAction: "uniquify",
    filename: filenameForDownload(url, index, folder),
    saveAs: false,
    url
  });
}

function getDownloadFolder() {
  return sanitizeFolder(downloadFolderInput.value);
}

function setBusy(isBusy) {
  runButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  clearFolderButton.disabled = isBusy;
  downloadOpenDocumentsButton.disabled = isBusy;
  downloadSelectorDocumentsButton.disabled = isBusy;
  previewSelectorImagesButton.disabled = isBusy;
  clearSelectorButton.disabled = isBusy;
}

async function restoreSavedValues() {
  const savedValues = await browser.storage.local.get(Object.values(STORAGE_KEYS));
  codeInput.value = savedValues[STORAGE_KEYS.code] || "";
  selectorInput.value = savedValues[STORAGE_KEYS.selector] || "";
  downloadFolderInput.value = savedValues[STORAGE_KEYS.downloadFolder] || "";
}

async function saveCode() {
  await browser.storage.local.set({ [STORAGE_KEYS.code]: codeInput.value });
}

async function saveSelector() {
  await browser.storage.local.set({ [STORAGE_KEYS.selector]: selectorInput.value });
}

async function saveDownloadFolder() {
  const sanitizedFolder = getDownloadFolder();
  downloadFolderInput.value = sanitizedFolder;
  await browser.storage.local.set({ [STORAGE_KEYS.downloadFolder]: sanitizedFolder });
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

async function downloadUrls(urls, folder = getDownloadFolder()) {
  let downloaded = 0;
  const failures = [];

  for (const [index, url] of uniqueUrls(urls).entries()) {
    try {
      await downloadUrl(url, index, folder);
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
    await saveDownloadFolder();
    const tabs = await browser.tabs.query({});
    const documentUrls = tabs.map((tab) => tab.url).filter(isDocumentUrl);
    const { downloaded, failures } = await downloadUrls(documentUrls);
    const folder = getDownloadFolder();
    const folderMessage = folder ? ` to ${folder}/` : "";
    const summary = `Queued ${downloaded} open image/PDF document download${downloaded === 1 ? "" : "s"}${folderMessage}.`;
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
      const [tabUrls = []] = await browser.tabs.executeScript(tab.id, { code });
      urls.push(...tabUrls);
    } catch (error) {
      failures.push(`${describeTab(tab)}: ${error.message}`);
    }
  }

  return { urls, failures };
}

async function getSelectorUrls() {
  const selector = selectorInput.value.trim();

  if (!selector) {
    setStatus("Enter a CSS selector before saving or previewing selector matches.");
    return null;
  }

  await saveSelector();
  const tabs = await browser.tabs.query({});
  return collectUrlsFromSelector(tabs, selector);
}

async function saveSelectorDocuments() {
  setBusy(true);
  setStatus("Finding documents that match the selector...");

  try {
    await saveDownloadFolder();
    const result = await getSelectorUrls();

    if (!result) {
      return;
    }

    const { urls, failures: collectionFailures } = result;
    const { downloaded, failures: downloadFailures } = await downloadUrls(urls);
    const failures = [...collectionFailures, ...downloadFailures];
    const folder = getDownloadFolder();
    const folderMessage = folder ? ` to ${folder}/` : "";
    const summary = `Queued ${downloaded} selector-based document download${downloaded === 1 ? "" : "s"}${folderMessage}.`;
    setStatus(failures.length ? `${summary}\n\nSkipped/failed:\n${failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to save selector matches: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function previewSelectorImages() {
  setBusy(true);
  setStatus("Collecting selector images for preview...");

  try {
    await saveDownloadFolder();
    const result = await getSelectorUrls();

    if (!result) {
      return;
    }

    const imageUrls = uniqueUrls(result.urls).filter((url) => isImageUrl(url) || !isDocumentUrl(url));

    if (!imageUrls.length) {
      setStatus("No image URLs were found for that selector.");
      return;
    }

    await browser.storage.local.set({
      [STORAGE_KEYS.previewImages]: {
        createdAt: Date.now(),
        downloadFolder: getDownloadFolder(),
        images: imageUrls
      }
    });
    await browser.tabs.create({ url: browser.runtime.getURL("preview.html") });

    const summary = `Opened preview tab with ${imageUrls.length} image${imageUrls.length === 1 ? "" : "s"}.`;
    setStatus(result.failures.length ? `${summary}\n\nSkipped/failed:\n${result.failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to preview selector images: ${error.message}`);
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
clearFolderButton.addEventListener("click", async () => {
  downloadFolderInput.value = "";
  await saveDownloadFolder();
  setStatus("Cleared download subfolder.");
});
downloadOpenDocumentsButton.addEventListener("click", saveOpenDocuments);
downloadSelectorDocumentsButton.addEventListener("click", saveSelectorDocuments);
previewSelectorImagesButton.addEventListener("click", previewSelectorImages);
clearSelectorButton.addEventListener("click", async () => {
  selectorInput.value = "";
  await saveSelector();
  setStatus("Cleared saved selector.");
});
codeInput.addEventListener("input", saveCode);
selectorInput.addEventListener("input", saveSelector);
downloadFolderInput.addEventListener("change", saveDownloadFolder);

restoreSavedValues().catch((error) => setStatus(`Failed to restore saved values: ${error.message}`));
