param(
  [switch]$ConfigureAi
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $Command $($Arguments -join ' ')"
  }
}

function Get-PerfumeDayDatabase {
  $json = & npx wrangler d1 list --json
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to list Cloudflare D1 databases. Run npx wrangler login first.'
  }
  $databases = $json | ConvertFrom-Json
  return $databases | Where-Object { $_.name -eq 'perfumeday' } | Select-Object -First 1
}

function Set-DatabaseId {
  param([Parameter(Mandatory = $true)][string]$DatabaseId)

  $configPath = Join-Path $PSScriptRoot '..\wrangler.jsonc'
  $content = Get-Content -LiteralPath $configPath -Raw
  $pattern = '(?s)("database_name"\s*:\s*"perfumeday"\s*,\s*"database_id"\s*:\s*")[^"]+(\")'
  if (-not [regex]::IsMatch($content, $pattern)) {
    throw 'Could not find the PerfumeDay D1 binding in wrangler.jsonc.'
  }
  $updated = [regex]::Replace($content, $pattern, {
    param($match)
    return $match.Groups[1].Value + $DatabaseId + $match.Groups[2].Value
  }, 1)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($configPath, $updated, $utf8NoBom)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
  Write-Host 'Checking Cloudflare authentication...'
  $identity = & npx wrangler whoami 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $identity -match 'not authenticated') {
    throw 'Cloudflare is not authenticated. Run npx wrangler login, finish the browser sign-in, then rerun npm run provision.'
  }

  $database = Get-PerfumeDayDatabase
  if (-not $database) {
    Write-Host 'Creating the PerfumeDay D1 database in the Asia-Pacific region...'
    Invoke-Checked npx wrangler d1 create perfumeday --location apac
    $database = Get-PerfumeDayDatabase
  }
  if (-not $database -or -not $database.uuid) {
    throw 'The PerfumeDay D1 database exists but its UUID could not be resolved.'
  }

  Write-Host "Using D1 database $($database.uuid)"
  Set-DatabaseId -DatabaseId $database.uuid

  Write-Host 'Running the full verification suite...'
  Invoke-Checked npm run check

  Write-Host 'Applying remote D1 migrations...'
  Invoke-Checked npx wrangler d1 migrations apply perfumeday --remote

  if ($ConfigureAi) {
    Write-Host 'Configuring the optional Anthropic Worker secret...'
    Invoke-Checked npx wrangler secret put ANTHROPIC_API_KEY
  }

  Write-Host 'Deploying PerfumeDay...'
  Invoke-Checked npx wrangler deploy

  Write-Host ''
  Write-Host 'Deployment complete.'
  Write-Host 'Protect the workers.dev route with Cloudflare Access and an Allow policy for your email. A custom hostname can be attached later.'
}
finally {
  Pop-Location
}
