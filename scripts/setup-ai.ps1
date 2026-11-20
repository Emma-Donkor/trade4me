# PHASE 01: Windows/PowerShell bootstrap for the apps/ai-engine virtualenv.
# PHASE 02 adds requirements.txt; install it with:
#   apps\ai-engine\.venv\Scripts\python.exe -m pip install -r apps\ai-engine\requirements.txt
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$AiDir = Join-Path $RootDir 'apps/ai-engine'
$VenvDir = Join-Path $AiDir '.venv'

$Py = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
if (-not (Get-Command $Py -ErrorAction SilentlyContinue)) { $Py = 'python3' }

New-Item -ItemType Directory -Force -Path $AiDir | Out-Null
if (-not (Test-Path $VenvDir)) {
  Write-Host "Creating Python virtualenv at $VenvDir"
  & $Py -m venv $VenvDir
} else {
  Write-Host "Virtualenv already exists at $VenvDir"
}

$VenvPy = Join-Path $VenvDir 'Scripts/python.exe'
if (-not (Test-Path $VenvPy)) { $VenvPy = Join-Path $VenvDir 'bin/python' }
if (-not (Test-Path $VenvPy)) { throw "Python interpreter not found in $VenvDir" }

& $VenvPy -m pip --version
& $VenvPy -c "import sys; print('Python venv ready:', sys.version.split()[0])"
