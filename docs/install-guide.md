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

To build from source, inspect the source on the [official GitHub page](https://github.com/Svanny/kaur-khor), then open the Terminal app. The build script detects your platform, bootstraps Node and project build dependencies, and builds a native package. If it must download Node or rustup, it verifies the downloaded toolchain artifact against a pinned SHA-256 digest before extracting or executing it. Copy the code below and paste it inside Terminal:

```sh
curl -L https://github.com/Svanny/kaur-khor/archive/refs/heads/main.tar.gz -o kaur-khor-source.tar.gz
tar -xzf kaur-khor-source.tar.gz
cd kaur-khor-main
./scripts/build-from-source.sh
```

To choose a native build explicitly, pass a platform flag such as `./scripts/build-from-source.sh --platform=linux-x64`. If a requested Node version or rustup target does not have a pinned digest in the source-build scripts, install that toolchain yourself from the official vendor instructions, then rerun the build instead of bypassing verification.

## Windows

Download the `.exe` installer from the latest release. The installer may be unsigned and may trigger SmartScreen. Unsigned does not mean malware, but it does mean Microsoft has not built reputation for this binary.

If Windows shows SmartScreen for an unsigned build:

1. Download only from the official GitHub release.
2. Verify the checksum when `SHA256SUMS` is available.
3. Run the installer.
4. If SmartScreen appears, choose `More info` -> `Run anyway`.

This approves the downloaded app without changing SmartScreen system-wide.

## Linux

For Debian or Ubuntu:

```bash
sudo apt install ./kaur-khor-v<version>-linux-<arch>.deb
```

For AppImage:

```bash
chmod +x kaur-khor-v<version>-linux-<arch>.AppImage
./kaur-khor-v<version>-linux-<arch>.AppImage
```

Replace `<version>` and `<arch>` with the version and architecture from the release you downloaded.

Linux artifacts are not a statement that the binary is trusted by your distribution. Prefer official release assets and checksum verification.
