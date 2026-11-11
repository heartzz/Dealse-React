$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiEnvPath = Join-Path $repoRoot "apps/api/.env"
$pgBin = "C:\Program Files\PostgreSQL\18\bin"
$psql = Join-Path $pgBin "psql.exe"
$pgIsReady = Join-Path $pgBin "pg_isready.exe"
$postgisControl = "C:\Program Files\PostgreSQL\18\share\extension\postgis.control"
$appRole = "dealse_dev_app"
$databaseName = "dealse_dev"
$temporarySqlPath = Join-Path $env:TEMP ("dealse-role-" + [Guid]::NewGuid().ToString("N") + ".sql")
$originalPath = $env:PATH
$securePassword = $null
$passwordPointer = [IntPtr]::Zero
$adminPassword = $null
$appPassword = $null

try {
  if (-not (Test-Path -LiteralPath $psql) -or -not (Test-Path -LiteralPath $pgIsReady)) {
    throw "PostgreSQL 18 command-line tools were not found at the expected install path."
  }

  if (-not (Test-Path -LiteralPath $postgisControl)) {
    throw "PostGIS is not installed in the PostgreSQL 18 extension directory."
  }

  if (Test-Path -LiteralPath $apiEnvPath) {
    throw "apps/api/.env already exists. It was left untouched; review it before continuing."
  }

  & git -C $repoRoot check-ignore -q "apps/api/.env"
  if ($LASTEXITCODE -ne 0) {
    throw "apps/api/.env is not gitignored. Add the ignore rule before storing DATABASE_URL."
  }

  $service = Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue
  if (-not $service -or $service.Status -ne "Running") {
    throw "The PostgreSQL 18 service is not running. Start it, then rerun this setup."
  }

  & $pgIsReady -h 127.0.0.1 -p 5432 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL is not accepting connections on 127.0.0.1:5432."
  }

  $securePassword = Read-Host "Enter the PostgreSQL superuser password for role 'postgres' (input is hidden)" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:PGPASSWORD = $adminPassword

  $identity = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -Atc "SELECT current_user"
  if ($LASTEXITCODE -ne 0 -or $identity -ne "postgres") {
    throw "Could not authenticate to PostgreSQL as the 'postgres' superuser. No database changes were made."
  }
  Write-Output "Authenticated to PostgreSQL as postgres."

  $postgisAvailable = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -Atc "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis')"
  if ($LASTEXITCODE -ne 0 -or $postgisAvailable -ne "t") {
    throw "PostGIS is not available to this PostgreSQL server. No database changes were made."
  }
  Write-Output "PostGIS is available."

  $databaseExists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -Atc "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$databaseName')"
  if ($LASTEXITCODE -ne 0) { throw "Could not check whether the target database exists." }
  if ($databaseExists -eq "t") {
    throw "Database dealse_dev already exists. It was not modified; review it before continuing."
  }

  $roleExists = & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -Atc "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$appRole')"
  if ($LASTEXITCODE -ne 0) { throw "Could not check whether the dedicated app role exists." }
  if ($roleExists -eq "t") {
    throw "Role dealse_dev_app already exists. It was not modified; review it before continuing."
  }

  $randomBytes = New-Object byte[] 32
  $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $randomGenerator.GetBytes($randomBytes) } finally { $randomGenerator.Dispose() }
  $appPassword = [Convert]::ToBase64String($randomBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  [Array]::Clear($randomBytes, 0, $randomBytes.Length)

  $escapedPassword = $appPassword.Replace("'", "''")
  [IO.File]::WriteAllText($temporarySqlPath, "CREATE ROLE dealse_dev_app LOGIN PASSWORD '$escapedPassword';", [Text.Encoding]::ASCII)
  & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -v ON_ERROR_STOP=1 -f $temporarySqlPath | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not create the dedicated local application role." }

  & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -v ON_ERROR_STOP=1 -c "CREATE DATABASE dealse_dev OWNER dealse_dev_app;" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not create the dealse_dev database." }
  Write-Output "Created database dealse_dev and dedicated app role."

  & $psql -X -h 127.0.0.1 -p 5432 -U postgres -d dealse_dev -w -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;" | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Could not enable PostGIS in dealse_dev." }

  $databaseUrl = "postgresql://dealse_dev_app:$appPassword@127.0.0.1:5432/dealse_dev?schema=public"
  [IO.Directory]::CreateDirectory((Split-Path -Parent $apiEnvPath)) | Out-Null
  [IO.File]::WriteAllText($apiEnvPath, "DATABASE_URL=$databaseUrl`n", [Text.UTF8Encoding]::new($false))
  Write-Output "Saved DATABASE_URL in the gitignored apps/api/.env."

  $nodeBin = "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  if (Test-Path -LiteralPath (Join-Path $nodeBin "node.exe")) {
    $env:PATH = "$nodeBin;$env:PATH"
  }
  Push-Location $repoRoot
  try {
    & pnpm --filter @dealse/api db:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw "The existing Prisma migrations failed. The database and local env file are preserved for diagnosis." }
  } finally {
    Pop-Location
  }

  $env:PGPASSWORD = $appPassword
  $verification = & $psql -X -h 127.0.0.1 -p 5432 -U dealse_dev_app -d dealse_dev -w -v ON_ERROR_STOP=1 -Atc "SELECT current_database(), current_user; SELECT PostGIS_Full_Version(); SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
  if ($LASTEXITCODE -ne 0) { throw "Post-migration connectivity or PostGIS verification failed." }
  Write-Output "Database, application-role connection, PostGIS, and migration verification succeeded:"
  $verification | ForEach-Object { Write-Output $_ }
} finally {
  Remove-Item -LiteralPath $temporarySqlPath -Force -ErrorAction SilentlyContinue
  $env:PGPASSWORD = $null
  $env:PATH = $originalPath
  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  $adminPassword = $null
  $appPassword = $null
  $securePassword = $null
}
