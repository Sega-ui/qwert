' Çift tıkla: komut satırı olmadan uygulamayı başlatır.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "electron.exe bulunamadı: " & exe, 16, "Söz Overlay"
Else
  sh.CurrentDirectory = dir
  sh.Run """" & exe & """ """ & dir & """", 0, False
End If
