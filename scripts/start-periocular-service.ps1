$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServiceDir = Join-Path $RepoRoot "services\periocular-onnx"
$VenvPython = Join-Path $ServiceDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Missing Python virtualenv at $VenvPython. Please create services/periocular-onnx/.venv and install dependencies."
    exit 1
}

Push-Location $RepoRoot
try {
    & $VenvPython -m uvicorn server:app --app-dir $ServiceDir --host 127.0.0.1 --port 8002 --log-level warning
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
