# All Tabs Document Runner

A Firefox browser extension that lets a user enter JavaScript in a popup, execute it across all open compatible tabs, save documents from open tabs or CSS selector matches, and preview selected images in a gallery tab.

## Files

- `manifest.json` declares the Firefox WebExtension, popup, and permissions required to enumerate tabs, persist snippets/selectors/folders/previews, inject scripts, open preview tabs, and queue downloads.
- `popup.html` provides the popup UI for JavaScript execution, download subfolder selection, document downloads, and image previews.
- `popup.css` styles the popup.
- `popup.js` stores the user's snippet, selector, and download subfolder; loops over all tabs for JavaScript execution; downloads open image/PDF document tabs; downloads URLs collected from selector matches; and opens selector image previews.
- `preview.html`, `preview.css`, and `preview.js` render selected images as a four-column thumbnail gallery with a clickable lightbox, slideshow controls, and a download-all button.

## Development install

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select this repository's `manifest.json`.
4. Click the extension toolbar button.
5. Optionally enter a relative download subfolder, such as `research/images`.
6. Enter JavaScript and click **Run in all tabs**, click **Save open images/PDFs**, enter a CSS selector and click **Save selector matches**, or click **Preview selector images**.

## Download subfolders

The download subfolder field is optional. When it is set, downloads are saved under that relative path inside Firefox's default downloads directory. Invalid filename characters and parent-directory path segments are removed before downloads are queued.

## Saving documents by selector

The selector downloader runs `document.querySelectorAll()` in each compatible tab and collects URLs from matching elements' `href`, `src`, `currentSrc`, `data`, and `poster` values. Example selectors include:

- `a[href$='.pdf']` to save linked PDFs.
- `img` to save images embedded in pages.
- `video[poster]` to save video poster images.

## Previewing images

**Preview selector images** collects image-like URLs from the current selector, opens a new extension tab, and displays the images as thumbnails four per row. Click any thumbnail to open the lightbox, use the arrow buttons or keyboard arrows to move between images, click **Start slideshow** to advance automatically, or click **Download all images** to save all previewed images to the selected download subfolder.

Some internal pages, privileged browser pages, protected PDF viewer pages, and pages where extensions cannot inject scripts will be skipped and reported in the popup status output.
