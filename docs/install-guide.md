# Install guide

Use official release assets from [GitHub Releases](https://github.com/Svanny/kaur-khor/releases/latest). Each release should include platform artifacts and a `SHA256SUMS` file. Desktop artifacts use the `kaur-khor-v<version>-<os>-<arch>.<ext>` naming scheme, where `<arch>` is `x64` or `arm64`.

The browser app at <https://svanny.github.io/kaur-khor/app> is useful when OPFS storage is available, but it is not the full desktop runtime. Browser Telegram automation only polls while the tab is open and awake, benchmark/dev diagnostics are desktop-only, and browser data lives in the current browser profile. Install the desktop app for persistent Telegram automation, native backups/snapshots, folder reveal, logs, image assets, and benchmark runner diagnostics.

## Safety rules

- Do not disable Gatekeeper globally on macOS.
- Do not disable SmartScreen globally on Windows.
- Do not strip quarantine attributes from downloaded macOS apps to force a launch.
- Prefer official release artifacts and verify checksums before running downloaded files.
- Treat this repository as source-visible, not open source licensed, while `package.json` declares `UNLICENSED`.

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

To build from source, inspect the source on the [official GitHub page](https://github.com/Svanny/kaur-khor), then open the Terminal app. The build script detects your platform, bootstraps Node and project build dependencies, and builds a native package. If it must download Node or rustup, it verifies the downloaded toolchain artifact against a pinned SHA-256 digest before extracting or executing it. If it finds an older Cargo, it updates Rust stable with rustup before building. Copy the code below and paste it inside Terminal on macOS or Linux:

```sh
curl -L https://github.com/Svanny/kaur-khor/archive/refs/heads/main.tar.gz -o kaur-khor-source.tar.gz
tar -xzf kaur-khor-source.tar.gz
rm kaur-khor-source.tar.gz
cd kaur-khor-main
./scripts/build-from-source.sh
```

After a source build, the script opens the nested runnable-app folder under `release/` when the platform emits one, such as `release/mac-arm64` on Apple Silicon Macs.

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
Invoke-WebRequest -Uri "https://github.com/Svanny/kaur-khor/archive/refs/heads/main.zip" -OutFile "kaur-khor-source.zip"
Expand-Archive -Path "kaur-khor-source.zip" -DestinationPath "."
Remove-Item -Path "kaur-khor-source.zip"
Set-Location "kaur-khor-main"
.\scripts\build-from-source.ps1
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
