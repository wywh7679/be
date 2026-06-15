const codeInput = document.getElementById("code");
const selectorInput = document.getElementById("selector");
const ensureJQueryInput = document.getElementById("ensure-jquery");
const domainFilterInput = document.getElementById("domain-filter");
const profileNameInput = document.getElementById("profile-name");
const profileSelect = document.getElementById("profile-select");
const tabSetNameInput = document.getElementById("tabset-name");
const tabSetSelect = document.getElementById("tabset-select");
const downloadFolderInput = document.getElementById("download-folder");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const clearFolderButton = document.getElementById("clear-folder");
const saveProfileButton = document.getElementById("save-profile");
const loadProfileButton = document.getElementById("load-profile");
const deleteProfileButton = document.getElementById("delete-profile");
const saveTabSetButton = document.getElementById("save-tabset");
const restoreTabSetButton = document.getElementById("restore-tabset");
const deleteTabSetButton = document.getElementById("delete-tabset");
const downloadOpenDocumentsButton = document.getElementById("download-open-documents");
const downloadSelectorDocumentsButton = document.getElementById("download-selector-documents");
const previewSelectorImagesButton = document.getElementById("preview-selector-images");
const clearSelectorButton = document.getElementById("clear-selector");
const statusOutput = document.getElementById("status");

const STORAGE_KEYS = {
  code: "allTabsDocumentRunner.code",
  selector: "allTabsDocumentRunner.selector",
  downloadFolder: "allTabsDocumentRunner.downloadFolder",
  ensureJQuery: "allTabsDocumentRunner.ensureJQuery",
  domainFilter: "allTabsDocumentRunner.domainFilter",
  profiles: "allTabsDocumentRunner.profiles",
  tabSets: "allTabsDocumentRunner.tabSets",
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

function isDataImageUrl(url) {
  return typeof url === "string" && /^data:image\//i.test(url);
}

function isDownloadableUrl(url) {
  return typeof url === "string" && (/^(https?|file|ftp):/i.test(url) || isDataImageUrl(url));
}

function hasExtension(url, extensions) {
  if (!isDownloadableUrl(url) || isDataImageUrl(url)) {
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
  return isDataImageUrl(url) || hasExtension(url, IMAGE_EXTENSIONS);
}

function uniqueUrls(urls) {
  return [...new Set(urls.filter(isDownloadableUrl))];
}

function normalizeDomainFilter(domain) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^\.+|\.+$/g, "");
}

function tabMatchesDomain(tab, domain) {
  if (!domain) {
    return true;
  }

  try {
    const { hostname } = new URL(tab.url || "");
    const normalizedHostname = hostname.toLowerCase();
    return normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`);
  } catch (_error) {
    return false;
  }
}

async function queryScopedTabs() {
  const domain = normalizeDomainFilter(domainFilterInput.value);
  domainFilterInput.value = domain;
  const tabs = await browser.tabs.query({});
  return tabs.filter((tab) => tabMatchesDomain(tab, domain));
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

function dataImageMimeType(url) {
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(url);
  return match ? match[1].toLowerCase() : "image/png";
}

function dataImageToBlobUrl(url) {
  const commaIndex = url.indexOf(",");

  if (commaIndex === -1) {
    throw new Error("Invalid data image URL");
  }

  const metadata = url.slice(0, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const mimeType = dataImageMimeType(url);
  const isBase64 = /;base64(?:;|$)/i.test(metadata);
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function extensionFromDataImageUrl(url) {
  const match = /^data:image\/([a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(url);

  if (!match) {
    return "png";
  }

  return match[1].toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
}

function filenameFromUrl(url, index) {
  if (isDataImageUrl(url)) {
    return `data-image-${index + 1}.${extensionFromDataImageUrl(url)}`;
  }

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

async function downloadUrl(url, index, folder = getDownloadFolder()) {
  const downloadSource = isDataImageUrl(url) ? dataImageToBlobUrl(url) : url;

  try {
    return await browser.downloads.download({
      conflictAction: "uniquify",
      filename: filenameForDownload(url, index, folder),
      saveAs: false,
      url: downloadSource
    });
  } finally {
    if (downloadSource !== url) {
      window.setTimeout(() => URL.revokeObjectURL(downloadSource), 30000);
    }
  }
}

function getDownloadFolder() {
  return sanitizeFolder(downloadFolderInput.value);
}

function setBusy(isBusy) {
  runButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  clearFolderButton.disabled = isBusy;
  saveProfileButton.disabled = isBusy;
  loadProfileButton.disabled = isBusy;
  deleteProfileButton.disabled = isBusy;
  saveTabSetButton.disabled = isBusy;
  restoreTabSetButton.disabled = isBusy;
  deleteTabSetButton.disabled = isBusy;
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
  domainFilterInput.value = savedValues[STORAGE_KEYS.domainFilter] || "";
  ensureJQueryInput.checked = savedValues[STORAGE_KEYS.ensureJQuery] !== false;
  renderProfiles(savedValues[STORAGE_KEYS.profiles] || {});
  renderTabSets(savedValues[STORAGE_KEYS.tabSets] || {});
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

async function saveDomainFilter() {
  const domain = normalizeDomainFilter(domainFilterInput.value);
  domainFilterInput.value = domain;
  await browser.storage.local.set({ [STORAGE_KEYS.domainFilter]: domain });
}

async function saveEnsureJQuery() {
  await browser.storage.local.set({ [STORAGE_KEYS.ensureJQuery]: ensureJQueryInput.checked });
}

function currentProfileValues() {
  return {
    code: codeInput.value,
    selector: selectorInput.value,
    downloadFolder: getDownloadFolder(),
    domainFilter: normalizeDomainFilter(domainFilterInput.value),
    ensureJQuery: ensureJQueryInput.checked
  };
}

function renderProfiles(profiles) {
  profileSelect.textContent = "";
  const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved profiles";
    profileSelect.append(option);
    return;
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    profileSelect.append(option);
  }
}

async function getProfiles() {
  const savedValues = await browser.storage.local.get(STORAGE_KEYS.profiles);
  return savedValues[STORAGE_KEYS.profiles] || {};
}

async function saveProfile() {
  const name = profileNameInput.value.trim() || profileSelect.value;

  if (!name) {
    setStatus("Enter a profile name before saving.");
    return;
  }

  await Promise.all([saveCode(), saveSelector(), saveDownloadFolder(), saveDomainFilter(), saveEnsureJQuery()]);
  const profiles = await getProfiles();
  profiles[name] = currentProfileValues();
  await browser.storage.local.set({ [STORAGE_KEYS.profiles]: profiles });
  renderProfiles(profiles);
  profileSelect.value = name;
  profileNameInput.value = name;
  setStatus(`Saved profile: ${name}`);
}

async function loadProfile() {
  const name = profileSelect.value;
  const profiles = await getProfiles();
  const profile = profiles[name];

  if (!profile) {
    setStatus("Select a saved profile to load.");
    return;
  }

  codeInput.value = profile.code || "";
  selectorInput.value = profile.selector || "";
  downloadFolderInput.value = profile.downloadFolder || "";
  domainFilterInput.value = profile.domainFilter || "";
  ensureJQueryInput.checked = profile.ensureJQuery !== false;
  profileNameInput.value = name;
  await Promise.all([saveCode(), saveSelector(), saveDownloadFolder(), saveDomainFilter(), saveEnsureJQuery()]);
  setStatus(`Loaded profile: ${name}`);
}

async function deleteProfile() {
  const name = profileSelect.value;
  const profiles = await getProfiles();

  if (!name || !profiles[name]) {
    setStatus("Select a saved profile to delete.");
    return;
  }

  delete profiles[name];
  await browser.storage.local.set({ [STORAGE_KEYS.profiles]: profiles });
  renderProfiles(profiles);
  profileNameInput.value = "";
  setStatus(`Deleted profile: ${name}`);
}

function renderTabSets(tabSets) {
  tabSetSelect.textContent = "";
  const names = Object.keys(tabSets).sort((a, b) => a.localeCompare(b));

  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved tab sets";
    tabSetSelect.append(option);
    return;
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    const windowCount = tabSets[name].windows?.length || 0;
    option.textContent = `${name} (${windowCount} window${windowCount === 1 ? "" : "s"})`;
    tabSetSelect.append(option);
  }
}

async function getTabSets() {
  const savedValues = await browser.storage.local.get(STORAGE_KEYS.tabSets);
  return savedValues[STORAGE_KEYS.tabSets] || {};
}

function serializableTab(tab) {
  return {
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    title: tab.title || "",
    url: tab.url || ""
  };
}

async function saveTabSet() {
  const name = tabSetNameInput.value.trim() || tabSetSelect.value;

  if (!name) {
    setStatus("Enter a tab set name before saving.");
    return;
  }

  const windows = await browser.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const tabSets = await getTabSets();
  tabSets[name] = {
    createdAt: Date.now(),
    windows: windows.map((windowInfo) => ({
      focused: Boolean(windowInfo.focused),
      tabs: (windowInfo.tabs || []).map(serializableTab).filter((tab) => tab.url)
    })).filter((windowInfo) => windowInfo.tabs.length)
  };

  await browser.storage.local.set({ [STORAGE_KEYS.tabSets]: tabSets });
  renderTabSets(tabSets);
  tabSetSelect.value = name;
  tabSetNameInput.value = name;
  setStatus(`Saved tab set: ${name}`);
}

async function restoreTabSet() {
  const name = tabSetSelect.value;
  const tabSets = await getTabSets();
  const tabSet = tabSets[name];

  if (!tabSet) {
    setStatus("Select a saved tab set to restore.");
    return;
  }

  let restoredTabs = 0;

  for (const windowInfo of tabSet.windows || []) {
    const urls = (windowInfo.tabs || []).map((tab) => tab.url).filter(Boolean);

    if (!urls.length) {
      continue;
    }

    const createdWindow = await browser.windows.create({ url: urls });
    restoredTabs += urls.length;
    const createdTabs = createdWindow.tabs || [];

    for (const [index, savedTab] of (windowInfo.tabs || []).entries()) {
      const createdTab = createdTabs[index];

      if (createdTab?.id && savedTab.pinned) {
        await browser.tabs.update(createdTab.id, { pinned: true });
      }
    }
  }

  setStatus(`Restored tab set: ${name} (${restoredTabs} tabs).`);
}

async function deleteTabSet() {
  const name = tabSetSelect.value;
  const tabSets = await getTabSets();

  if (!name || !tabSets[name]) {
    setStatus("Select a saved tab set to delete.");
    return;
  }

  delete tabSets[name];
  await browser.storage.local.set({ [STORAGE_KEYS.tabSets]: tabSets });
  renderTabSets(tabSets);
  tabSetNameInput.value = "";
  setStatus(`Deleted tab set: ${name}`);
}

async function ensureJQuery(tabId) {
  const [hasJQuery] = await browser.tabs.executeScript(tabId, {
    code: "typeof window.jQuery === \"function\" && typeof window.$ === \"function\""
  });

  if (!hasJQuery) {
    await browser.tabs.executeScript(tabId, { file: "vendor/jquery.min.js" });
  }
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
    await Promise.all([saveCode(), saveEnsureJQuery(), saveDomainFilter()]);
    const tabs = await queryScopedTabs();
    let succeeded = 0;
    const failures = [];

    for (const tab of tabs) {
      if (typeof tab.id !== "number") {
        continue;
      }

      try {
        if (ensureJQueryInput.checked) {
          await ensureJQuery(tab.id);
        }

        await browser.tabs.executeScript(tab.id, { code });
        succeeded += 1;
      } catch (error) {
        failures.push(`${describeTab(tab)}: ${error.message}`);
      }
    }

    const domain = normalizeDomainFilter(domainFilterInput.value);
    const domainMessage = domain ? ` matching ${domain}` : "";
    const summary = `Finished. Ran in ${succeeded} of ${tabs.length} tabs${domainMessage}.`;
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
    await saveDomainFilter();
    const tabs = await queryScopedTabs();
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
  await saveDomainFilter();
  const tabs = await queryScopedTabs();
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
saveProfileButton.addEventListener("click", saveProfile);
loadProfileButton.addEventListener("click", loadProfile);
deleteProfileButton.addEventListener("click", deleteProfile);
saveTabSetButton.addEventListener("click", saveTabSet);
restoreTabSetButton.addEventListener("click", restoreTabSet);
deleteTabSetButton.addEventListener("click", deleteTabSet);
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
profileSelect.addEventListener("change", () => {
  profileNameInput.value = profileSelect.value;
});
tabSetSelect.addEventListener("change", () => {
  tabSetNameInput.value = tabSetSelect.value;
});
downloadFolderInput.addEventListener("change", saveDownloadFolder);
domainFilterInput.addEventListener("change", saveDomainFilter);
ensureJQueryInput.addEventListener("change", saveEnsureJQuery);

restoreSavedValues().catch((error) => setStatus(`Failed to restore saved values: ${error.message}`));
