# All Tabs Document Runner

A Firefox browser extension that opens as a full-page tool for running JavaScript across compatible tabs, saving documents from open tabs or CSS selector matches, and previewing selected images in a gallery tab.

## Files

- `manifest.json` declares the Firefox WebExtension, toolbar button, background script, and permissions required to enumerate tabs, persist snippets/selectors/folders/previews, inject scripts, open extension tabs, and queue downloads.
- `background.js` opens the full-page extension UI when the toolbar button is clicked.
- `app.html`, `popup.css`, and `popup.js` provide the tabbed full-page UI for Run/Save, Tab/Window, and Profiles workflows, plus field profiles, saved tab/window sets, JavaScript execution, custom CSS injection, optional jQuery injection, domain-limited tab targeting, metadata EXIF writing for JPEG downloads, optional metadata sidecar files for selector downloads, download subfolder selection, document downloads, image previews, browser-window close/minimize/restore actions, and optional desktop-helper integration.
- `popup.html` remains available as a compact standalone version of the same UI.
- `vendor/jquery.min.js` is injected into compatible tabs before user code when the jQuery option is enabled and jQuery is not already loaded in the extension content-script context.
- `vendor/piexif.js` is the MIT-licensed piexifjs library used to write selector metadata into downloaded JPEG EXIF when the option is enabled.
- `preview.html`, `preview.css`, and `preview.js` render selected images as a four-column thumbnail gallery with multiselect controls, a clickable lightbox, slideshow controls, a preview-page subfolder field, and selected/all download buttons.
- `windows-helper/` contains an optional Windows 10+ .NET helper executable project that listens on localhost port 7678 and moves Firefox windows between Windows virtual desktops.

## Development install

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select this repository's `manifest.json`.
4. Click the extension toolbar button to open the full-page extension UI. Use the **Run/Save**, **Tab/Window**, and **Profiles** tabs to switch between settings groups.
5. Optionally save or load a field profile to populate the code, custom CSS, selector, metadata selector, folder, jQuery, and domain filter fields, or save/restore a tab set for all currently open normal windows and tabs.
6. Optionally enter a domain filter, such as `example.com`, to include only matching tabs and subdomains.
7. Optionally enter a relative download subfolder, such as `research/images`.
8. Leave **Load jQuery in each tab before running code** checked if your snippet needs `$`/`jQuery`; the extension injects its bundled jQuery only when jQuery is not already available.
9. Enter JavaScript and click **Run in all tabs**, enter CSS and click **Inject CSS in all tabs**, click **Save open images/PDFs**, enter a CSS selector and click **Save selector matches**, or click **Preview selector images**.

## Optional Windows desktop helper

The extension can connect to an optional helper at `http://127.0.0.1:7678`. Build and run `windows-helper/AllTabsDesktopHelper.exe` outside Firefox to enable the desktop status indicator and generated **Move Firefox windows to Desktop N** buttons. Configure NVIDIA RTX Desktop Manager move-window hotkeys, copy `windows-helper/rtx-desktop-hotkeys.example.json` to `rtx-desktop-hotkeys.json`, and mirror those hotkeys there. The helper exposes `/status`, `/desktops`, and `/move-firefox-windows`; when asked to move windows, it focuses each top-level Firefox window and sends the configured RTX Desktop Manager hotkey for the selected desktop.

## Window actions and UI tabs

The runner UI is split into **Run/Save**, **Tab/Window**, and **Profiles** tabs. Above those tabs, **Minimize other windows** minimizes normal Firefox windows except the current runner window, while **Restore minimized windows** restores normal Firefox windows whose state is minimized. **Close other windows/tabs** closes every other normal Firefox window and every other tab in the current runner window, leaving the runner tab open.

## Profiles and domain filters

Profiles save the current JavaScript snippet, custom CSS, selector, metadata selector, download subfolder, jQuery setting, and domain filter under a user-provided name. Use **Save profile** to add or update a profile, **Load profile** to populate all fields from the selected profile, and **Delete profile** to remove it.

The optional domain filter limits tab operations to pages whose hostname exactly matches the entered domain or ends with it as a subdomain. For example, `example.com` includes `example.com` and `www.example.com`, but leaves other open tabs untouched. The filter applies to running JavaScript, injecting CSS, saving open documents, selector downloads, and selector image previews.

## Tab/window sets

Tab/window sets save the URLs, active state, pinned state, and window grouping for all currently open normal browser windows. Use **Save open tabs/windows** to capture the current workspace under a name, **Restore tab set** to recreate the saved windows and tabs, and **Delete tab set** to remove a saved workspace. Restoring a tab set creates new browser windows and does not close or replace existing tabs.

## jQuery injection

When the jQuery option is enabled, the extension checks each compatible tab for `window.jQuery`/`window.$` before running the supplied JavaScript. If jQuery is missing in the extension execution context, it injects the bundled `vendor/jquery.min.js` first, so user snippets can use `$` and `jQuery`.

## CSS injection

The custom CSS field appends a new `<style data-all-tabs-document-runner="custom-css">` block to the end of each compatible tab's DOM target (`head`, `documentElement`, or `body`). The CSS uses the same domain filter as JavaScript execution and is saved in profiles.

## Download subfolders

The download subfolder field is optional. When it is set, downloads are saved under that relative path inside Firefox's default downloads directory. Invalid filename characters and parent-directory path segments are removed before downloads are queued. The preview page also has its own subfolder field, initialized from the popup/full-page UI, so selected-image downloads can be redirected before downloading.

## Saving documents by selector

The selector downloader runs `document.querySelectorAll()` in each compatible tab and collects URLs from matching elements' `href`, `src`, `currentSrc`, `data`, and `poster` values. If **Metadata text selector** is set, the runner also captures matching text near each document/image element. With **Write metadata into JPEG EXIF** enabled, JPEG downloads are rewritten through piexifjs with that text stored in the EXIF ImageDescription field when possible. With **Download metadata .txt sidecar files** enabled, the same metadata is also saved as a `.txt` file with the same base filename as the image/document. Example selectors include:

- `a[href$='.pdf']` to save linked PDFs.
- `img` to save images embedded in pages, including `src="data:image/..."` inline images.
- `video[poster]` to save video poster images.

## Previewing images

**Preview selector images** collects image-like URLs from the current selector, including inline `data:image` URLs from `img` tags, converts inline data images to image blobs for preview/download, opens a new extension tab, and displays the full images as contained thumbnails four per row. Previewed images start selected by default. Use **Select all**, **Select none**, or individual thumbnail checkboxes to choose images, click any thumbnail to open the lightbox, use the arrow buttons or keyboard arrows to move between images, click **Start slideshow** to advance automatically, click **Download selected** to save only checked images, or click **Download all images** to save the entire preview set. If metadata was captured for a preview image, its download can also write JPEG EXIF metadata and/or queue a same-base-name `.txt` sidecar file depending on the selected metadata options.

Some internal pages, privileged browser pages, protected PDF viewer pages, and pages where extensions cannot inject scripts will be skipped and reported in the popup status output.
