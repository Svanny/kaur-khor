#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

findings=0

fail() {
  findings=$((findings + 1))
  echo "[platform-check] FAIL: $1"
}

pass() {
  echo "[platform-check] PASS: $1"
}

ANDROID_GRADLE="android/app/build.gradle.kts"
ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"
IOS_INFO="ios/Runner/Info.plist"
MACOS_RELEASE_ENTITLEMENTS="macos/Runner/Release.entitlements"
WEB_INDEX="web/index.html"

if grep -q 'signingConfig = signingConfigs.getByName("debug")' "$ANDROID_GRADLE"; then
  fail "Android release build uses debug signing config"
else
  pass "Android release build does not use debug signing config"
fi

if grep -q 'applicationId = "com\.example\.' "$ANDROID_GRADLE"; then
  fail "Android applicationId still uses com.example.*"
else
  pass "Android applicationId is not com.example.*"
fi

if grep -q 'android:allowBackup="false"' "$ANDROID_MANIFEST"; then
  pass "Android manifest disables app data backup"
else
  fail "Android manifest must set android:allowBackup=\"false\""
fi

if grep -q 'android:usesCleartextTraffic="false"' "$ANDROID_MANIFEST"; then
  pass "Android manifest disables cleartext traffic"
else
  fail "Android manifest must set android:usesCleartextTraffic=\"false\""
fi

if grep -q 'NSAllowsArbitraryLoads' "$IOS_INFO"; then
  fail "iOS Info.plist contains NSAllowsArbitraryLoads"
else
  pass "iOS Info.plist does not weaken ATS"
fi

if grep -q 'com.apple.security.network.server' "$MACOS_RELEASE_ENTITLEMENTS"; then
  fail "macOS release entitlements include network server capability"
else
  pass "macOS release entitlements are minimal"
fi

if grep -qi 'Content-Security-Policy' "$WEB_INDEX"; then
  pass "Web index defines a Content-Security-Policy"
else
  fail "Web index is missing Content-Security-Policy"
fi

if [[ "$findings" -gt 0 ]]; then
  echo "[platform-check] FAILED: $findings issue(s)"
  exit 1
fi

echo "[platform-check] PASSED"
