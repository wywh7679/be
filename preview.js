const STORAGE_KEYS = {
  previewImages: "allTabsDocumentRunner.previewImages",
  downloadFolder: "allTabsDocumentRunner.downloadFolder",
  writeMetadataExif: "allTabsDocumentRunner.writeMetadataExif",
  downloadMetadataText: "allTabsDocumentRunner.downloadMetadataText"
};
const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const folderInput = document.getElementById("preview-download-folder");
const writeMetadataExifInput = document.getElementById("preview-write-metadata-exif");
const downloadMetadataTextInput = document.getElementById("preview-download-metadata-text");
const selectAllButton = document.getElementById("select-all");
const selectNoneButton = document.getElementById("select-none");
const startSlideshowButton = document.getElementById("start-slideshow");
const stopSlideshowButton = document.getElementById("stop-slideshow");
const downloadSelectedButton = document.getElementById("download-selected");
const downloadAllButton = document.getElementById("download-all");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
const closeLightboxButton = document.getElementById("close-lightbox");
const previousImageButton = document.getElementById("previous-image");
const nextImageButton = document.getElementById("next-image");

let imageItems = [];
let images = [];
let metadata = [];
let displayUrls = [];
let selectedIndexes = new Set();
let currentIndex = 0;
let slideshowId = null;

function isDataImageUrl(url) {
  return typeof url === "string" && /^data:image\//i.test(url);
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

function sanitizeFolder(folder) {
  return folder
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001F]/g, "").trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function getDownloadFolder() {
  return sanitizeFolder(folderInput.value);
}

async function saveDownloadFolder() {
  const sanitizedFolder = getDownloadFolder();
  folderInput.value = sanitizedFolder;
  await browser.storage.local.set({ [STORAGE_KEYS.downloadFolder]: sanitizedFolder });
}

function sanitizeFilenamePart(value) {
  return value.replace(/[<>:"|?*\u0000-\u001F]/g, "_").trim();
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
    return sanitizeFilenamePart(rawName) || `image-${index + 1}`;
  } catch (_error) {
    return `image-${index + 1}`;
  }
}

function filenameForDownload(url, index) {
  const filename = filenameFromUrl(url, index);
  const downloadFolder = getDownloadFolder();
  return downloadFolder ? `${downloadFolder}/${filename}` : filename;
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

function metadataToText(value) {
  return String(value || "").replace(/\r?\n/g, "\n").trim();
}

async function imageUrlWithExifMetadata(url, index) {
  const text = metadataToText(metadata[index]);

  if (!writeMetadataExifInput.checked || !text || !isJpegUrl(url) || typeof piexif === "undefined") {
    return displayUrls[index] || url;
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
    return displayUrls[index] || url;
  }
}

function textFilenameForDownload(url, index) {
  const filename = filenameFromUrl(url, index);
  const dotIndex = filename.lastIndexOf(".");
  const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const textFilename = `${baseName}.txt`;
  const downloadFolder = getDownloadFolder();
  return downloadFolder ? `${downloadFolder}/${textFilename}` : textFilename;
}

async function downloadMetadataFile(url, index) {
  const text = metadataToText(metadata[index]);

  if (!downloadMetadataTextInput.checked || !text) {
    return null;
  }

  const blobUrl = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" }));

  try {
    return await browser.downloads.download({
      conflictAction: "uniquify",
      filename: textFilenameForDownload(url, index),
      saveAs: false,
      url: blobUrl
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

function setSummary(message) {
  summary.textContent = message;
}

function updateSummary(message) {
  const folder = getDownloadFolder();
  const folderMessage = folder ? ` Downloads use ${folder}/.` : "";
  setSummary(`${message || `Showing ${images.length} selected image${images.length === 1 ? "" : "s"}.`} ${selectedIndexes.size} selected.${folderMessage}`.trim());
  downloadSelectedButton.disabled = selectedIndexes.size === 0;
}

function setImageSelected(index, isSelected) {
  if (isSelected) {
    selectedIndexes.add(index);
  } else {
    selectedIndexes.delete(index);
  }

  const checkbox = document.querySelector(`[data-select-index="${index}"]`);
  const tile = document.querySelector(`[data-tile-index="${index}"]`);

  if (checkbox) {
    checkbox.checked = isSelected;
  }

  if (tile) {
    tile.classList.toggle("selected", isSelected);
  }

  updateSummary();
}

function labelForImage(url, index) {
  const metadataText = metadata[index] ? ` — ${metadata[index]}` : "";
  return isDataImageUrl(url) ? `${index + 1} of ${images.length}: inline data image${metadataText}` : `${index + 1} of ${images.length}: ${url}${metadataText}`;
}

function showImage(index) {
  if (!images.length) {
    return;
  }

  currentIndex = (index + images.length) % images.length;
  lightboxImage.src = displayUrls[currentIndex] || images[currentIndex];
  lightboxCaption.textContent = labelForImage(images[currentIndex], currentIndex);
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  stopSlideshow();
}

function startSlideshow() {
  if (!images.length || slideshowId) {
    return;
  }

  showImage(currentIndex);
  slideshowId = window.setInterval(() => showImage(currentIndex + 1), 3000);
  startSlideshowButton.disabled = true;
  stopSlideshowButton.disabled = false;
}

function stopSlideshow() {
  if (slideshowId) {
    window.clearInterval(slideshowId);
    slideshowId = null;
  }

  startSlideshowButton.disabled = images.length === 0;
  stopSlideshowButton.disabled = true;
}

async function downloadImages(indexes) {
  await saveDownloadFolder();
  downloadSelectedButton.disabled = true;
  downloadAllButton.disabled = true;
  let downloaded = 0;
  const failures = [];

  for (const index of indexes) {
    const url = images[index];
    let downloadSource = displayUrls[index] || url;

    try {
      downloadSource = await imageUrlWithExifMetadata(url, index);
      await browser.downloads.download({
        conflictAction: "uniquify",
        filename: filenameForDownload(url, index),
        saveAs: false,
        url: downloadSource
      });
      await downloadMetadataFile(url, index);
      downloaded += 1;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    } finally {
      if (downloadSource.startsWith("blob:") && downloadSource !== displayUrls[index]) {
        window.setTimeout(() => URL.revokeObjectURL(downloadSource), 30000);
      }
    }
  }

  const folder = getDownloadFolder();
  const folderMessage = folder ? ` to ${folder}/` : "";
  updateSummary(failures.length ? `Queued ${downloaded} image downloads${folderMessage}. Failed:\n${failures.join("\n")}` : `Queued ${downloaded} image downloads${folderMessage}.`);
  downloadAllButton.disabled = images.length === 0;
  downloadSelectedButton.disabled = selectedIndexes.size === 0;
}

function renderGallery() {
  gallery.textContent = "";

  for (const [index, url] of images.entries()) {
    const tile = document.createElement("article");
    tile.className = "thumbnail";
    tile.dataset.tileIndex = String(index);

    const previewButton = document.createElement("button");
    previewButton.className = "thumbnail-preview";
    previewButton.type = "button";
    previewButton.title = url;
    previewButton.addEventListener("click", () => showImage(index));

    const image = document.createElement("img");
    image.alt = `Preview ${index + 1}`;
    image.loading = "lazy";
    image.src = displayUrls[index] || url;
    previewButton.append(image);

    const label = document.createElement("label");
    label.className = "thumbnail-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.selectIndex = String(index);
    checkbox.addEventListener("change", () => setImageSelected(index, checkbox.checked));
    label.append(checkbox, document.createTextNode(" Select"));

    tile.append(previewButton, label);
    gallery.append(tile);
  }
}

function selectAllImages() {
  selectedIndexes = new Set(images.map((_url, index) => index));
  renderGallery();

  for (const index of selectedIndexes) {
    setImageSelected(index, true);
  }

  updateSummary();
}

function selectNoImages() {
  selectedIndexes.clear();

  for (const checkbox of document.querySelectorAll("[data-select-index]")) {
    checkbox.checked = false;
  }

  for (const tile of document.querySelectorAll("[data-tile-index]")) {
    tile.classList.remove("selected");
  }

  updateSummary();
}

async function loadPreview() {
  const saved = await browser.storage.local.get(Object.values(STORAGE_KEYS));
  const preview = saved[STORAGE_KEYS.previewImages] || {};
  imageItems = Array.isArray(preview.images) ? preview.images : [];
  images = imageItems.map((item) => (typeof item === "string" ? item : item?.url)).filter(Boolean);
  metadata = imageItems.map((item) => (typeof item === "string" ? "" : item?.metadata || ""));
  displayUrls = images.map((url) => (isDataImageUrl(url) ? dataImageToBlobUrl(url) : url));
  folderInput.value = preview.downloadFolder || saved[STORAGE_KEYS.downloadFolder] || "";
  writeMetadataExifInput.checked = saved[STORAGE_KEYS.writeMetadataExif] === true;
  downloadMetadataTextInput.checked = saved[STORAGE_KEYS.downloadMetadataText] !== false;
  selectedIndexes = new Set(images.map((_url, index) => index));

  renderGallery();
  for (const index of selectedIndexes) {
    setImageSelected(index, true);
  }
  updateSummary();
  selectAllButton.disabled = images.length === 0;
  selectNoneButton.disabled = images.length === 0;
  startSlideshowButton.disabled = images.length === 0;
  downloadAllButton.disabled = images.length === 0;
  downloadSelectedButton.disabled = selectedIndexes.size === 0;
}

selectAllButton.addEventListener("click", selectAllImages);
selectNoneButton.addEventListener("click", selectNoImages);
startSlideshowButton.addEventListener("click", startSlideshow);
stopSlideshowButton.addEventListener("click", stopSlideshow);
downloadSelectedButton.addEventListener("click", () => downloadImages([...selectedIndexes]));
downloadAllButton.addEventListener("click", () => downloadImages(images.map((_url, index) => index)));
folderInput.addEventListener("change", () => saveDownloadFolder().then(() => updateSummary()));
writeMetadataExifInput.addEventListener("change", () => browser.storage.local.set({ [STORAGE_KEYS.writeMetadataExif]: writeMetadataExifInput.checked }));
downloadMetadataTextInput.addEventListener("change", () => browser.storage.local.set({ [STORAGE_KEYS.downloadMetadataText]: downloadMetadataTextInput.checked }));
closeLightboxButton.addEventListener("click", closeLightbox);
previousImageButton.addEventListener("click", () => showImage(currentIndex - 1));
nextImageButton.addEventListener("click", () => showImage(currentIndex + 1));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
  } else if (event.key === "ArrowLeft") {
    showImage(currentIndex - 1);
  } else if (event.key === "ArrowRight") {
    showImage(currentIndex + 1);
  }
});

window.addEventListener("pagehide", () => {
  for (const url of displayUrls) {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
});

loadPreview().catch((error) => setSummary(`Failed to load image preview: ${error.message}`));
