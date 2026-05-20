Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$NodeVersion = if ($env:KAUR_KHOR_NODE_VERSION) { $env:KAUR_KHOR_NODE_VERSION } else { "22.21.1" }
$ToolsDir = if ($env:KAUR_KHOR_BUILD_TOOLS_DIR) { $env:KAUR_KHOR_BUILD_TOOLS_DIR } else { Join-Path $HOME ".kaur-khor-build-tools" }

function Resolve-PhysicalPath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $CurrentPath = $Path
  $SeenPaths = @{}
  while ($true) {
    $Item = Get-Item -LiteralPath $CurrentPath -Force
    if ($Item.PSObject.Methods.Name -contains "ResolveLinkTarget") {
      $ResolvedItem = $Item.ResolveLinkTarget($true)
      if ($ResolvedItem) {
        return $ResolvedItem.FullName
      }
    }

    $TargetProperty = $Item.PSObject.Properties["Target"]
    if (-not $TargetProperty -or -not $TargetProperty.Value) {
      return $Item.FullName
    }

    $ItemPath = $Item.FullName.ToLowerInvariant()
    if ($SeenPaths.ContainsKey($ItemPath)) {
      throw "Refusing to resolve circular Kaur Khor source-build path: $Item.FullName"
    }
    $SeenPaths[$ItemPath] = $true

    $Target = @($TargetProperty.Value)[0]
    if (-not [System.IO.Path]::IsPathRooted($Target)) {
      $TargetBase = [System.IO.Path]::GetDirectoryName($Item.FullName)
      $Target = Join-Path $TargetBase $Target
    }
    $CurrentPath = $Target
  }
}

$ScriptDir = Resolve-PhysicalPath $PSScriptRoot

function Get-ExpectedNodeSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Version,
    [Parameter(Mandatory = $true)]
    [string] $NodePlatform
  )

  switch ("${Version}:${NodePlatform}") {
    "22.21.1:win-x64" { return "3c624e9fbe07e3217552ec52a0f84e2bdc2e6ffa7348f3fdfb9fbf8f42e23fcf" }
    default { return "" }
  }
}

function Install-LocalNode {
  if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64" -and $env:PROCESSOR_ARCHITEW6432 -ne "AMD64") {
    throw "Unsupported Windows architecture for automatic Node bootstrap: $env:PROCESSOR_ARCHITECTURE. Kaur Khor source builds currently support Windows x64."
  }

  $NodePlatform = "win-x64"
  $ArchiveName = "node-v${NodeVersion}-${NodePlatform}.zip"
  $ArchiveUrl = "https://nodejs.org/dist/v${NodeVersion}/${ArchiveName}"
  $ExpectedSha256 = Get-ExpectedNodeSha256 -Version $NodeVersion -NodePlatform $NodePlatform
  if (-not $ExpectedSha256) {
    throw "No pinned SHA-256 digest for ${ArchiveName}. Refusing automatic Node bootstrap."
  }

  $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "kaur-khor-node-bootstrap-$PID"
  $ArchivePath = Join-Path $TempDir $ArchiveName
  New-Item -ItemType Directory -Force -Path $TempDir, $ToolsDir | Out-Null

  [Console]::Error.WriteLine("Installing local Node ${NodeVersion} for Kaur Khor source build...")
  Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath

  $ActualSha256 = (Get-FileHash -Algorithm SHA256 -Path $ArchivePath).Hash.ToLowerInvariant()
  if ($ActualSha256 -ne $ExpectedSha256) {
    throw "SHA-256 mismatch for ${ArchiveName}. Expected ${ExpectedSha256}, got ${ActualSha256}. Refusing to extract it."
  }

  Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force
  Remove-Item -Force $ArchivePath
  $LocalNodeRoot = Join-Path $ToolsDir "node-v${NodeVersion}"
  $ExtractedNodeRoot = Join-Path $TempDir "node-v${NodeVersion}-${NodePlatform}"
  if (Test-Path $LocalNodeRoot) {
    Remove-Item -Recurse -Force $LocalNodeRoot
  }
  Move-Item -Path $ExtractedNodeRoot -Destination $LocalNodeRoot
  Remove-Item -Recurse -Force $TempDir
}

function Find-Node {
  $CommandNode = Get-Command node -ErrorAction SilentlyContinue
  if ($CommandNode) {
    return $CommandNode.Source
  }

  $LocalNode = Join-Path $ToolsDir "node-v${NodeVersion}\node.exe"
  if (Test-Path $LocalNode) {
    return $LocalNode
  }

  Install-LocalNode
  if (Test-Path $LocalNode) {
    return $LocalNode
  }

  throw "Node bootstrap failed. Expected ${LocalNode}."
}

$NodeCommand = Find-Node
& $NodeCommand (Join-Path $ScriptDir "build-from-source.mjs") @args
exit $LASTEXITCODE
