param([ValidateSet('open','alarm','timer','ring')][string]$Action,[string]$Value)
$ErrorActionPreference='Stop'
if($Action -eq 'open'){
  switch ($Value) {
    'Calculator' { Start-Process 'calculator:' }
    'Notepad' { Start-Process (Join-Path $env:SystemRoot 'System32\notepad.exe') }
    'File Explorer' { Start-Process (Join-Path $env:SystemRoot 'explorer.exe') }
    'Clock' { Start-Process 'ms-clock:' }
    default { throw 'Unsupported application' }
  }
  return
}
$target=[long]$Value
if($Action -eq 'ring'){
  $delay=$target-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if($delay -gt 0){ Start-Sleep -Milliseconds ([int]$delay) }
  [System.Media.SystemSounds]::Exclamation.Play()
  (New-Object -ComObject WScript.Shell).Popup('Time is up.',120,'MyDesk alarm',64) | Out-Null
  return
}
$remaining=$target-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if($remaining -le -1000 -or $remaining -gt 93600000){throw 'Invalid deadline'}
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" ring '+$target
$child=Start-Process (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
if(!$child.Id){throw 'Alarm process did not start'}
