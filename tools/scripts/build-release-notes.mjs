import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function buildReleaseNotes({
  releaseTag,
  previousTag,
  changes,
  signing,
}) {
  const releaseVersion = releaseTag.replace(/^v/, '');
  const resolvedChanges = changes.length ? changes : ['- No non-merge changes were found for this release.'];
  const changeHeading = previousTag ? `## Changes since ${previousTag}` : `## Changes in ${releaseVersion}`;

  return [
    '## Release summary',
    '',
    `Kaur Khor ${releaseTag} includes the non-merge changes listed below, plus refreshed desktop artifacts and source-build archives from the release workflow.`,
    '',
    '## Downloads',
    '',
    '- macOS: DMG builds for Intel and Apple Silicon',
    '- Windows: NSIS installer for x64',
    '- Linux: AppImage and .deb packages for x64 and arm64',
    '',
    '## Signing status',
    '',
    `- macOS signing: ${yesNo(signing.macSigned)}`,
    `- macOS notarization: ${yesNo(signing.macNotarized)}`,
    `- Windows signing: ${yesNo(signing.windowsSigned)}`,
    '- Linux signing: no (standard unsigned Linux desktop artifacts)',
    '',
    'If a platform shows unsigned, the installer is still published, but the operating system may display extra trust warnings during install.',
    '',
    '## Included files',
    '',
    '- Release artifacts for all supported desktop platforms',
    '- Production source-build archive for local desktop builds, plus versioned and latest-release aliases',
    '- Bundled kaur-khor-desktop-core runtime inside every desktop app package',
    '- SHA256SUMS for every attached asset',
    '',
    changeHeading,
    '',
    ...resolvedChanges,
    '',
  ].join('\n');
}

export function releaseNotesInputsFromEnv(env = process.env) {
  const releaseTag = env.RELEASE_TAG;
  if (!releaseTag) {
    throw new Error('RELEASE_TAG is required.');
  }

  const previousTag = runGit(['describe', '--tags', '--abbrev=0', `${releaseTag}^`, '--match', 'v*.*.*']);
  const logRange = previousTag ? `${previousTag}..${releaseTag}` : releaseTag;
  const changesOutput = runGit(['log', '--no-merges', '--format=- %s (%h)', logRange]);

  return {
    releaseTag,
    previousTag,
    changes: changesOutput ? changesOutput.split('\n') : [],
    signing: {
      macSigned: Boolean(env.CSC_LINK && env.CSC_KEY_PASSWORD),
      macNotarized: Boolean(
        env.CSC_LINK &&
        env.CSC_KEY_PASSWORD &&
        env.APPLE_ID &&
        env.APPLE_APP_SPECIFIC_PASSWORD &&
        env.APPLE_TEAM_ID,
      ),
      windowsSigned: Boolean((env.WIN_CSC_LINK || env.CSC_LINK) && (env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD)),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Usage: node tools/scripts/build-release-notes.mjs <output-path>');
  }

  writeFileSync(outputPath, buildReleaseNotes(releaseNotesInputsFromEnv()));
}
