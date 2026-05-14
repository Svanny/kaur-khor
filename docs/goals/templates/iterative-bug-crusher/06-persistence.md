# Persistence

## Audit Target

Find issues in local storage, SQLite persistence, backups, restores, snapshots, reloads, and app restarts.

## Inspect

- Desktop userData boundaries, browser storage fallbacks, checkpoint files, import/export, and migration-like compatibility paths.
- Fresh, generated, and organically updated workspaces.

## Real Finding Criteria

The issue can lose data, restore wrong data, persist invalid data, fail reload/restart, or mix app install files with user data.

## Fix Constraints

Preserve backward compatibility with existing user data unless a migration is explicitly implemented and verified.

## Verification Required

Run persistence-focused tests or manual reload/restart checks. Record data before and after the persistence boundary in the item notes.
