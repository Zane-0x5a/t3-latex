<#
Adds the "T3 Code (LaTeX)" shortcut to the Start menu and the desktop. It
starts T3 Code with formula rendering through launcher\t3-latex.cmd. Nothing
in T3's own folder is touched; uninstall.ps1 removes the shortcuts again.

  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -Destination <folder>   (tests)
#>
param([string[]]$Destination)
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$cmd = Join-Path $root 'launcher\t3-latex.cmd'
$t3 = & (Join-Path $root 'launcher\find-t3.cmd') | Select-Object -First 1
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
if (-not $t3 -or -not (Test-Path $t3)) { throw 'T3 Code not found. Install it first, or set T3LATEX_T3_EXE to its exe.' }
if (-not (Test-Path (Join-Path $root 'mod\assets\boot.js'))) { throw 'mod\assets is missing; run: node build.mjs' }
if (-not $Destination) {
  $Destination = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
}

# The shortcut has its own AppUserModelID, and the launcher gives T3 the same
# one (APP_ID in launcher\launch.cjs), so a pinned "T3 Code (LaTeX)" and the
# T3 window it opens share one taskbar button. It must not be T3's own
# com.t3tools.t3code: the Start menu lists one shortcut per ID and would hide
# this one behind "T3 Code (Alpha)".
$appId = 'com.t3tools.t3code.latex'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace T3Latex {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit)]
  public struct PropVariant {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pointer;
    [FieldOffset(16)] public IntPtr unused;
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    void GetCount(out uint count);
    void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, out PropVariant value);
    void SetValue(ref PropertyKey key, ref PropVariant value);
    void Commit();
  }
  public static class Shortcut {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHGetPropertyStoreFromParsingName(string path, IntPtr bindCtx, int flags, ref Guid iid,
      [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    static PropertyKey AppUserModelId = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
    public static void SetAppUserModelId(string path, string id) {
      Guid iid = typeof(IPropertyStore).GUID;
      IPropertyStore store;
      SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2 /* GPS_READWRITE */, ref iid, out store);
      PropVariant value = new PropVariant { vt = 31 /* VT_LPWSTR */, pointer = Marshal.StringToCoTaskMemUni(id) };
      try { store.SetValue(ref AppUserModelId, ref value); store.Commit(); }
      finally { Marshal.FreeCoTaskMem(value.pointer); Marshal.ReleaseComObject(store); }
    }
    public static string GetAppUserModelId(string path) {
      Guid iid = typeof(IPropertyStore).GUID;
      IPropertyStore store;
      SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 0, ref iid, out store);
      try {
        PropVariant value;
        store.GetValue(ref AppUserModelId, out value);
        return value.vt == 31 ? Marshal.PtrToStringUni(value.pointer) : null;
      } finally { Marshal.ReleaseComObject(store); }
    }
  }
  public static class IconFile {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    delegate bool EnumNames(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
    [DllImport("kernel32.dll")] static extern bool EnumResourceNames(IntPtr module, IntPtr type, EnumNames proc, IntPtr param);
    [DllImport("kernel32.dll")] static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
    [DllImport("kernel32.dll")] static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
    [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr data);
    [DllImport("kernel32.dll")] static extern uint SizeofResource(IntPtr module, IntPtr resource);
    static byte[] Read(IntPtr module, IntPtr name, int type) {
      IntPtr resource = FindResource(module, name, (IntPtr)type);
      if (resource == IntPtr.Zero) throw new Exception("icon resource missing");
      byte[] bytes = new byte[SizeofResource(module, resource)];
      Marshal.Copy(LockResource(LoadResource(module, resource)), bytes, 0, bytes.Length);
      return bytes;
    }
    // Writes the exe's first icon group (the icon Explorer shows), every size
    // of it, as an .ico file.
    public static void Save(string exe, string ico) {
      IntPtr module = LoadLibraryEx(exe, IntPtr.Zero, 0x22 /* AS_DATAFILE | AS_IMAGE_RESOURCE */);
      if (module == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
      try {
        byte[] group = null;
        EnumResourceNames(module, (IntPtr)14 /* RT_GROUP_ICON */, (m, t, name, p) => {
          group = Read(m, name, 14);
          return false;
        }, IntPtr.Zero);
        if (group == null) throw new Exception("no icon in " + exe);
        int count = BitConverter.ToUInt16(group, 4);
        byte[][] images = new byte[count][];
        for (int i = 0; i < count; i++)
          images[i] = Read(module, (IntPtr)BitConverter.ToUInt16(group, 6 + i * 14 + 12), 3 /* RT_ICON */);
        using (var w = new System.IO.BinaryWriter(System.IO.File.Create(ico))) {
          w.Write(group, 0, 6);
          int offset = 6 + count * 16;
          for (int i = 0; i < count; i++) {
            // The group entry up to the image size, then the size and the
            // image's offset in the file (the group has a resource id there).
            w.Write(group, 6 + i * 14, 8);
            w.Write(images[i].Length);
            w.Write(offset);
            offset += images[i].Length;
          }
          foreach (byte[] image in images) w.Write(image);
        }
      } finally { FreeLibrary(module); }
    }
  }
}
'@

# The shortcut's icon is a copy of T3's: pointing at T3's exe would break
# when an update renames it (switching to Nightly does).
$icon = Join-Path $root 'launcher\t3.ico'
try {
  [T3Latex.IconFile]::Save($t3, $icon)
  $iconLocation = "$icon,0"
} catch {
  Write-Warning "could not copy T3's icon, using its exe: $_"
  $iconLocation = "$t3,0"
}

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in $Destination) {
  $path = Join-Path $dir 'T3 Code (LaTeX).lnk'
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $conhost
  $lnk.Arguments = "--headless cmd.exe /d /c `"$cmd`""
  $lnk.WorkingDirectory = Join-Path $root 'launcher'
  $lnk.IconLocation = $iconLocation
  $lnk.Description = 'T3 Code with LaTeX formula rendering (t3-latex)'
  $lnk.Save()
  [T3Latex.Shortcut]::SetAppUserModelId($path, $appId)
  "created  $path"
}
''
'Done. Quit T3 Code completely (including its tray icon), then open it from "T3 Code (LaTeX)".'
