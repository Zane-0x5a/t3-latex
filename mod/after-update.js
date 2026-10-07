// t3-latex: started by loader.cjs when T3 quits to install an update. Waits
// for the installer to finish, then starts T3 through t3-latex.cmd so the new
// version has math too (the installer would otherwise start it plain).
// t3-latex.cmd looks T3 up anew: the update may have renamed its exe.
//
// Runs on Windows Script Host because it must outlive T3: a console program
// started from T3 either dies with it or, detached, gets no console and quits.
//
//   wscript.exe after-update.js <installer pid> <t3-latex.cmd> <log file>

var args = WScript.Arguments
var pid = args(0)
var cmd = args(1)
var logFile = args(2)
var shell = new ActiveXObject('WScript.Shell')
var fso = new ActiveXObject('Scripting.FileSystemObject')
var wmi = GetObject('winmgmts:root\\cimv2')

function log(text) {
  try {
    var f = fso.OpenTextFile(logFile, 8, true)
    f.WriteLine(new Date().toUTCString() + ' ' + text)
    f.Close()
  } catch (e) {}
}

function running() {
  return wmi.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE ProcessId = ' + pid).Count > 0
}

var waited = 0
while (running() && waited < 30 * 60 * 1000) {
  WScript.Sleep(500)
  waited += 500
}
WScript.Sleep(1000)
log('update finished after ' + Math.round(waited / 1000) + ' s, starting T3 through ' + cmd)
try {
  // Hidden window; the outer quotes keep cmd from stripping the path's own.
  shell.Run('cmd.exe /d /c ""' + cmd + '""', 0, false)
} catch (e) {
  log('could not start ' + cmd + ': ' + e.message)
}
