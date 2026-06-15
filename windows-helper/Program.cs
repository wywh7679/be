using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

const string Prefix = "http://127.0.0.1:7678/";
using var listener = new HttpListener();
listener.Prefixes.Add(Prefix);
listener.Start();
Console.WriteLine($"All Tabs Desktop Helper listening on {Prefix}");
Console.WriteLine("Configure NVIDIA RTX Desktop Manager hotkeys in rtx-desktop-hotkeys.json next to this executable.");

while (true)
{
    var context = await listener.GetContextAsync();
    _ = Task.Run(() => HandleRequest(context));
}

static async Task HandleRequest(HttpListenerContext context)
{
    try
    {
        AddCorsHeaders(context.Response);

        if (context.Request.HttpMethod == "OPTIONS")
        {
            context.Response.StatusCode = 204;
            context.Response.Close();
            return;
        }

        var path = context.Request.Url?.AbsolutePath.TrimEnd('/') ?? string.Empty;

        if (path is "" or "/status")
        {
            var config = RtxDesktopConfig.Load();
            await WriteJson(context.Response, new
            {
                ok = true,
                name = "All Tabs Desktop Helper",
                version = "2.0.0",
                provider = "nvidia-rtx-desktop-manager-hotkeys",
                configuredDesktops = config.Desktops.Count,
                inputSize = Marshal.SizeOf<Input>()
            });
            return;
        }

        if (path == "/desktops")
        {
            var desktops = RtxDesktopConfig.Load().Desktops
                .Select((desktop, index) => new { desktop.Id, index, desktop.Name, desktop.Hotkey })
                .ToArray();
            await WriteJson(context.Response, new { ok = true, provider = "nvidia-rtx-desktop-manager-hotkeys", desktops });
            return;
        }

        if (path == "/move-firefox-windows" && context.Request.HttpMethod == "POST")
        {
            using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
            var request = JsonSerializer.Deserialize<MoveRequest>(await reader.ReadToEndAsync(), JsonOptions()) ?? new MoveRequest();
            var result = RtxDesktopMover.MoveFirefoxWindowsToDesktop(request.DesktopId ?? string.Empty, request.SkipTitle ?? string.Empty);
            await WriteJson(context.Response, new { ok = true, moved = result.Moved, attempted = result.Attempted, skipped = result.Skipped, result.DesktopName });
            return;
        }

        await WriteJson(context.Response, new { ok = false, error = "Not found" }, 404);
    }
    catch (Exception error)
    {
        await WriteJson(context.Response, new { ok = false, error = error.Message }, 500);
    }
}

static void AddCorsHeaders(HttpListenerResponse response)
{
    response.Headers["Access-Control-Allow-Origin"] = "*";
    response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
}

static async Task WriteJson(HttpListenerResponse response, object value, int statusCode = 200)
{
    response.StatusCode = statusCode;
    response.ContentType = "application/json; charset=utf-8";
    var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, JsonOptions()));
    response.ContentLength64 = bytes.Length;
    await response.OutputStream.WriteAsync(bytes);
    response.Close();
}

static JsonSerializerOptions JsonOptions() => new(JsonSerializerDefaults.Web)
{
    WriteIndented = true
};

sealed class MoveRequest
{
    public string? DesktopId { get; set; }
    public string? SkipTitle { get; set; }
}

sealed class RtxDesktopConfig
{
    public List<RtxDesktop> Desktops { get; set; } = [];

    public static RtxDesktopConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "rtx-desktop-hotkeys.json");

        if (!File.Exists(path))
        {
            return new RtxDesktopConfig();
        }

        var config = JsonSerializer.Deserialize<RtxDesktopConfig>(File.ReadAllText(path), new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? new RtxDesktopConfig();
        config.Desktops = config.Desktops
            .Where(desktop => !string.IsNullOrWhiteSpace(desktop.Id) && !string.IsNullOrWhiteSpace(desktop.Hotkey))
            .ToList();
        return config;
    }
}

sealed class RtxDesktop
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Hotkey { get; set; } = string.Empty;
}

sealed record MoveResult(int Attempted, int Moved, int Skipped, string DesktopName);

static partial class RtxDesktopMover
{
    private const int SwRestore = 9;

    public static MoveResult MoveFirefoxWindowsToDesktop(string desktopId, string skipTitle)
    {
        var config = RtxDesktopConfig.Load();
        var desktop = config.Desktops.FirstOrDefault(candidate => string.Equals(candidate.Id, desktopId, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"No RTX Desktop Manager hotkey is configured for desktop id '{desktopId}'.");
        var hotkey = Hotkey.Parse(desktop.Hotkey);
        var attempted = 0;
        var moved = 0;
        var skipped = 0;

        foreach (var window in FirefoxWindowEnumerator.GetFirefoxWindows())
        {
            if (!string.IsNullOrWhiteSpace(skipTitle) && window.Title.Contains(skipTitle, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            attempted += 1;

            if (!TryFocusWindow(window.Handle))
            {
                skipped += 1;
                continue;
            }

            hotkey.Send();
            moved += 1;
            Thread.Sleep(150);
        }

        return new MoveResult(attempted, moved, skipped, desktop.NameOrId());
    }

    private static bool TryFocusWindow(IntPtr windowHandle)
    {
        NativeMethods.ShowWindow(windowHandle, SwRestore);
        Hotkey.PulseAlt();
        NativeMethods.SetForegroundWindow(windowHandle);
        NativeMethods.BringWindowToTop(windowHandle);

        for (var attempt = 0; attempt < 10; attempt += 1)
        {
            if (NativeMethods.GetForegroundWindow() == windowHandle)
            {
                return true;
            }

            Thread.Sleep(100);
        }

        return false;
    }
}

sealed record FirefoxWindow(IntPtr Handle, string Title);

static class FirefoxWindowEnumerator
{
    public static IReadOnlyList<FirefoxWindow> GetFirefoxWindows()
    {
        var windows = new List<FirefoxWindow>();

        NativeMethods.EnumWindows((windowHandle, _) =>
        {
            NativeMethods.GetWindowThreadProcessId(windowHandle, out var processId);

            try
            {
                using var process = Process.GetProcessById((int)processId);

                if (!string.Equals(process.ProcessName, "firefox", StringComparison.OrdinalIgnoreCase) || !NativeMethods.IsWindowVisible(windowHandle))
                {
                    return true;
                }

                var titleLength = NativeMethods.GetWindowTextLength(windowHandle);

                if (titleLength <= 0)
                {
                    return true;
                }

                var titleBuilder = new StringBuilder(titleLength + 1);
                NativeMethods.GetWindowText(windowHandle, titleBuilder, titleBuilder.Capacity);
                windows.Add(new FirefoxWindow(windowHandle, titleBuilder.ToString()));
            }
            catch
            {
                // The process may exit while windows are being enumerated. Ignore and keep enumerating.
            }

            return true;
        }, IntPtr.Zero);

        return windows;
    }
}

sealed class Hotkey
{
    private readonly ushort[] _modifiers;
    private readonly ushort _key;

    private Hotkey(IEnumerable<ushort> modifiers, ushort key)
    {
        _modifiers = modifiers.ToArray();
        _key = key;
    }

    public static Hotkey Parse(string value)
    {
        var tokens = value.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (tokens.Length == 0)
        {
            throw new InvalidOperationException("Hotkey cannot be empty.");
        }

        var modifiers = new List<ushort>();
        ushort? key = null;

        foreach (var token in tokens)
        {
            switch (token.ToUpperInvariant())
            {
                case "CTRL" or "CONTROL":
                    modifiers.Add(0x11);
                    break;
                case "ALT":
                    modifiers.Add(0x12);
                    break;
                case "SHIFT":
                    modifiers.Add(0x10);
                    break;
                case "WIN" or "WINDOWS" or "META":
                    modifiers.Add(0x5B);
                    break;
                default:
                    key = VirtualKeyFromToken(token);
                    break;
            }
        }

        return key is null
            ? throw new InvalidOperationException($"Hotkey '{value}' does not include a non-modifier key.")
            : new Hotkey(modifiers, key.Value);
    }

    public void Send()
    {
        var inputs = new List<Input>();
        inputs.AddRange(_modifiers.Select(KeyDown));
        inputs.Add(KeyDown(_key));
        inputs.Add(KeyUp(_key));
        inputs.AddRange(_modifiers.Reverse().Select(KeyUp));
        var sent = NativeMethods.SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<Input>());

        if (sent != inputs.Count)
        {
            var lastError = Marshal.GetLastWin32Error();
            throw new InvalidOperationException($"SendInput sent {sent} of {inputs.Count} keyboard events. GetLastWin32Error={lastError}, InputSize={Marshal.SizeOf<Input>()}.");
        }
    }

    private static ushort VirtualKeyFromToken(string token)
    {
        var normalized = token.ToUpperInvariant();

        if (normalized.Length == 1)
        {
            var character = normalized[0];

            if (character is >= 'A' and <= 'Z' or >= '0' and <= '9')
            {
                return character;
            }
        }

        if (normalized.StartsWith('F') && int.TryParse(normalized[1..], out var functionKey) && functionKey is >= 1 and <= 24)
        {
            return (ushort)(0x70 + functionKey - 1);
        }

        return normalized switch
        {
            "LEFT" => 0x25,
            "UP" => 0x26,
            "RIGHT" => 0x27,
            "DOWN" => 0x28,
            "SPACE" => 0x20,
            "TAB" => 0x09,
            "ENTER" => 0x0D,
            "ESC" or "ESCAPE" => 0x1B,
            _ => throw new InvalidOperationException($"Unsupported hotkey key '{token}'.")
        };
    }

    public static void PulseAlt()
    {
        var inputs = new[] { KeyDown(0x12), KeyUp(0x12) };
        NativeMethods.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>());
    }

    private static Input KeyDown(ushort key) => new()
    {
        Type = 1,
        KeyboardInput = new KeyboardInput { VirtualKey = key }
    };

    private static Input KeyUp(ushort key) => new()
    {
        Type = 1,
        KeyboardInput = new KeyboardInput { VirtualKey = key, Flags = 0x0002 }
    };
}

static class RtxDesktopExtensions
{
    public static string NameOrId(this RtxDesktop desktop) => string.IsNullOrWhiteSpace(desktop.Name) ? desktop.Id : desktop.Name;
}

[StructLayout(LayoutKind.Explicit, Size = 40)]
struct Input
{
    [FieldOffset(0)]
    public uint Type;

    // INPUT contains a DWORD type followed by pointer-aligned union data.
    // On the win-x64 helper target the union begins at byte 8, making
    // sizeof(INPUT) 40. Passing 32 here causes SendInput to fail with
    // ERROR_INVALID_PARAMETER (87).
    [FieldOffset(8)]
    public KeyboardInput KeyboardInput;
}

[StructLayout(LayoutKind.Sequential)]
struct KeyboardInput
{
    public ushort VirtualKey;
    public ushort Scan;
    public uint Flags;
    public uint Time;
    public IntPtr ExtraInfo;
}

delegate bool EnumWindowsProc(IntPtr windowHandle, IntPtr lParam);

static class NativeMethods
{
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int GetWindowText(IntPtr windowHandle, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int GetWindowTextLength(IntPtr windowHandle);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr windowHandle);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BringWindowToTop(IntPtr windowHandle);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindow(IntPtr windowHandle, int commandShow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint inputCount, Input[] inputs, int inputSize);
}
