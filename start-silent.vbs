' EKONI SQL Studio - Portable Silent Launcher (No Console Popup)
Option Explicit
Dim fso, sh, appDir, nodeExe, serverJs
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

If WScript.Arguments.Count > 0 Then
  appDir = WScript.Arguments(0)
Else
  appDir = fso.GetParentFolderName(WScript.ScriptFullName)
End If

serverJs = fso.BuildPath(appDir, "server.js")
nodeExe = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then
  nodeExe = "node.exe"
End If

If fso.FileExists(serverJs) Then
  sh.CurrentDirectory = appDir
  sh.Run """" & nodeExe & """ """ & serverJs & """", 0, False
End If
