Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "C:\xampp\htdocs\daha-bi"
objShell.Run """C:\xampp\php\php.exe"" artisan schedule:run", 0, True
