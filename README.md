# All Tabs JavaScript Runner

A Firefox browser extension that lets a user enter JavaScript in a popup and execute it across all open compatible tabs.

## Files

- `manifest.json` declares the Firefox WebExtension, popup, and permissions required to enumerate tabs and run code on web pages.
- `popup.html` provides the popup UI.
- `popup.css` styles the popup.
- `popup.js` stores the user's snippet, loops over all tabs, and calls `browser.tabs.executeScript` for each tab.

## Development install

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select this repository's `manifest.json`.
4. Click the extension toolbar button, enter JavaScript, and click **Run in all tabs**.

Some internal pages, privileged browser pages, and pages where extensions cannot inject scripts will be skipped and reported in the popup status output.
