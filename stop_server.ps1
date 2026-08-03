$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path (Join-Path $repoRoot '.runtime') 'fintrack-server.json'

if (-not (Test-Path -LiteralPath $stateFile)) {
    Write-Error 'FinTrack server state was not found; no process was stopped.'
    exit 1
}

$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$processId = [int]$state.pid
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if (-not $process) {
    Remove-Item -LiteralPath $stateFile
    Write-Error "The recorded FinTrack process $processId is no longer running. Stale state was removed."
    exit 1
}

$expectedPython = [System.IO.Path]::GetFullPath([string]$state.python)
$actualPython = if ($process.Path) { [System.IO.Path]::GetFullPath($process.Path) } else { '' }
$recordedStart = [DateTimeOffset]::Parse([string]$state.startedAt).LocalDateTime
$startDifference = [Math]::Abs(($process.StartTime - $recordedStart).TotalSeconds)
$isFinTrack = $actualPython -eq $expectedPython -and $startDifference -lt 10

if (-not $isFinTrack) {
    Write-Error "PID $processId does not match the recorded FinTrack server. Nothing was stopped."
    exit 1
}

Stop-Process -Id $processId -Force
Remove-Item -LiteralPath $stateFile
Write-Host "FinTrack server stopped (PID $processId)."
