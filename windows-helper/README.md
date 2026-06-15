# All Tabs Desktop Helper for Windows 10+

This optional helper is a standalone Windows executable that listens on `http://127.0.0.1:7678` so the Firefox extension can ask it to move Firefox browser windows to a Windows virtual desktop.

## Build

Install the .NET 8 SDK, then publish a single-file executable from this directory:

```powershell
dotnet publish -c Release
```

The executable is written to `bin\Release\net8.0-windows\win-x64\publish\AllTabsDesktopHelper.exe`.

## Run

Start `AllTabsDesktopHelper.exe` outside Firefox. The extension status indicator will show whether it can connect.

## Endpoints

- `GET /status` returns helper availability.
- `GET /desktops` returns virtual desktop IDs found in the current user's Explorer virtual desktop registry data.
- `POST /move-firefox-windows` with `{ "desktopId": "..." }` moves top-level Firefox windows to that desktop by using Windows' `IVirtualDesktopManager` COM API.
