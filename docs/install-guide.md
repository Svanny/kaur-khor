# Install guide

Use official release assets from [GitHub Releases](https://github.com/Svanny/banji/releases/latest). Each release should include platform artifacts and a `SHA256SUMS` file.

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
4. Drag Banji to Applications if the DMG shows that layout.
5. `Control`-click or right-click Banji.
6. Choose `Open`.
7. Confirm `Open`.
8. If blocked, open `System Settings` -> `Privacy & Security` -> `Open Anyway`.

Do not disable Gatekeeper globally. Do not run copies from mirrors or reposts.

To build from source on macOS:

```bash
bash scripts/build-mac-from-source.sh
```

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
sudo apt install ./banji-<version>-linux-<arch>.deb
```

For AppImage:

```bash
chmod +x banji-<version>-linux-<arch>.AppImage
./banji-<version>-linux-<arch>.AppImage
```

Replace `<version>` and `<arch>` with the version and architecture from the release you downloaded.

Linux artifacts are not a statement that the binary is trusted by your distribution. Prefer official release assets and checksum verification.
