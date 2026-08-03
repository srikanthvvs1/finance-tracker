$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $repoRoot '.runtime'
$stateFile = Join-Path $runtimeDir 'fintrack-server.json'
$port = 5000

function Test-FinTrackPort {
    param([int]$Port)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($result)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (Test-FinTrackPort -Port $port) {
    Write-Error "FinTrack was not started because port $port is already in use."
    exit 1
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$pythonCommand = Get-Command python -ErrorAction Stop
# Resolve the interpreter behind Windows' python.exe App Execution Alias. If
# the alias path is launched directly it creates a child pythonw process, which
# makes the recorded PID different from the process listening on port 5000.
$resolvedPython = (& $pythonCommand.Source -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1)
$pythonPath = if ($resolvedPython -and (Test-Path -LiteralPath $resolvedPython.Trim())) {
    $resolvedPython.Trim()
} else {
    $pythonCommand.Source
}
$pythonwPath = Join-Path (Split-Path $pythonPath -Parent) 'pythonw.exe'
$serverPythonPath = if (Test-Path -LiteralPath $pythonwPath) { $pythonwPath } else { $pythonPath }
$process = Start-Process -FilePath $serverPythonPath -ArgumentList @('server.py') `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) { break }
    if (Test-FinTrackPort -Port $port) { $ready = $true; break }
}

if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    Write-Error 'FinTrack did not start. Run python server.py in this folder to inspect the startup error.'
    exit 1
}

@{
    pid = $process.Id
    port = $port
    python = $serverPythonPath
    startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

Write-Host "FinTrack started on http://127.0.0.1:$port (PID $($process.Id))."
exit 0
