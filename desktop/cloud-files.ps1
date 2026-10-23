$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ReaderCloud {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFileAttributesW(string path);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr sa,uint creation,uint flags,IntPtr template);
  [DllImport("cldapi.dll")] static extern int CfGetPlaceholderInfo(SafeFileHandle handle,int kind,IntPtr buffer,uint size,out uint returned);
  [DllImport("cldapi.dll", CharSet=CharSet.Unicode)] static extern int CfOpenFileWithOplock(string path,uint flags,out IntPtr handle);
  [DllImport("cldapi.dll")] static extern void CfCloseHandle(IntPtr handle);
  [DllImport("cldapi.dll")] static extern int CfDehydratePlaceholder(IntPtr handle,long offset,long length,uint flags,IntPtr overlapped);
  [DllImport("cldapi.dll")] static extern int CfSetPinState(IntPtr handle,int state,uint flags,IntPtr overlapped);
  public class Status { public string state; public bool supported; public bool synced; public bool pinned; public long bytes; public string error; }
  public static Status Inspect(string path) {
    var s=new Status(); var a=GetFileAttributesW(path);
    if(a==0xffffffff){s.state="missing";s.error=new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()).Message;return s;}
    s.bytes=new FileInfo(path).Length; s.state="local";
    using(var h=CreateFileW(path,0x80,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero)) {
      if(h.IsInvalid) return s;
      var b=Marshal.AllocHGlobal(65536);
      try {uint n;var hr=CfGetPlaceholderInfo(h,0,b,65536,out n);if(hr<0)return s;
        s.supported=true;s.pinned=Marshal.ReadInt32(b,0)==1;s.synced=Marshal.ReadInt32(b,4)==1;
        s.state=(a & (0x1000|0x400000|0x40000))!=0 ? "cloud" : "downloaded";
      }finally{Marshal.FreeHGlobal(b);}
    }
    return s;
  }
  public static Status Change(string path,string action,bool pin) {
    var s=Inspect(path);if(!s.supported)throw new Exception("此文件不是支持按需下载的云占位文件；请在云盘客户端管理本地空间");
    if(action=="release" && s.state=="cloud")return s;
    if(action=="release" && (!s.synced||s.pinned))throw new Exception(s.pinned?"此文件已在云盘客户端固定离线，请先取消固定":"云盘尚未确认文件已同步，暂不释放");
    IntPtr h;var hr=CfOpenFileWithOplock(path,3,out h);if(hr<0)Marshal.ThrowExceptionForHR(hr);
    try{
      hr=action=="pin"?CfSetPinState(h,pin?1:2,0,IntPtr.Zero):CfDehydratePlaceholder(h,0,-1,0,IntPtr.Zero);
      if(hr<0)Marshal.ThrowExceptionForHR(hr);
    }finally{CfCloseHandle(h);}
    return Inspect(path);
  }
}
'@
while ($null -ne ($line = [Console]::ReadLine())) {
  try {
    $request = $line | ConvertFrom-Json
    if ($request.action -eq 'inspect') {
      $result = @($request.files | ForEach-Object {
        try { @{ id=$_.id; status=[ReaderCloud]::Inspect($_.path) } }
        catch { @{ id=$_.id; status=@{state='unknown';supported=$false;error=$_.Exception.Message} } }
      })
    } else { $result = [ReaderCloud]::Change($request.path,$request.action,[bool]$request.pin) }
    @{ id=$request.id; result=$result } | ConvertTo-Json -Depth 8 -Compress | ForEach-Object { [Console]::WriteLine($_) }
  } catch { @{ id=$request.id; error=$_.Exception.Message } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) } }
}
