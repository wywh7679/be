using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;

const string Prefix = "http://127.0.0.1:7678/";
using var listener = new HttpListener();
listener.Prefixes.Add(Prefix);
listener.Start();
Console.WriteLine($"All Tabs Desktop Helper listening on {Prefix}");

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
            await WriteJson(context.Response, new { ok = true, name = "All Tabs Desktop Helper", version = "1.0.0" });
            return;
        }

        if (path == "/desktops")
        {
            var desktops = VirtualDesktopSupport.GetDesktopIds()
                .Select((id, index) => new { id, index, name = $"Desktop {index + 1}" })
                .ToArray();
            await WriteJson(context.Response, new { ok = true, desktops });
            return;
        }

        if (path == "/move-firefox-windows" && context.Request.HttpMethod == "POST")
        {
            using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
            var request = JsonSerializer.Deserialize<MoveRequest>(await reader.ReadToEndAsync(), JsonOptions()) ?? new MoveRequest();

            if (!Guid.TryParse(request.DesktopId, out var desktopId))
            {
                await WriteJson(context.Response, new { ok = false, error = "desktopId must be a GUID" }, 400);
                return;
            }

            var moved = VirtualDesktopSupport.MoveFirefoxWindowsToDesktop(desktopId);
            await WriteJson(context.Response, new { ok = true, moved });
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

static JsonSerializerOptions JsonOptions() => new(JsonSerializerDefaults.Web);

sealed class MoveRequest
{
    public string? DesktopId { get; set; }
}

static partial class VirtualDesktopSupport
{
    private const string VirtualDesktopRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops";

    public static IReadOnlyList<Guid> GetDesktopIds()
    {
        using var key = Registry.CurrentUser.OpenSubKey(VirtualDesktopRegistryPath);
        var bytes = key?.GetValue("VirtualDesktopIDs") as byte[];

        if (bytes is null || bytes.Length < 16)
        {
            return Array.Empty<Guid>();
        }

        var desktops = new List<Guid>();
        for (var offset = 0; offset + 16 <= bytes.Length; offset += 16)
        {
            desktops.Add(new Guid(bytes.AsSpan(offset, 16)));
        }

        return desktops;
    }

    public static int MoveFirefoxWindowsToDesktop(Guid desktopId)
    {
        var manager = (IVirtualDesktopManager)new CVirtualDesktopManager();
        var moved = 0;

        foreach (var process in Process.GetProcessesByName("firefox"))
        {
            if (process.MainWindowHandle == IntPtr.Zero)
            {
                continue;
            }

            manager.MoveWindowToDesktop(process.MainWindowHandle, desktopId);
            moved += 1;
        }

        return moved;
    }
}

[ComImport]
[Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
internal sealed class CVirtualDesktopManager
{
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b")]
internal interface IVirtualDesktopManager
{
    [PreserveSig]
    int IsWindowOnCurrentVirtualDesktop(IntPtr topLevelWindow, out bool onCurrentDesktop);
    [PreserveSig]
    int GetWindowDesktopId(IntPtr topLevelWindow, out Guid desktopId);
    [PreserveSig]
    int MoveWindowToDesktop(IntPtr topLevelWindow, [MarshalAs(UnmanagedType.LPStruct)] Guid desktopId);
}
