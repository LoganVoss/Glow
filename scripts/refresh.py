#!/usr/bin/python3
"""Prepare Glow for a reviewed Codex version, then wait for a manual app quit.

Never stops or launches an app, changes updater settings, or relaxes signature,
source-pin, baseline, or recovery checks. Unknown Codex versions require review.
"""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import uuid

import install as installer

ROOT = Path(__file__).resolve().parent.parent
PINS = ROOT / 'scripts/source-pins.json'
ASSETS = ('src/glow.css', 'src/settings.css', 'src/neon-codex.js',
          'src/preferences.js', 'src/glow-layer.js')
MAX_ATTEMPTS = 3


def version_key(value):
    return f"{value.get('version')}:{value.get('build')}"


def reviewed_snapshot():
    value = installer.snapshot(installer.APP)
    if value.get('bundleIdentifier') != 'com.openai.codex':
        raise RuntimeError('Expected the Codex app bundle identity.')
    installer.require_certificate(value, 'Installed app')
    pins = json.loads(PINS.read_text())
    key = version_key(value)
    pin = pins.get(key)
    if not isinstance(pin, dict) or pin.get('bundle') != value['bundleIdentifier'] or str(pin.get('version')) != str(value['version']) or str(pin.get('build')) != str(value['build']):
        raise RuntimeError(f"Codex {value.get('version')} (build {value.get('build')}) has not been reviewed for Glow yet. Update Neon Codex with support for this version, then run Refresh again. The installed app was not changed; this unknown build will not be patched.")
    # These values become one cache-directory name, never an arbitrary path.
    if not all(part and all(character.isdigit() or character == '.' for character in part)
               for part in (str(value['version']), str(value['build']))):
        raise RuntimeError('Invalid reviewed Codex version identifier.')
    return value


def safe_path(path, directory=False):
    """Reject redirected layout entries, including broken symlinks and parents."""
    if path != path.resolve():
        raise RuntimeError(f'Refusing a redirected local path: {path}')
    if path.exists() and directory and not path.is_dir():
        raise RuntimeError(f'Expected a local directory: {path}')
    if path.is_symlink():
        raise RuntimeError(f'Refusing a symbolic link: {path}')


@contextlib.contextmanager
def preparation_lock():
    safe_path(installer.LOCAL, directory=True)
    safe_path(installer.LOCK)
    installer.LOCAL.mkdir(parents=True, exist_ok=True)
    flags = os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
    with os.fdopen(os.open(installer.LOCK, flags, 0o600), 'a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another Neon Codex installer or refresh is running. Finish or cancel it before trying again.') from error
        yield


@contextlib.contextmanager
def existing_lock():
    """Coordinate a read-only no-op without creating installation state."""
    safe_path(installer.LOCK)
    if not installer.LOCK.exists():
        yield
        return
    descriptor = os.open(installer.LOCK, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(descriptor, 'r') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another Neon Codex installer or refresh is running. Finish or cancel it before trying again.') from error
        yield


def theme_inputs():
    return (json.loads((ROOT / 'package.json').read_text())['version'],
            {name: {'bytes': (ROOT / name).stat().st_size,
                    'sha256': installer.digest(ROOT / name)} for name in ASSETS})


def build_command(*arguments, quiet=False):
    # The launcher validates Node, installs the pinned dependency when necessary,
    # and chooses an identity only when exactly one valid certificate is available.
    result = subprocess.run(['/bin/zsh', str(ROOT / 'scripts/build.command'), *map(str, arguments)],
                            cwd=ROOT, text=True, capture_output=quiet, check=False)
    if result.returncode:
        detail = (result.stderr or result.stdout or '').strip() if quiet else ''
        raise RuntimeError(f"Glow build check failed{': ' + detail if detail else '. See the build output above.'}")


def validate_identity(identity):
    if identity is None:
        return None
    identity = identity.upper()
    if not re.fullmatch(r'[0-9A-F]{40}', identity):
        raise RuntimeError('--identity must be an explicit 40-character certificate SHA-1.')
    build_command('--check-identity', '--identity', identity, quiet=True)
    return identity


def inspect_source(source, expected):
    installer.real_directory(source)
    build_command('--inspect', '--source', source, quiet=True)
    checked = installer.snapshot(source)
    if version_key(checked) != version_key(expected):
        raise RuntimeError('The source cache belongs to a different Codex version.')
    return checked


def source_for(baseline):
    """Only the pinned, signature-verified official app can become build input."""
    originals = installer.LOCAL / 'originals'
    cache_dir = originals / f"{baseline['version']}-{baseline['build']}"
    cached = cache_dir / 'ChatGPT.app'
    safe_path(cached, directory=True)
    if cached.exists():
        inspect_source(cached, baseline)
        return cached
    legacy = installer.LOCAL / 'original/ChatGPT.app'
    safe_path(legacy, directory=True)
    if legacy.exists():
        with (legacy / installer.FILES['plist']).open('rb') as handle:
            info = plistlib.load(handle)
        if (str(info.get('CFBundleShortVersionString')), str(info.get('CFBundleVersion'))) == (str(baseline['version']), str(baseline['build'])):
            inspect_source(legacy, baseline)
            return legacy
    # A locally themed app will fail the builder's vendor identity and exact
    # source hashes here. It is never used as its own pristine source.
    inspect_source(installer.APP, baseline)
    installer.require_snapshot(installer.snapshot(installer.APP), baseline, 'Installed app before source copy')
    safe_path(originals, directory=True)
    safe_path(cache_dir, directory=True)
    if cache_dir.exists():
        raise RuntimeError(f'An incomplete source cache already exists at {cache_dir}. Preserve it for review before retrying.')
    originals.mkdir(parents=True, exist_ok=True)
    partial = originals / f'.{cache_dir.name}-{uuid.uuid4()}.partial'
    partial.mkdir()
    copied = partial / 'ChatGPT.app'
    try:
        subprocess.run(['/usr/bin/ditto', str(installer.APP), str(copied)], check=True)
        installer.require_snapshot(inspect_source(copied, baseline), baseline, 'Verified source copy')
        installer.require_snapshot(installer.snapshot(installer.APP), baseline, 'Installed app after source copy')
        os.rename(partial, cache_dir)
    except Exception as error:
        raise RuntimeError(f'Source preparation stopped. The partial copy was preserved at {partial}. {error}') from error
    return cached


def guard_recovery():
    """Staging can be the only previous-app backup after an interrupted swap."""
    safe_path(installer.RECOVERY, directory=True)
    if not installer.RECOVERY.exists():
        return
    for record_file in installer.RECOVERY.glob('*/record.json'):
        safe_path(record_file)
        record = json.loads(record_file.read_text())
        if record.get('state') in ('prepared', 'exchanged', 'installed_backup_at_staging', 'restore_exchanged'):
            raise RuntimeError('An interrupted installation may still depend on staging. Use Restore Previous Codex.command or review its recovery record before refreshing. Nothing was moved.')


def staged_report():
    safe_path(installer.STAGED.parent, directory=True)
    safe_path(installer.STAGED, directory=True)
    safe_path(installer.REPORT)
    if not installer.REPORT.exists() or not installer.STAGED.exists():
        return None
    report = json.loads(installer.REPORT.read_text())
    # Never silently rebuild over a corrupted, supposedly verified replacement.
    # Incomplete output is preserved as stale staging after source validation.
    if report.get('schemaVersion') == 2 and all(report.get(key) is True for key in installer.VERIFICATIONS):
        staged = installer.snapshot(installer.STAGED)
        installer.require_snapshot(staged, report['stagedSnapshot'], 'Staged app')
        team = installer.require_certificate(staged, 'Staged app')
        if team != report.get('signingIdentity', {}).get('teamIdentifier'):
            raise RuntimeError('Staged signature differs from the selected signing certificate.')
        return report
    return None


def archive_staging():
    staging = installer.STAGED.parent
    if not staging.exists():
        return
    installer.real_directory(staging)
    if not any(staging.iterdir()):
        return
    guard_recovery()
    archived = installer.LOCAL / 'superseded-staging'
    safe_path(archived, directory=True)
    archived.mkdir(parents=True, exist_ok=True)
    destination = archived / str(uuid.uuid4())
    os.rename(staging, destination)
    print(f'Previous staged build preserved in {destination.relative_to(ROOT)}', flush=True)


def already_installed(baseline, theme_version, assets, identity):
    safe_path(installer.LATEST)
    if not installer.LATEST.exists():
        return None
    record_file, record = installer.recovery_record()
    report = record.get('buildReport', {})
    if (record.get('state') != 'installed' or record.get('target') != str(installer.APP)
            or report.get('schemaVersion') != 2
            or not all(report.get(key) is True for key in installer.VERIFICATIONS)
            or report.get('themeVersion') != theme_version or report.get('sourceAssets') != assets
            or installer.comparable(record.get('replacement', {})) != installer.comparable(baseline)
            or installer.comparable(report.get('stagedSnapshot', {})) != installer.comparable(baseline)
            or (identity and report.get('signingIdentity', {}).get('sha1') != identity)):
        return None
    if installer.require_certificate(baseline, 'Installed app') != report.get('signingIdentity', {}).get('teamIdentifier'):
        raise RuntimeError('Installed Glow signature differs from its recorded signing certificate.')
    safe_path(installer.STAGED.parent, directory=True)
    safe_path(installer.STAGED, directory=True)
    safe_path(installer.REPORT)
    if installer.STAGED.exists():
        return None
    if installer.STAGED.parent.exists() and any(item != installer.REPORT for item in installer.STAGED.parent.iterdir()):
        return None
    if installer.REPORT.exists() and json.loads(installer.REPORT.read_text()) != report:
        return None
    guard_recovery()
    installer.require_snapshot(installer.snapshot(installer.APP), baseline, 'Installed app before no-op')
    print(f'Glow {theme_version} is already installed for this Codex version. Nothing needs to change.', flush=True)
    return {'alreadyInstalled': True, 'buildId': record['buildId'], 'themeVersion': theme_version}


def prepare(identity=None, baseline=None):
    # Reject unsupported versions before creating a lock, cache, or archive.
    baseline = baseline or reviewed_snapshot()
    theme_version, assets = theme_inputs()
    identity = validate_identity(identity)
    with existing_lock():
        installed = already_installed(baseline, theme_version, assets, identity)
        if installed:
            return installed
    with preparation_lock():
        installer.require_snapshot(reviewed_snapshot(), baseline, 'Installed app before refresh')
        report = staged_report()
        if report and report.get('themeVersion') == theme_version and report.get('sourceAssets') == assets and installer.comparable(report.get('installedBaseline', {})) == installer.comparable(baseline) and (not identity or report.get('signingIdentity', {}).get('sha1') == identity):
            installer.preflight('install')
            print(f'Glow {theme_version} is already prepared for Codex {baseline["version"]} (build {baseline["build"]}).', flush=True)
            return report
        guard_recovery()
        source = source_for(baseline)
        installer.require_snapshot(installer.snapshot(installer.APP), baseline, 'Installed app before rebuild')
        archive_staging()
        arguments = ['--source', source, '--output', installer.STAGED, '--installed-app', installer.APP]
        if identity:
            arguments.extend(['--identity', identity])
        print(f'Preparing Glow {theme_version} for Codex {baseline["version"]} (build {baseline["build"]})...', flush=True)
        build_command(*arguments)
        installer.preflight('install')
        report = json.loads(installer.REPORT.read_text())
        if report.get('themeVersion') != theme_version or report.get('sourceAssets') != assets:
            raise RuntimeError('The generated build does not match the current Glow source files; no installation was attempted.')
        print('Signed build and installation checks passed.', flush=True)
        return report


def refresh(prepare_only=False, identity=None, timeout=1800):
    for attempt in range(MAX_ATTEMPTS):
        baseline = reviewed_snapshot()
        report = None
        try:
            report = prepare(identity=identity, baseline=baseline)
            if report.get('alreadyInstalled'):
                return
            if prepare_only:
                print('READY. Preparation complete; the installed app was not changed.', flush=True)
                return
            # Release the preparation lock before entering the installer's own
            # locked, journaled manual-quit flow. It revalidates all snapshots.
            installer.wait_and_swap('install', timeout)
            return
        except (RuntimeError, OSError, subprocess.SubprocessError) as error:
            if report and (installer.RECOVERY / report['buildId'] / 'record.json').exists():
                # A journal may precede the exchange by only one instruction.
                # Never rebuild after any potentially started transaction.
                raise
            current = reviewed_snapshot()
            if version_key(current) == version_key(baseline):
                raise
            if attempt + 1 >= MAX_ATTEMPTS:
                raise RuntimeError('Codex changed versions repeatedly during refresh. No further retry will run. Finish the app update, then run Refresh again.') from error
            print(f'Codex updated to {current["version"]} (build {current["build"]}) before installation. Preparing the reviewed matching build and trying again...', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true', help='Prepare and check the signed build without waiting or installing')
    parser.add_argument('--identity', help='Select an Apple-issued signing certificate by SHA-1')
    parser.add_argument('--timeout', type=int, default=1800, help='Seconds to wait for a manual quit (default: 1800)')
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    try:
        refresh(args.prepare_only, args.identity, args.timeout)
    except KeyboardInterrupt:
        print('\nCancelled. No app was stopped or launched. Check the recovery record if installation had started.', file=sys.stderr)
        return 130
    except Exception as error:
        print(f'Neon Codex: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
