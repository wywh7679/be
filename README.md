# All Tabs Document Runner

A Firefox browser extension that lets a user enter JavaScript in a popup, execute it across all open compatible tabs, and save documents from open tabs or CSS selector matches.

## Files

- `manifest.json` declares the Firefox WebExtension, popup, and permissions required to enumerate tabs, persist snippets/selectors, inject scripts, and queue downloads.
- `popup.html` provides the popup UI for JavaScript execution and document downloads.
- `popup.css` styles the popup.
- `popup.js` stores the user's snippet and selector, loops over all tabs for JavaScript execution, downloads open image/PDF document tabs, and downloads URLs collected from selector matches.

## Development install

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select this repository's `manifest.json`.
4. Click the extension toolbar button.
5. Enter JavaScript and click **Run in all tabs**, click **Save open images/PDFs**, or enter a CSS selector and click **Save selector matches**.

## Saving documents by selector

The selector downloader runs `document.querySelectorAll()` in each compatible tab and collects URLs from matching elements' `href`, `src`, `currentSrc`, `data`, and `poster` values. Example selectors include:

- `a[href$='.pdf']` to save linked PDFs.
- `img` to save images embedded in pages.
- `video[poster]` to save video poster images.

Some internal pages, privileged browser pages, protected PDF viewer pages, and pages where extensions cannot inject scripts will be skipped and reported in the popup status output.
