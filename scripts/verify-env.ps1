# PHASE 01 environment gate (PowerShell / native Windows).
# Exit 0 only when the toolchain meets minimums and both data-tier containers are healthy.
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI.
$ErrorActionPreference = 'Continue'
$RootDir = Split-Path -Parent $PSScriptRoot
$failed = $false

function Pass([string]$msg) { Write-Host "  [ OK ] $msg" }
function Fail([string]$msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:failed = $true }

function Get-ToolVersion([string]$Command, [string[]]$CommandArgs) {
  $raw = & $Command @CommandArgs 2>&1 | Out-String
  if ($raw -match '(\d+\.\d+(?:\.\d+)?)') { return $Matches[1] }
  return $null
}

function Version-Ge([string]$actual, [int]$minMajor, [int]$minMinor = 0) {
  if (-not $actual) { return $false }
  $parts = $actual.Split('.')
  $major = [int]$parts[0]
  $minor = if ($parts.Count -gt 1) { [int]$parts[1] } else { 0 }
  return ($major -gt $minMajor) -or ($major -eq $minMajor -and $minor -ge $minMinor)
}

Write-Host 'TradeSense AI - environment verification'
Write-Host ''
Write-Host 'Toolchain (minimums: Node 20, npm 10, Python 3.11):'

$nodeVer = Get-ToolVersion 'node' @('--version')
if (Version-Ge $nodeVer 20) { Pass "Node $nodeVer >= 20" } else { Fail "Node '$nodeVer' below 20" }

$npmVer = Get-ToolVersion 'npm' @('--version')
if (Version-Ge $npmVer 10) { Pass "npm $npmVer >= 10" } else { Fail "npm '$npmVer' below 10" }

$pyVer = Get-ToolVersion 'python' @('--version')
if (-not $pyVer) { $pyVer = Get-ToolVersion 'python3' @('--version') }
if (Version-Ge $pyVer 3 11) { Pass "Python $pyVer >= 3.11" } else { Fail "Python '$pyVer' below 3.11" }

$dockerVer = Get-ToolVersion 'docker' @('--version')
if ($dockerVer) { Pass "Docker $dockerVer" } else { Fail 'docker not found on PATH' }

$composeRaw = & docker compose version 2>&1 | Select-Object -First 1
if ($composeRaw) { Pass "docker compose - $composeRaw" } else { Fail 'docker compose plugin unavailable' }

$gitVer = Get-ToolVersion 'git' @('--version')
if ($gitVer) { Pass "git $gitVer" } else { Fail 'git not found on PATH' }

Write-Host ''
Write-Host 'Environment files:'
foreach ($file in @('.env.example', '.env.local', '.env.test')) {
  if (Test-Path (Join-Path $RootDir $file)) { Pass "$file present" } else { Fail "$file missing" }
}

Write-Host ''
Write-Host 'Application ports (3000 / 4000 / 8000 must be free):'
foreach ($port in @(3000, 4000, 8000)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) { Fail "port $port in use" } else { Pass "port $port free" }
}

Write-Host ''
Write-Host 'Data-tier containers:'
foreach ($entry in @(@('postgres', 'tradesense-postgres'), @('redis', 'tradesense-redis'))) {
  $svc = $entry[0]; $name = $entry[1]
  $raw = & docker inspect $name 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $raw) { Fail "$svc ($name) missing"; continue }
  $info = ($raw | Out-String | ConvertFrom-Json)[0]
  if ($info.State.Running -and $info.State.Health.Status -eq 'healthy') {
    Pass "$svc ($name) running and healthy"
  } else {
    Fail "$svc ($name) running=$($info.State.Running) health=$($info.State.Health.Status)"
  }
}

Write-Host ''
if (-not $failed) {
  Write-Host 'Environment verified: all checks passed.' -ForegroundColor Green
  exit 0
}
Write-Host 'Environment verification FAILED.' -ForegroundColor Red
exit 1
