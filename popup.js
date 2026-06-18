const codeInput = document.getElementById("code");
const selectorInput = document.getElementById("selector");
const metadataSelectorInput = document.getElementById("metadata-selector");
const customCssInput = document.getElementById("custom-css");
const writeMetadataExifInput = document.getElementById("write-metadata-exif");
const downloadMetadataTextInput = document.getElementById("download-metadata-text");
const ensureJQueryInput = document.getElementById("ensure-jquery");
const domainFilterInput = document.getElementById("domain-filter");
const profileNameInput = document.getElementById("profile-name");
const profileSelect = document.getElementById("profile-select");
const tabSetNameInput = document.getElementById("tabset-name");
const tabSetSelect = document.getElementById("tabset-select");
const downloadFolderInput = document.getElementById("download-folder");
const runButton = document.getElementById("run");
const clearButton = document.getElementById("clear");
const injectCssButton = document.getElementById("inject-css");
const clearCssButton = document.getElementById("clear-css");
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
const tabButtons = [...document.querySelectorAll(".tab")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];
const minimizeWindowsButton = document.getElementById("minimize-windows");
const restoreMinimizedWindowsButton = document.getElementById("restore-minimized-windows");
const closeOtherWindowsTabsButton = document.getElementById("close-other-windows-tabs");
const refreshDesktopHelperButton = document.getElementById("refresh-desktop-helper");
const desktopHelperStatus = document.getElementById("desktop-helper-status");
const desktopButtons = document.getElementById("desktop-buttons");

const STORAGE_KEYS = {
  code: "allTabsDocumentRunner.code",
  selector: "allTabsDocumentRunner.selector",
  metadataSelector: "allTabsDocumentRunner.metadataSelector",
  customCss: "allTabsDocumentRunner.customCss",
  writeMetadataExif: "allTabsDocumentRunner.writeMetadataExif",
  downloadMetadataText: "allTabsDocumentRunner.downloadMetadataText",
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

function isJpegUrl(url) {
  if (isDataImageUrl(url)) {
    return /^data:image\/jpe?g[;,]/i.test(url);
  }

  try {
    return /\.jpe?g$/i.test(new URL(url).pathname);
  } catch (_error) {
    return false;
  }
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error || new Error("Failed to read image blob.")));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url) {
  if (isDataImageUrl(url)) {
    return url;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch image for EXIF metadata: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function dataUrlToBlobUrl(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function imageUrlWithExifMetadata(url, metadata) {
  const text = metadataToText(metadata);

  if (!writeMetadataExifInput.checked || !text || !isJpegUrl(url) || typeof piexif === "undefined") {
    return url;
  }

  try {
    const dataUrl = await urlToDataUrl(url);
    const exifObject = piexif.load(dataUrl);
    exifObject["0th"] = exifObject["0th"] || {};
    exifObject.Exif = exifObject.Exif || {};
    exifObject["0th"][piexif.ImageIFD.ImageDescription] = text;
    exifObject["0th"][piexif.ImageIFD.Software] = "All Tabs Document Runner";
    const exifBytes = piexif.dump(exifObject);
    return dataUrlToBlobUrl(piexif.insert(exifBytes, dataUrl));
  } catch (error) {
    console.warn("Could not write EXIF metadata; downloading original image instead.", error);
    return url;
  }
}

function textFilenameForDownload(url, index, folder = getDownloadFolder()) {
  const filename = filenameFromUrl(url, index);
  const dotIndex = filename.lastIndexOf(".");
  const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const textFilename = `${baseName}.txt`;
  return folder ? `${folder}/${textFilename}` : textFilename;
}

function metadataToText(metadata) {
  return String(metadata || "").replace(/\r?\n/g, "\n").trim();
}

async function downloadMetadataFile(url, index, metadata, folder = getDownloadFolder()) {
  const text = metadataToText(metadata);

  if (!downloadMetadataTextInput.checked || !text) {
    return null;
  }

  const blobUrl = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" }));

  try {
    return await browser.downloads.download({
      conflictAction: "uniquify",
      filename: textFilenameForDownload(url, index, folder),
      saveAs: false,
      url: blobUrl
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

async function downloadUrl(url, index, folder = getDownloadFolder(), metadata = "") {
  let downloadSource = isDataImageUrl(url) ? dataImageToBlobUrl(url) : url;

  try {
    const exifSource = await imageUrlWithExifMetadata(url, metadata);

    if (exifSource !== url) {
      if (downloadSource !== url) {
        URL.revokeObjectURL(downloadSource);
      }
      downloadSource = exifSource;
    }

    const downloadId = await browser.downloads.download({
      conflictAction: "uniquify",
      filename: filenameForDownload(url, index, folder),
      saveAs: false,
      url: downloadSource
    });
    await downloadMetadataFile(url, index, metadata, folder);
    return downloadId;
  } finally {
    if (downloadSource !== url && downloadSource.startsWith("blob:")) {
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
  injectCssButton.disabled = isBusy;
  clearCssButton.disabled = isBusy;
  writeMetadataExifInput.disabled = isBusy;
  downloadMetadataTextInput.disabled = isBusy;
  clearFolderButton.disabled = isBusy;
  saveProfileButton.disabled = isBusy;
  loadProfileButton.disabled = isBusy;
  deleteProfileButton.disabled = isBusy;
  saveTabSetButton.disabled = isBusy;
  restoreTabSetButton.disabled = isBusy;
  deleteTabSetButton.disabled = isBusy;
  minimizeWindowsButton.disabled = isBusy;
  restoreMinimizedWindowsButton.disabled = isBusy;
  closeOtherWindowsTabsButton.disabled = isBusy;
  refreshDesktopHelperButton.disabled = isBusy;
  downloadOpenDocumentsButton.disabled = isBusy;
  downloadSelectorDocumentsButton.disabled = isBusy;
  previewSelectorImagesButton.disabled = isBusy;
  clearSelectorButton.disabled = isBusy;
}

function activateTab(tabButton) {
  for (const button of tabButtons) {
    const isActive = button === tabButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of tabPanels) {
    const isActive = panel.id === tabButton.getAttribute("aria-controls");
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  }
}

async function minimizeOtherWindows() {
  try {
    const currentWindow = await browser.windows.getCurrent();
    const windows = await browser.windows.getAll({ windowTypes: ["normal"] });
    let minimized = 0;

    for (const windowInfo of windows) {
      if (windowInfo.id !== currentWindow.id && windowInfo.state !== "minimized") {
        await browser.windows.update(windowInfo.id, { state: "minimized" });
        minimized += 1;
      }
    }

    setStatus(`Minimized ${minimized} other browser window${minimized === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus(`Failed to minimize windows: ${error.message}`);
  }
}

async function restoreMinimizedWindows() {
  try {
    const windows = await browser.windows.getAll({ windowTypes: ["normal"] });
    let restored = 0;

    for (const windowInfo of windows) {
      if (windowInfo.state === "minimized") {
        await browser.windows.update(windowInfo.id, { state: "normal" });
        restored += 1;
      }
    }

    setStatus(`Restored ${restored} minimized browser window${restored === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus(`Failed to restore minimized windows: ${error.message}`);
  }
}


async function closeOtherWindowsAndTabs() {
  if (!confirm("Close every other normal Firefox window and every other tab in this window?")) {
    return;
  }

  setBusy(true);

  try {
    const currentWindow = await browser.windows.getCurrent({ populate: true });
    const currentTabs = currentWindow.tabs || [];
    const activeTab = currentTabs.find((tab) => tab.active) || currentTabs[0];
    const tabsToClose = currentTabs
      .filter((tab) => tab.id !== activeTab?.id && typeof tab.id === "number")
      .map((tab) => tab.id);
    const windows = await browser.windows.getAll({ windowTypes: ["normal"] });
    const windowsToClose = windows.filter((windowInfo) => windowInfo.id !== currentWindow.id && typeof windowInfo.id === "number");

    for (const tabId of tabsToClose) {
      await browser.tabs.remove(tabId);
    }

    for (const windowInfo of windowsToClose) {
      await browser.windows.remove(windowInfo.id);
    }

    setStatus(`Closed ${windowsToClose.length} other browser window${windowsToClose.length === 1 ? "" : "s"} and ${tabsToClose.length} other tab${tabsToClose.length === 1 ? "" : "s"} in this window.`);
  } catch (error) {
    setStatus(`Failed to close other windows/tabs: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function fetchDesktopHelper(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:7678${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Desktop helper returned HTTP ${response.status}`);
  }

  return payload;
}

function setDesktopHelperStatus(message, isConnected) {
  desktopHelperStatus.textContent = message;
  desktopHelperStatus.className = isConnected ? "connected" : "disconnected";
}

function renderDesktopButtons(desktops) {
  desktopButtons.textContent = "";

  if (!desktops.length) {
    desktopButtons.textContent = "No virtual desktops reported by helper.";
    return;
  }

  for (const desktop of desktops) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Move Firefox windows to ${desktop.name}`;
    button.addEventListener("click", () => moveFirefoxWindowsToDesktop(desktop.id, desktop.name));
    desktopButtons.append(button);
  }
}

async function refreshDesktopHelperStatus() {
  try {
    await fetchDesktopHelper("/status");
    const { desktops = [] } = await fetchDesktopHelper("/desktops");
    setDesktopHelperStatus(`Connected (${desktops.length} desktop${desktops.length === 1 ? "" : "s"})`, true);
    renderDesktopButtons(desktops);
  } catch (error) {
    setDesktopHelperStatus(`Not connected: ${error.message}`, false);
    desktopButtons.textContent = "Start AllTabsDesktopHelper.exe, then check again.";
  }
}

async function moveFirefoxWindowsToDesktop(desktopId, desktopName) {
  try {
    const result = await fetchDesktopHelper("/move-firefox-windows", {
      method: "POST",
      body: JSON.stringify({ desktopId, skipTitle: document.title })
    });
    setStatus(`Moved ${result.moved} Firefox window${result.moved === 1 ? "" : "s"} to ${desktopName}. Skipped ${result.skipped || 0}.`);
  } catch (error) {
    setStatus(`Failed to move Firefox windows: ${error.message}`);
  }
}

async function restoreSavedValues() {
  const savedValues = await browser.storage.local.get(Object.values(STORAGE_KEYS));
  codeInput.value = savedValues[STORAGE_KEYS.code] || "";
  selectorInput.value = savedValues[STORAGE_KEYS.selector] || "";
  metadataSelectorInput.value = savedValues[STORAGE_KEYS.metadataSelector] || "";
  customCssInput.value = savedValues[STORAGE_KEYS.customCss] || "";
  writeMetadataExifInput.checked = savedValues[STORAGE_KEYS.writeMetadataExif] === true;
  downloadMetadataTextInput.checked = savedValues[STORAGE_KEYS.downloadMetadataText] !== false;
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

async function saveMetadataSelector() {
  await browser.storage.local.set({ [STORAGE_KEYS.metadataSelector]: metadataSelectorInput.value.trim() });
}

async function saveCustomCss() {
  await browser.storage.local.set({ [STORAGE_KEYS.customCss]: customCssInput.value });
}

async function saveMetadataOptions() {
  await browser.storage.local.set({
    [STORAGE_KEYS.writeMetadataExif]: writeMetadataExifInput.checked,
    [STORAGE_KEYS.downloadMetadataText]: downloadMetadataTextInput.checked
  });
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
    metadataSelector: metadataSelectorInput.value.trim(),
    customCss: customCssInput.value,
    writeMetadataExif: writeMetadataExifInput.checked,
    downloadMetadataText: downloadMetadataTextInput.checked,
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

  await Promise.all([saveCode(), saveSelector(), saveMetadataSelector(), saveCustomCss(), saveMetadataOptions(), saveDownloadFolder(), saveDomainFilter(), saveEnsureJQuery()]);
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
  metadataSelectorInput.value = profile.metadataSelector || "";
  customCssInput.value = profile.customCss || "";
  writeMetadataExifInput.checked = profile.writeMetadataExif === true;
  downloadMetadataTextInput.checked = profile.downloadMetadataText !== false;
  downloadFolderInput.value = profile.downloadFolder || "";
  domainFilterInput.value = profile.domainFilter || "";
  ensureJQueryInput.checked = profile.ensureJQuery !== false;
  profileNameInput.value = name;
  await Promise.all([saveCode(), saveSelector(), saveMetadataSelector(), saveCustomCss(), saveMetadataOptions(), saveDownloadFolder(), saveDomainFilter(), saveEnsureJQuery()]);
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

function buildCssInjector(css) {
  return `(() => {
    const css = ${JSON.stringify(css)};
    const style = document.createElement("style");
    style.dataset.allTabsDocumentRunner = "custom-css";
    style.textContent = css;
    (document.head || document.documentElement || document.body).appendChild(style);
  })();`;
}

async function injectCssInAllTabs() {
  const css = customCssInput.value.trim();

  if (!css) {
    setStatus("Enter CSS before injecting.");
    return;
  }

  setBusy(true);
  setStatus("Injecting CSS into tabs...");

  try {
    await Promise.all([saveCustomCss(), saveDomainFilter()]);
    const tabs = await queryScopedTabs();
    const code = buildCssInjector(css);
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

    const domain = normalizeDomainFilter(domainFilterInput.value);
    const domainMessage = domain ? ` matching ${domain}` : "";
    const summary = `Injected CSS into ${succeeded} of ${tabs.length} tabs${domainMessage}.`;
    setStatus(failures.length ? `${summary}\n\nSkipped/failed:\n${failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to inject CSS: ${error.message}`);
  } finally {
    setBusy(false);
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

function normalizeDownloadItems(items) {
  const seen = new Set();
  const normalizedItems = [];

  for (const item of items) {
    const url = typeof item === "string" ? item : item?.url;

    if (!isDownloadableUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalizedItems.push({ url, metadata: typeof item === "string" ? "" : item.metadata || "" });
  }

  return normalizedItems;
}

async function downloadUrls(items, folder = getDownloadFolder()) {
  let downloaded = 0;
  const failures = [];

  for (const [index, item] of normalizeDownloadItems(items).entries()) {
    try {
      await downloadUrl(item.url, index, folder, item.metadata);
      downloaded += 1;
    } catch (error) {
      failures.push(`${item.url}: ${error.message}`);
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

function buildSelectorCollector(selector, metadataSelector) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const metadataSelector = ${JSON.stringify(metadataSelector)};
    const attributes = ["href", "src", "currentSrc", "data", "poster"];
    const items = [];

    function urlsFromSrcset(srcset) {
      const value = String(srcset || "").trim();

      if (!value) {
        return [];
      }

      if (/^data:image\//i.test(value)) {
        return [value.split(/\s+/)[0]];
      }

      return value
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/)[0])
        .filter(Boolean);
    }

    function textFromMetadataElement(element) {
      if (!element || !metadataSelector) {
        return "";
      }

      const localMatch = element.matches?.(metadataSelector) ? element : element.querySelector?.(metadataSelector);
      const closestMatch = element.closest?.(metadataSelector);
      const documentMatch = document.querySelector(metadataSelector);
      const metadataElement = localMatch || closestMatch || documentMatch;
      return (metadataElement?.innerText || metadataElement?.textContent || "").trim();
    }

    function addUrl(value, element) {
      if (!value) {
        return;
      }

      items.push({
        url: new URL(value, document.baseURI).href,
        metadata: textFromMetadataElement(element)
      });
    }

    for (const element of document.querySelectorAll(selector)) {
      let addedDirectImageUrl = false;

      if (element.currentSrc) {
        addUrl(element.currentSrc, element);
        addedDirectImageUrl = true;
      }

      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        addUrl(value, element);

        if ((attribute === "src" || attribute === "currentSrc") && value) {
          addedDirectImageUrl = true;
        }
      }

      if (!addedDirectImageUrl) {
        for (const srcsetUrl of urlsFromSrcset(element.srcset || element.srcSet || element.getAttribute("srcset"))) {
          addUrl(srcsetUrl, element);
        }
      }
    }

    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
    });
  })();`;
}

async function collectUrlsFromSelector(tabs, selector, metadataSelector) {
  const items = [];
  const failures = [];
  const code = buildSelectorCollector(selector, metadataSelector);

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    try {
      const [tabItems = []] = await browser.tabs.executeScript(tab.id, { code });
      items.push(...tabItems);
    } catch (error) {
      failures.push(`${describeTab(tab)}: ${error.message}`);
    }
  }

  return { items, failures };
}

async function getSelectorUrls() {
  const selector = selectorInput.value.trim();

  if (!selector) {
    setStatus("Enter a CSS selector before saving or previewing selector matches.");
    return null;
  }

  await saveSelector();
  await saveMetadataSelector();
  await saveDomainFilter();
  const tabs = await queryScopedTabs();
  return collectUrlsFromSelector(tabs, selector, metadataSelectorInput.value.trim());
}

async function saveSelectorDocuments() {
  setBusy(true);
  setStatus("Finding documents that match the selector...");

  try {
    await saveDownloadFolder();
    await saveMetadataOptions();
    const result = await getSelectorUrls();

    if (!result) {
      return;
    }

    const { items, failures: collectionFailures } = result;
    const { downloaded, failures: downloadFailures } = await downloadUrls(items);
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
    await saveMetadataOptions();
    const result = await getSelectorUrls();

    if (!result) {
      return;
    }

    const imageItems = normalizeDownloadItems(result.items).filter((item) => isImageUrl(item.url) || !isDocumentUrl(item.url));

    if (!imageItems.length) {
      setStatus("No image URLs were found for that selector.");
      return;
    }

    await browser.storage.local.set({
      [STORAGE_KEYS.previewImages]: {
        createdAt: Date.now(),
        downloadFolder: getDownloadFolder(),
        images: imageItems
      }
    });
    await browser.tabs.create({ url: browser.runtime.getURL("preview.html") });

    const summary = `Opened preview tab with ${imageItems.length} image${imageItems.length === 1 ? "" : "s"}.`;
    setStatus(result.failures.length ? `${summary}\n\nSkipped/failed:\n${result.failures.join("\n")}` : summary);
  } catch (error) {
    setStatus(`Failed to preview selector images: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

for (const tabButton of tabButtons) {
  tabButton.addEventListener("click", () => activateTab(tabButton));
}
minimizeWindowsButton.addEventListener("click", minimizeOtherWindows);
restoreMinimizedWindowsButton.addEventListener("click", restoreMinimizedWindows);
closeOtherWindowsTabsButton.addEventListener("click", closeOtherWindowsAndTabs);
refreshDesktopHelperButton.addEventListener("click", refreshDesktopHelperStatus);
runButton.addEventListener("click", runInAllTabs);
injectCssButton.addEventListener("click", injectCssInAllTabs);
clearButton.addEventListener("click", async () => {
  codeInput.value = "";
  await saveCode();
  setStatus("Cleared saved code.");
});
clearCssButton.addEventListener("click", async () => {
  customCssInput.value = "";
  await saveCustomCss();
  setStatus("Cleared saved CSS.");
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
metadataSelectorInput.addEventListener("input", saveMetadataSelector);
customCssInput.addEventListener("input", saveCustomCss);
profileSelect.addEventListener("change", () => {
  profileNameInput.value = profileSelect.value;
});
tabSetSelect.addEventListener("change", () => {
  tabSetNameInput.value = tabSetSelect.value;
});
downloadFolderInput.addEventListener("change", saveDownloadFolder);
domainFilterInput.addEventListener("change", saveDomainFilter);
ensureJQueryInput.addEventListener("change", saveEnsureJQuery);
writeMetadataExifInput.addEventListener("change", saveMetadataOptions);
downloadMetadataTextInput.addEventListener("change", saveMetadataOptions);

restoreSavedValues().catch((error) => setStatus(`Failed to restore saved values: ${error.message}`));
refreshDesktopHelperStatus();
