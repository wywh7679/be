const STORAGE_KEY = "allTabsDocumentRunner.previewImages";
const gallery = document.getElementById("gallery");
const summary = document.getElementById("summary");
const startSlideshowButton = document.getElementById("start-slideshow");
const stopSlideshowButton = document.getElementById("stop-slideshow");
const downloadAllButton = document.getElementById("download-all");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");
const closeLightboxButton = document.getElementById("close-lightbox");
const previousImageButton = document.getElementById("previous-image");
const nextImageButton = document.getElementById("next-image");

let images = [];
let downloadFolder = "";
let currentIndex = 0;
let slideshowId = null;

function sanitizeFilenamePart(value) {
  return value.replace(/[<>:"|?*\u0000-\u001F]/g, "_").trim();
}

function filenameFromUrl(url, index) {
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
  return downloadFolder ? `${downloadFolder}/${filename}` : filename;
}

function setSummary(message) {
  summary.textContent = message;
}

function showImage(index) {
  if (!images.length) {
    return;
  }

  currentIndex = (index + images.length) % images.length;
  lightboxImage.src = images[currentIndex];
  lightboxCaption.textContent = `${currentIndex + 1} of ${images.length}: ${images[currentIndex]}`;
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

  startSlideshowButton.disabled = false;
  stopSlideshowButton.disabled = true;
}

async function downloadAllImages() {
  downloadAllButton.disabled = true;
  let downloaded = 0;
  const failures = [];

  for (const [index, url] of images.entries()) {
    try {
      await browser.downloads.download({
        conflictAction: "uniquify",
        filename: filenameForDownload(url, index),
        saveAs: false,
        url
      });
      downloaded += 1;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }

  const folderMessage = downloadFolder ? ` to ${downloadFolder}/` : "";
  setSummary(failures.length ? `Queued ${downloaded} image downloads${folderMessage}. Failed:\n${failures.join("\n")}` : `Queued ${downloaded} image downloads${folderMessage}.`);
  downloadAllButton.disabled = false;
}

function renderGallery() {
  gallery.textContent = "";

  for (const [index, url] of images.entries()) {
    const button = document.createElement("button");
    button.className = "thumbnail";
    button.type = "button";
    button.title = url;
    button.addEventListener("click", () => showImage(index));

    const image = document.createElement("img");
    image.alt = `Preview ${index + 1}`;
    image.loading = "lazy";
    image.src = url;
    button.append(image);
    gallery.append(button);
  }
}

async function loadPreview() {
  const saved = await browser.storage.local.get(STORAGE_KEY);
  const preview = saved[STORAGE_KEY] || {};
  images = Array.isArray(preview.images) ? preview.images : [];
  downloadFolder = preview.downloadFolder || "";

  renderGallery();
  const folderMessage = downloadFolder ? ` Downloads will use ${downloadFolder}/.` : "";
  setSummary(`Showing ${images.length} selected image${images.length === 1 ? "" : "s"}.${folderMessage}`);
  startSlideshowButton.disabled = images.length === 0;
  downloadAllButton.disabled = images.length === 0;
}

startSlideshowButton.addEventListener("click", startSlideshow);
stopSlideshowButton.addEventListener("click", stopSlideshow);
downloadAllButton.addEventListener("click", downloadAllImages);
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

loadPreview().catch((error) => setSummary(`Failed to load image preview: ${error.message}`));
