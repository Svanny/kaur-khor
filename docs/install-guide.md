# Install guide

Use official release assets from [GitHub Releases](https://github.com/Svanny/kaur-khor/releases/latest). Each release should include platform artifacts and a `SHA256SUMS` file. Desktop artifacts use the `kaur-khor-v<version>-<os>-<arch>.<ext>` naming scheme, where `<arch>` is `x64` or `arm64`.

The browser app at <https://svanny.github.io/kaur-khor/app> is useful when OPFS storage is available, but it is not the full desktop runtime. On Android, iPhone, and iPad, open that browser app and use the browser menu or Safari Share sheet to add Kaur Khor to the home screen. The installed web app starts in the same local browser workspace, supports portrait and landscape orientation, and keeps phone portrait users in the operator shell for Today, Queue, Capture, Products, Insights, and workspace safety actions. Browser Telegram automation only polls while the app is open and awake, benchmark/dev diagnostics are desktop-only, and browser data lives in the current browser profile. Install the desktop app for persistent Telegram automation, native backups/snapshots, folder reveal, logs, image assets, and benchmark runner diagnostics.

## Safety rules

- Do not disable Gatekeeper globally on macOS.
- Do not disable SmartScreen globally on Windows.
- Do not strip quarantine attributes from downloaded macOS apps to force a launch.
- Prefer official release artifacts and verify checksums before running downloaded files.
- Treat this repository as open source licensed under `GPL-2.0-only`.

## macOS

Download the `.dmg` for your Mac architecture from the latest release.

The DMG may be unsigned or not notarized. That means Apple has not verified this binary. Only proceed if you downloaded it from the official GitHub release and the checksum matches.

Approved flow:

1. Download only from the official GitHub release.
2. Verify the checksum when `SHA256SUMS` is available.
3. Open the DMG.
4. Drag Kaur Khor to Applications if the DMG shows that layout.
5. `Control`-click or right-click Kaur Khor.
6. Choose `Open`.
7. Confirm `Open`.
8. If blocked, open `System Settings` -> `Privacy & Security` -> `Open Anyway`.
9. If you need a walkthrough, use this [YouTube tutorial for opening macOS app from unidentified developer](https://youtu.be/sLox8h-6BVw).

Do not disable Gatekeeper globally. Do not run copies from mirrors or reposts.

To build from source, inspect the source on the [official GitHub page](https://github.com/Svanny/kaur-khor), then open the Terminal app. The release source-build archive is production-focused and excludes developer docs, benchmarks, tests, screenshots, and sample product photos. The build script detects your platform, bootstraps Node and project build dependencies, and builds a native package. If it must download Node or rustup, it verifies the downloaded toolchain artifact against a pinned SHA-256 digest before extracting or executing it. If it finds an older Cargo, it updates Rust stable with rustup before building. Copy the code below and paste it inside Terminal on macOS or Linux:

```sh
curl -L https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz -o kaur-khor-latest-source-build.tar.gz
curl -L https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz.sha256 -o kaur-khor-latest-source-build.tar.gz.sha256
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c kaur-khor-latest-source-build.tar.gz.sha256
else
  shasum -a 256 -c kaur-khor-latest-source-build.tar.gz.sha256
fi
tar -xzf kaur-khor-latest-source-build.tar.gz
rm kaur-khor-latest-source-build.tar.gz kaur-khor-latest-source-build.tar.gz.sha256
cd kaur-khor-*-source-build
./scripts/build-from-source.sh --update
```

The update script keeps extracted source-build folders under a stable
`kaur-khor/` folder beside the downloaded archive, with each release in its own
versioned child folder such as `kaur-khor/kaur-khor-v0.5.2-source-build`. After
a successful update, it asks whether to keep previous source-build versions or
delete the older version folders. The prompt only applies to those source-build
folders; it does not delete workspace data.

The update script opens the system folder picker for a pre-update snapshot
export before replacing an installed app. If no existing Kaur Khor data
directory is present, it skips that export because there is nothing to back up.
Settings / Updates also defaults to the latest source-build release, lets you
choose a specific release version, verifies the downloaded source-build archive
against the release `.sha256` file before extracting it, and starts the updater
only after Kaur Khor accepts the quit handoff. If your workspace data lives in a
custom folder, pass
`--data-dir=/path/to/your/kaur-khor-data` or use Settings / Updates in the
desktop app to choose the folder. After installing the new version, restore the
exported snapshot from Settings / Local data if you need to rehydrate from that
custom location.

After a source build, the script opens the nested runnable-app folder under the versioned folder's `release/` directory when the platform emits one, such as `kaur-khor/kaur-khor-v0.5.2-source-build/release/mac-arm64` on Apple Silicon Macs.

To choose a native build explicitly, pass a platform flag such as `./scripts/build-from-source.sh --platform=linux-x64`. If a requested Node version or rustup target does not have a pinned digest in the source-build scripts, install that toolchain yourself from the official vendor instructions, then rerun the build instead of bypassing verification.

## Windows

Download the `.exe` installer from the latest release. The installer may be unsigned and may trigger SmartScreen. Unsigned does not mean malware, but it does mean Microsoft has not built reputation for this binary.

If Windows shows SmartScreen for an unsigned build:

1. Download only from the official GitHub release.
2. Verify the checksum when `SHA256SUMS` is available.
3. Run the installer.
4. If SmartScreen appears, choose `More info` -> `Run anyway`.

This approves the downloaded app without changing SmartScreen system-wide.

To build from source on Windows, use PowerShell-native commands. PowerShell aliases `curl` to `Invoke-WebRequest`, so `curl -L` will fail there. The bootstrap script installs a local pinned Node.js if `node` is not already available, updates old Rust stable toolchains through rustup, then installs the remaining build dependencies:

```powershell
Invoke-WebRequest -Uri "https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz" -OutFile "kaur-khor-latest-source-build.tar.gz"
Invoke-WebRequest -Uri "https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz.sha256" -OutFile "kaur-khor-latest-source-build.tar.gz.sha256"
$expectedHash = (Get-Content "kaur-khor-latest-source-build.tar.gz.sha256").Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 -Path "kaur-khor-latest-source-build.tar.gz").Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw "SHA-256 mismatch for Kaur Khor source-build archive." }
tar -xzf "kaur-khor-latest-source-build.tar.gz"
Remove-Item -Path "kaur-khor-latest-source-build.tar.gz", "kaur-khor-latest-source-build.tar.gz.sha256"
Set-Location "kaur-khor-*-source-build"
.\scripts\build-from-source.ps1 --update
```

After a successful Windows source build, the script opens the generated setup installer from `release\`. Complete that installer to register the app with Windows instead of launching `release\win-unpacked` directly.

For a manual local-only unsigned Windows package, use PowerShell environment syntax. This uses a standalone unsigned-only app-icon stamping step, skips `.exe` signing, and avoids electron-builder's bundled signing-tool extraction path that requires symlink privileges on some Windows setups:

```powershell
$env:ALLOW_UNSIGNED_PACKAGING="1"; pnpm package:win:native
```

## Linux

For Debian or Ubuntu:

```bash
sudo apt install ./kaur-khor-v<version>-linux-<arch>.deb
```

When building from source on Debian or Ubuntu, the Linux packaging script installs the generated `.deb` automatically after packaging with `apt-get install --reinstall`, so repeated local builds replace the installed app even when the version number has not changed. If automatic install fails, it opens `release/` so you can install the `.deb` or run the AppImage manually.

Linux desktop builds disable Electron hardware acceleration at startup to avoid black windows on VM or Wayland GPU stacks that cannot provide the requested EGL context.

For AppImage:

```bash
chmod +x kaur-khor-v<version>-linux-<arch>.AppImage
./kaur-khor-v<version>-linux-<arch>.AppImage
```

Replace `<version>` and `<arch>` with the version and architecture from the release you downloaded.

Linux artifacts are not a statement that the binary is trusted by your distribution. Prefer official release assets and checksum verification.
