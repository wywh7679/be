# All Tabs Desktop Helper for Windows 10+

This optional helper is a standalone Windows executable project that listens on `http://127.0.0.1:7678` so the Firefox extension can ask it to move Firefox browser windows to NVIDIA RTX Desktop Manager desktops.

NVIDIA RTX Desktop Manager does not expose a public local HTTP API for this extension to call directly. Instead, configure NVIDIA RTX Desktop Manager's **Move window to desktop** hotkeys, then mirror those hotkeys in `rtx-desktop-hotkeys.json`. The helper focuses each Firefox window and sends the configured hotkey for the requested RTX desktop.

## Build

Install the .NET 8 SDK, then publish a single-file executable from this directory:

```powershell
dotnet publish -c Release
```

The executable is written to `bin\Release\net8.0-windows\win-x64\publish\AllTabsDesktopHelper.exe`.

## Configure RTX Desktop Manager hotkeys

1. In NVIDIA RTX Desktop Manager, configure hotkeys for moving the active window to each RTX desktop you want to target.
2. Copy `rtx-desktop-hotkeys.example.json` to `rtx-desktop-hotkeys.json` next to `AllTabsDesktopHelper.exe`.
3. Edit each `id`, `name`, and `hotkey` entry so it matches the NVIDIA RTX Desktop Manager hotkeys you configured.
4. Start `AllTabsDesktopHelper.exe` outside Firefox. The extension status indicator will show whether it can connect and will create one move button per configured desktop.

## Troubleshooting

If the helper reports `SendInput sent 0 ...`, rebuild from the current source. The helper now enumerates all visible top-level Firefox windows instead of using only the helper process main window, and skips the initiating extension window by title when the extension sends `skipTitle`. The helper also uses the Win32 `INPUT` layout required by `SendInput` on 64-bit Windows. The `/status` endpoint should report `inputSize: 40` for the win-x64 helper target. If `SendInput` fails again, the error includes `GetLastWin32Error` plus the input structure size.

## Endpoints

- `GET /status` returns helper availability and configured desktop count.
- `GET /desktops` returns configured RTX desktop hotkey targets.
- `POST /move-firefox-windows` with `{ "desktopId": "...", "skipTitle": "All Tabs Document Runner" }` enumerates visible top-level Firefox windows, skips the window whose title contains `skipTitle`, focuses each remaining window, and sends the configured NVIDIA RTX Desktop Manager move-window hotkey for that desktop.
