#!/usr/bin/python3
"""Install or restore a verified local build after manual quit. Never launch or stop apps."""
import argparse
import ctypes
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / '.local'
APP = Path('/Applications/ChatGPT.app')
STAGED = LOCAL / 'staging' / 'ChatGPT.app'
REPORT = LOCAL / 'staging' / 'ChatGPT.app.build-report.json'
RECOVERY = LOCAL / 'recovery'
LATEST = RECOVERY / 'latest.json'
STATUS = LOCAL / 'install-status.json'
LOCK = LOCAL / 'install.lock'
FILES = {'archive': 'Contents/Resources/app.asar', 'plist': 'Contents/Info.plist',
         'framework': 'Contents/Frameworks/Codex Framework.framework/Codex Framework',
         'launcher': 'Contents/MacOS/ChatGPT'}
VERIFICATIONS = ('originalUnchanged', 'packedDataPreserved', 'electronFusesPreserved',
                 'codeSignatureVerified', 'signingTeamVerified', 'cspPreserved',
                 'installedBaselineUnchanged')
COMMON_VERIFICATIONS = tuple(name for name in VERIFICATIONS if name != 'signingTeamVerified')


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def real_directory(path):
    if path.is_symlink() or path.resolve() != path or not path.is_dir():
        raise RuntimeError(f'Expected an existing real directory: {path}')


def signature(app):
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', str(app))
    detail = run('/usr/bin/codesign', '--display', '--verbose=4', str(app)).stderr
    def field(name):
        value = re.search(r'^' + re.escape(name) + r'=(.+)$', detail, re.MULTILINE)
        return value.group(1).strip() if value else None
    flags = re.search(r'\bflags=0x([0-9a-fA-F]+)', detail)
    return {'identifier': field('Identifier'), 'teamIdentifier': field('TeamIdentifier'),
            'cdHash': field('CDHash'), 'flags': int(flags.group(1), 16) if flags else 0,
            'adHoc': field('Signature') == 'adhoc',
            'authorities': re.findall(r'^Authority=(.+)$', detail, re.MULTILINE)}


def snapshot(app):
    """Hashes include embedded CMS/certificate signatures, not just executable code."""
    real_directory(app)
    with (app / FILES['plist']).open('rb') as handle:
        info = plistlib.load(handle)
    result = {'app': str(app), 'bundleIdentifier': info.get('CFBundleIdentifier'),
              'version': info.get('CFBundleShortVersionString'), 'build': info.get('CFBundleVersion'),
              'hashes': {name: digest(app / relative) for name, relative in FILES.items()},
              'signature': signature(app), 'frameworkSignature': signature(app / FILES['framework'])}
    return result


def recovery_snapshot(app):
    """Fingerprint a damaged target without requiring working code or a plist.

    Only the incoming recovery bundle is trusted and signature-validated. Record
    every current entry, including missing/unreadable key files and symlink text,
    so a damaged app cannot change unnoticed while waiting for manual quit.
    """
    real_directory(app)
    hashes = {}
    for name, relative in FILES.items():
        try:
            file = app / relative
            hashes[name] = digest(file) if app in file.resolve().parents else None
        except OSError:
            hashes[name] = None
    tree = hashlib.sha256()
    root_stat = app.stat()
    tree.update(json.dumps([root_stat.st_dev, root_stat.st_ino, root_stat.st_mode]).encode())
    def visit(directory):
        try:
            entries = sorted(os.scandir(directory), key=lambda item: item.name)
        except OSError as error:
            tree.update(json.dumps({'unreadableDirectory': str(directory.relative_to(app)), 'errno': error.errno}).encode())
            return
        for entry in entries:
            file = Path(entry.path)
            attributes = file.lstat()
            item = [str(file.relative_to(app)), attributes.st_mode, attributes.st_size,
                    attributes.st_mtime_ns, attributes.st_ctime_ns, attributes.st_ino]
            if stat.S_ISLNK(attributes.st_mode):
                item.append(os.readlink(file))
            elif stat.S_ISREG(attributes.st_mode):
                try:
                    item.append(digest(file))
                except OSError as error:
                    item.append({'unreadable': error.errno})
            tree.update(json.dumps(item, sort_keys=True).encode())
            tree.update(b'\n')
            if stat.S_ISDIR(attributes.st_mode):
                visit(file)
    visit(app)
    return {'app': str(app), 'hashes': hashes, 'treeHash': tree.hexdigest()}


def comparable(value):
    """An atomic exchange changes the path, while all sealed content must match."""
    return {key: item for key, item in value.items() if key != 'app'}


def require_snapshot(actual, expected, label):
    if comparable(actual) != comparable(expected):
        message = f'{label} differs from the recorded build snapshot; refusing to swap.'
        if any(actual.get(key) != expected.get(key) for key in ('version', 'build')):
            message += (f" Recorded Codex: {expected.get('version', 'unknown')} "
                        f"(build {expected.get('build', 'unknown')}); "
                        f"found: {actual.get('version', 'unknown')} "
                        f"(build {actual.get('build', 'unknown')}).")
            if label.startswith('Installed app'):
                message += ' Rebuild Neon Codex for the installed app version before trying again.'
        raise RuntimeError(message)


def require_certificate(value, label):
    launcher, framework = value['signature'], value['frameworkSignature']
    team = launcher.get('teamIdentifier')
    if not team or team == 'not set' or framework.get('teamIdentifier') != team:
        raise RuntimeError(f'{label} launcher and framework require a matching nonempty certificate Team ID.')
    if launcher.get('adHoc') or framework.get('adHoc'):
        raise RuntimeError(f'{label} cannot be ad-hoc signed.')
    if not launcher.get('flags', 0) & 0x10000 or not framework.get('flags', 0) & 0x10000:
        raise RuntimeError(f'{label} must retain hardened runtime.')
    return team


def report_verified(report):
    """The local policy is a separate schema, never a fallback for a failed cert."""
    if report.get('schemaVersion') == 2:
        return (report.get('signingMode') in (None, 'certificate')
                and all(report.get(name) is True for name in VERIFICATIONS))
    if report.get('schemaVersion') == 3:
        return (report.get('signingMode') == 'local' and report.get('signingIdentity') is None
                and report.get('signingPolicyVerified') is True
                and report.get('signingTeamVerified') is False
                and report.get('libraryValidationException') is True
                and all(report.get(name) is True for name in COMMON_VERIFICATIONS))
    if report.get('schemaVersion') == 4:
        identity = report.get('signingIdentity') or {}
        return (report_is_stable_local(report)
                and identity.get('kind') == 'local'
                and identity.get('strategy') == 'persistent-self-signed'
                and re.fullmatch(r'[0-9A-F]{40}', str(identity.get('sha1', ''))) is not None
                and re.fullmatch(r'[0-9a-fA-F]{64}', str(identity.get('certificateSha256', ''))) is not None
                and isinstance(identity.get('name'), str) and bool(identity['name'])
                and identity.get('teamIdentifier') is None
                and isinstance(identity.get('keychainPath'), str) and Path(identity['keychainPath']).is_absolute()
                and isinstance(identity.get('certificateValidTo'), str) and bool(identity['certificateValidTo'])
                and report.get('stableIdentityVerified') is True
                and report.get('signingPolicyVerified') is True
                and report.get('signingTeamVerified') is False
                and report.get('libraryValidationException') is True
                and all(report.get(name) is True for name in COMMON_VERIFICATIONS))
    return False


def report_is_local(report):
    return report.get('schemaVersion') in (3, 4) and report.get('signingMode') == 'local'


def report_is_stable_local(report):
    return (report.get('schemaVersion') == 4 and report.get('signingMode') == 'local'
            and report.get('localSigningStrategy') == 'persistent-self-signed')


def require_local_signature(value, label):
    for name in ('signature', 'frameworkSignature'):
        metadata = value.get(name, {})
        if (metadata.get('adHoc') is not True
                or metadata.get('teamIdentifier') not in (None, '', 'not set')
                or not metadata.get('flags', 0) & 0x10000):
            raise RuntimeError(f'{label} must retain hardened runtime and its verified local ad-hoc signature.')
    return 'local'


def verify_stable_requirement(path, identifier, sha1, label):
    """Verify both the signer and the embedded identity used by Keychain tracking.

    Keep this outside snapshot(): old recovery records must retain their exact
    snapshot shape. An identifier-only embedded requirement would be unsafe even
    when this particular build passes a stronger external requirement.
    """
    requirement = f'identifier {json.dumps(identifier)} and certificate leaf = H"{sha1}"'
    run('/usr/bin/codesign', '--verify', '--strict', '-R', '=' + requirement, str(path))
    display = run('/usr/bin/codesign', '--display', '-r-', str(path))
    detail = display.stdout + '\n' + display.stderr
    designated = re.findall(r'^designated => (.+)$', detail, re.MULTILINE)
    expected = re.compile(r'identifier (?:("[A-Za-z0-9_.-]+")|([A-Za-z0-9_.-]+))'
                          + r' and certificate (?:leaf|0) = H"([0-9a-fA-F]{40})"')
    match = expected.fullmatch(designated[0].strip()) if len(designated) == 1 else None
    actual_identifier = (json.loads(match.group(1)) if match.group(1) else match.group(2)) if match else None
    if not match or actual_identifier != identifier or match.group(3).upper() != sha1:
        raise RuntimeError(f'{label} does not retain its exact certificate-pinned designated requirement.')


def require_stable_local_signature(value, report, label):
    sha1 = report['signingIdentity']['sha1']
    app = Path(value['app'])
    for name, path, identifier in (
            ('signature', app, 'com.openai.codex'),
            ('frameworkSignature', app / FILES['framework'], 'com.openai.codex.framework')):
        metadata = value.get(name, {})
        if (metadata.get('adHoc') is not False
                or metadata.get('teamIdentifier') not in (None, '', 'not set')
                or metadata.get('identifier') != identifier
                or not metadata.get('flags', 0) & 0x10000):
            raise RuntimeError(f'{label} must retain hardened runtime and its stable local certificate signature.')
        verify_stable_requirement(path, identifier, sha1, label)
    return 'local'


def require_report_signature(value, report, label, allow_local_signing=False):
    if not report_verified(report):
        raise RuntimeError('The staged build has not passed all required checks.')
    if report_is_local(report):
        if not allow_local_signing:
            raise RuntimeError('Local signing requires explicit --allow-local-signing (or Refresh --local-signing).')
        return (require_stable_local_signature(value, report, label) if report_is_stable_local(report)
                else require_local_signature(value, label))
    team = require_certificate(value, label)
    if team != (report.get('signingIdentity') or {}).get('teamIdentifier'):
        raise RuntimeError(f'{label} signature differs from the selected signing certificate.')
    return team


def local_recovery_records():
    """Walk this checkout's journaled ancestry without following redirected paths."""
    if not LATEST.exists():
        if LATEST.is_symlink():
            raise RuntimeError('Refusing a redirected recovery pointer.')
        return
    if LATEST.is_symlink() or LATEST.resolve() != LATEST:
        raise RuntimeError('Refusing a redirected recovery pointer.')
    build_id = json.loads(LATEST.read_text()).get('buildId')
    if not valid_build_id(build_id):
        raise RuntimeError('Invalid local signing recovery pointer; preserve it for review.')
    visited = set()
    while build_id:
        if not valid_build_id(build_id) or build_id in visited or len(visited) >= 256:
            raise RuntimeError('Invalid local signing recovery chain.')
        visited.add(build_id)
        record_file = RECOVERY / build_id / 'record.json'
        if record_file.is_symlink() or record_file.resolve() != record_file:
            raise RuntimeError('Refusing a redirected recovery record.')
        record = json.loads(record_file.read_text())
        if record.get('buildId') != build_id or record.get('target') != str(APP):
            raise RuntimeError('Local signing recovery record targets a different app.')
        yield record
        build_id = record.get('previousBuildId')
        if 'previousBuildId' in record and not valid_build_id(build_id):
            raise RuntimeError('Invalid local signing recovery chain.')


def local_recovery_report(value):
    """Only exact journaled Glow builds may establish a local app baseline."""
    for record in local_recovery_records():
        report = record.get('buildReport', {})
        if (record.get('state') in ('prepared', 'exchanged', 'installed', 'installed_backup_at_staging',
                                   'restore_exchanged', 'restored')
                and report_verified(report) and report_is_local(report)
                and report.get('buildId') == record['buildId']
                and comparable(record.get('replacement', {})) == comparable(value)
                and comparable(report.get('stagedSnapshot', {})) == comparable(value)):
            return report
    return None


def local_identity_pin():
    """Retain the signer across vendor updates; never silently rotate a lost key."""
    sha1 = None
    for record in local_recovery_records():
        report = record.get('buildReport', {})
        if report.get('schemaVersion') != 4:
            continue
        if (not report_verified(report) or report.get('buildId') != record['buildId']
                or comparable(record.get('replacement', {})) != comparable(report.get('stagedSnapshot', {}))):
            raise RuntimeError('Stable local identity recovery evidence is invalid; preserve it for review.')
        current = report['signingIdentity']['sha1']
        if sha1 is not None and sha1 != current:
            raise RuntimeError('Conflicting stable local identity pins in recovery history; refusing key rotation.')
        sha1 = current
    return sha1


def require_installed_signature(value, label='Installed app'):
    metadata = [value.get(name, {}) for name in ('signature', 'frameworkSignature')]
    if any(item.get('adHoc') or item.get('teamIdentifier') in (None, '', 'not set') for item in metadata):
        report = local_recovery_report(value)
        if report is None:
            raise RuntimeError(f'{label} has no matching verified local Glow recovery record; refusing an unrecognized local app.')
        require_report_signature(value, report, label, allow_local_signing=True)
        return 'local'
    return require_certificate(value, label)


def atomic_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + f'.{os.getpid()}.tmp')
    with temporary.open('w') as handle:
        json.dump(value, handle, indent=2)
        handle.write('\n'); handle.flush(); os.fsync(handle.fileno())
    os.replace(temporary, file)
    descriptor = os.open(file.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write_status(state, **extra):
    value = {'state': state, 'at': datetime.datetime.now().astimezone().isoformat(),
             'installerPid': os.getpid(), 'app': str(APP), **extra}
    atomic_json(STATUS, value)
    messages = {
        'preparing': 'Checking the installed app and the signed replacement...',
        'waiting_for_quit': 'READY. Quit Codex completely with Command-Q. Keep this Terminal window open.',
        'swapping': 'Codex and its helpers have exited. Exchanging the app bundles...',
        'installed': 'DONE. Neon Codex is installed. Reopen your usual Codex app when ready.',
        'restored': 'DONE. The previous Codex build is restored. Reopen your usual app when ready.',
        'no_exchange': 'No app exchange occurred for this build. The recorded previous app is still installed; recovery bookkeeping was cleared.',
        'expired_without_changes': 'Timed out waiting for Codex to quit. No app files were changed.',
        'rolled_back': 'Installation was reversed. Your previous app is back in place.',
        'failed': 'Installer stopped: ' + str(extra.get('error', 'unknown error')),
        'cancelled': 'Cancelled. No app process was stopped or launched.',
    }
    print(messages.get(state, json.dumps(value)), flush=True)


def app_processes(paths=None):
    """Kernel executable paths include nested helpers. No argv or profile reads."""
    roots = tuple(str(item) + '/' for item in (paths or (APP,)))
    library = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    get_path = library.proc_pidpath
    get_path.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    get_path.restype = ctypes.c_int
    found = []
    for pid_string in run('/bin/ps', '-axo', 'pid=').stdout.split():
        pid = int(pid_string)
        buffer = ctypes.create_string_buffer(4096)
        if get_path(pid, buffer, len(buffer)) > 0 and os.fsdecode(buffer.value).startswith(roots):
            found.append(pid)
    return found


def exchange(left, right):
    """RENAME_SWAP keeps both directories present in one atomic filesystem step."""
    library = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    rename = library.renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(os.fsencode(left), os.fsencode(right), 2) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))


def safe_paths(replacement):
    real_directory(APP); real_directory(replacement)
    if APP.stat().st_dev != replacement.stat().st_dev:
        raise RuntimeError('Atomic exchange requires the replacement and app on the same filesystem.')
    if replacement == APP or APP in replacement.parents or replacement in APP.parents:
        raise RuntimeError('Replacement and target directories must be separate.')


def recovery_record():
    pointer = json.loads(LATEST.read_text())
    build_id = pointer.get('buildId', '')
    if not valid_build_id(build_id):
        raise RuntimeError('Invalid recovery record identifier.')
    record_file = RECOVERY / build_id / 'record.json'
    real_directory(record_file.parent)
    return record_file, json.loads(record_file.read_text())


def valid_build_id(value):
    try:
        return str(uuid.UUID(value)) == value
    except (ValueError, TypeError, AttributeError):
        return False


def restore_latest_pointer(record):
    previous = record.get('previousBuildId')
    if previous:
        atomic_json(LATEST, {'buildId': previous})
    elif LATEST.exists():
        LATEST.unlink()


def preflight(mode, allow_local_signing=False):
    if mode == 'install':
        report = json.loads(REPORT.read_text())
        if not report_verified(report):
            raise RuntimeError('The staged build has not passed all required checks.')
        if report.get('schemaVersion') == 3:
            raise RuntimeError('Legacy ad-hoc staging needs a fresh stable-identity build. Run Refresh Neon Codex.command --local-signing.')
        if report_is_stable_local(report):
            retained_pin = local_identity_pin()
            if retained_pin is not None and report['signingIdentity']['sha1'] != retained_pin:
                raise RuntimeError('The replacement local certificate differs from recovery history; refusing key rotation.')
        if report.get('installedBaseline', {}).get('app') != str(APP):
            raise RuntimeError('Build baseline does not target this installed app.')
        build_id = report.get('buildId', '')
        if not valid_build_id(build_id):
            raise RuntimeError('Build report has an invalid identifier.')
        replacement = STAGED
        safe_paths(replacement)
        current, incoming = snapshot(APP), snapshot(replacement)
        require_snapshot(current, report['installedBaseline'], 'Installed app')
        require_snapshot(incoming, report['stagedSnapshot'], 'Staged app')
        require_installed_signature(current, 'Installed app')
        team = require_report_signature(incoming, report, 'Staged app', allow_local_signing)
        with (replacement / FILES['plist']).open('rb') as handle:
            info = plistlib.load(handle)
        if info.get('ElectronAsarIntegrity', {}).get('Resources/app.asar', {}).get('hash') != report['newHeaderHash']:
            raise RuntimeError('The staged archive does not match its reviewed integrity header.')
        record_file = RECOVERY / build_id / 'record.json'
        resume = None
        if record_file.parent.exists():
            real_directory(record_file.parent)
            resume = json.loads(record_file.read_text())
            if resume.get('state') not in ('prepared', 'no_exchange') or resume.get('target') != str(APP):
                raise RuntimeError('A completed recovery record already exists for this build; refusing to overwrite it.')
            require_snapshot(current, resume['baseline'], 'Interrupted install baseline')
            require_snapshot(incoming, resume['replacement'], 'Interrupted staged build')
            if (record_file.parent / 'ChatGPT.app').exists() or (record_file.parent / 'Replaced Neon Codex.app').exists():
                raise RuntimeError('Interrupted record already holds app bundles; preserve them for recovery.')
        record = {'schemaVersion': 1, 'buildId': build_id, 'themeVersion': report.get('themeVersion'),
                  'state': 'prepared', 'target': str(APP), 'baseline': current, 'replacement': incoming,
                  'stagedPath': str(STAGED), 'backupPath': str(record_file.parent / 'ChatGPT.app'),
                  'buildReport': report}
        if resume and resume.get('previousBuildId'):
            record['previousBuildId'] = resume['previousBuildId']
        elif LATEST.exists():
            previous = json.loads(LATEST.read_text()).get('buildId')
            if not valid_build_id(previous):
                raise RuntimeError('Existing recovery pointer is invalid; preserve it for manual review.')
            if previous != build_id:
                record['previousBuildId'] = previous
    else:
        record_file, record = recovery_record()
        if record.get('state') not in ('prepared', 'exchanged', 'installed', 'installed_backup_at_staging'):
            raise RuntimeError('The latest recovery record does not contain an installed update to restore.')
        if record.get('target') != str(APP):
            raise RuntimeError('Recovery record does not target this installed app.')
        expected_backup = record_file.parent / 'ChatGPT.app'
        if record.get('backupPath') != str(expected_backup) or record.get('stagedPath') != str(STAGED):
            raise RuntimeError('Recovery paths differ from the recorded local layout.')
        current = recovery_snapshot(APP)
        replacement = expected_backup
        if not replacement.is_dir():
            replacement = STAGED
        if record.get('state') == 'prepared' and not expected_backup.exists() and current['hashes'] == record['baseline']['hashes']:
            # A durable record is written before RENAME_SWAP. If the exact incoming
            # build is still staged, interruption happened before any app exchange.
            incoming = snapshot(STAGED)
            require_snapshot(incoming, record['replacement'], 'Unexchanged staged app')
            return {'noExchange': True, 'recordFile': record_file, 'record': record,
                    'current': current, 'replacement': STAGED}
        safe_paths(replacement)
        incoming = snapshot(replacement)
        require_snapshot(incoming, record['baseline'], 'Previous app backup')
        # A recorded previous local build was explicitly authorized when it was
        # installed. Recovery must remain available without a new mode choice.
        team = require_installed_signature(incoming, 'Previous app backup')
        if (record_file.parent / 'Replaced Neon Codex.app').exists():
            raise RuntimeError('Displaced-build archive path already exists; preserve it for manual review.')
    for value in ((current, incoming) if mode == 'install' else (incoming,)):
        if value.get('bundleIdentifier') != 'com.openai.codex':
            raise RuntimeError('Expected the Codex app bundle identity.')
    return {'replacement': replacement, 'current': current, 'incoming': incoming,
            'team': team, 'recordFile': record_file, 'record': record,
            'resumePrepared': mode == 'install' and resume is not None}


def wait_and_swap(mode, timeout, allow_local_signing=False):
    LOCAL.mkdir(parents=True, exist_ok=True)
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        write_status('preparing', operation=mode)
        plan = preflight(mode, allow_local_signing=allow_local_signing)
        if plan.get('noExchange'):
            plan['record']['state'] = 'no_exchange'
            atomic_json(plan['recordFile'], plan['record'])
            restore_latest_pointer(plan['record'])
            write_status('no_exchange', operation=mode, recoveryRecord=str(plan['recordFile']))
            return
        replacement = plan['replacement']
        deadline = time.monotonic() + timeout
        if mode == 'install' and plan['team'] == 'local':
            print('Identity migration: macOS may ask to let ChatGPT access "Codex Storage Key" in your login Keychain. Review that system prompt yourself. Always Allow can remember this stable local identity across Glow refreshes while its signing key is retained; app or Keychain policy changes may still require permission. The installer does not read that item or change its permissions.', flush=True)
        write_status('waiting_for_quit', operation=mode, signingTeam=plan['team'], timeoutSeconds=timeout)
        last_progress = 0
        while True:
            if time.monotonic() >= deadline:
                write_status('expired_without_changes', operation=mode)
                return
            active = app_processes((APP, replacement))
            if active:
                if time.monotonic() - last_progress >= 10:
                    print(f'Waiting for Codex and its helpers ({len(active)} processes). Control-C cancels.', flush=True)
                    last_progress = time.monotonic()
                time.sleep(1)
                continue
            time.sleep(2)
            if app_processes((APP, replacement)):
                continue
            current_after_wait = recovery_snapshot(APP) if mode == 'restore' else snapshot(APP)
            require_snapshot(current_after_wait, plan['current'], 'Installed app after waiting')
            require_snapshot(snapshot(replacement), plan['incoming'], 'Replacement after waiting')
            if app_processes((APP, replacement)):
                continue
            break
        record_file, record = plan['recordFile'], plan['record']
        if mode == 'install':
            record_file.parent.mkdir(parents=True, exist_ok=plan['resumePrepared'])
            atomic_json(record_file, record)
            atomic_json(LATEST, {'buildId': record['buildId']})
        # Ignore Terminal interrupt/close while the tiny swap-and-journal transaction
        # finishes. Never interrupt an exchange between the bundle and its record.
        old_handlers = {item: signal.getsignal(item) for item in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
        for item in old_handlers:
            signal.signal(item, signal.SIG_IGN)
        try:
            write_status('swapping', operation=mode, backup=str(replacement))
            try:
                exchange(APP, replacement)
            except Exception:
                if mode == 'install':
                    record['state'] = 'exchange_failed'
                    atomic_json(record_file, record)
                    restore_latest_pointer(record)
                raise
            record['state'] = 'exchanged' if mode == 'install' else 'restore_exchanged'
            atomic_json(record_file, record)
            if mode == 'install':
                backup = Path(record['backupPath'])
                try:
                    os.rename(replacement, backup)
                except Exception as error:
                    if not app_processes((APP, replacement)):
                        exchange(APP, replacement)
                        record['state'] = 'rolled_back'
                        atomic_json(record_file, record)
                        restore_latest_pointer(record)
                        write_status('rolled_back', operation=mode, error=str(error))
                    else:
                        record['state'] = 'installed_backup_at_staging'
                        atomic_json(record_file, record)
                        write_status('installed_backup_at_staging', backup=str(replacement), error=str(error))
                    return
                record['state'] = 'installed'
            else:
                # Restoring already succeeded. A failed housekeeping move must not
                # exchange a running app again or conceal the displaced newer copy.
                saved_newer = record_file.parent / 'Replaced Neon Codex.app'
                try:
                    os.rename(replacement, saved_newer)
                    record['displacedBuildPath'] = str(saved_newer)
                except OSError as error:
                    record['displacedBuildPath'] = str(replacement)
                    record['archiveWarning'] = str(error)
                record['state'] = 'restored'
            record['completedAt'] = datetime.datetime.now().astimezone().isoformat()
            atomic_json(record_file, record)
            write_status(record['state'], operation=mode, signingTeam=plan['team'],
                         recoveryRecord=str(record_file), runtimeValidated=False)
        finally:
            for item, handler in old_handlers.items():
                signal.signal(item, handler)


def self_test():
    LOCAL.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='installer-test-', dir=LOCAL) as directory:
        left, right = Path(directory) / 'left', Path(directory) / 'right'
        left.mkdir(); right.mkdir()
        (left / 'previous').write_text('previous'); (right / 'theme').write_text('theme')
        exchange(left, right)
        assert (left / 'theme').read_text() == 'theme' and (right / 'previous').read_text() == 'previous'
        exchange(left, right)
        assert (left / 'previous').read_text() == 'previous'
        try:
            exchange(left, Path(directory) / 'absent')
        except OSError:
            pass
        else:
            raise AssertionError('Missing replacement must reject exchange')
        assert (left / 'previous').read_text() == 'previous'
        record = Path(directory) / 'record.json'
        atomic_json(record, {'state': 'prepared'})
        assert json.loads(record.read_text())['state'] == 'prepared'
    sample = {'app': '/one', 'hashes': {'archive': 'a'}, 'signature': {'team': 'A'}}
    require_snapshot(dict(sample, app='/two'), sample, 'Matching relocated app')
    try:
        require_snapshot(dict(sample, hashes={'archive': 'changed'}), sample, 'Changed app')
    except RuntimeError:
        pass
    else:
        raise AssertionError('Changed installed baseline must reject installation')
    assert os.getpid() not in app_processes()
    print('PASS: atomic exchange, rollback, absent-path preservation, durable journal, baseline mismatch rejection, process gate')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--wait', choices=['install', 'restore'], help='Run in the foreground; wait for manual quit')
    group.add_argument('--check', choices=['install', 'restore'], help='Read-only preflight')
    group.add_argument('--snapshot', type=Path, help='Read-only signed bundle snapshot for the builder')
    group.add_argument('--verify-local-baseline', type=Path, help='Verify a local build against its recovery record, without mutation')
    group.add_argument('--local-identity-pin', action='store_true', help='Read the persistent local certificate pin from verified recovery history')
    group.add_argument('--self-test', action='store_true')
    parser.add_argument('--timeout', type=int, default=1800)
    parser.add_argument('--allow-local-signing', action='store_true', help='Explicitly accept a verified local-signing replacement')
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    try:
        if args.snapshot:
            print(json.dumps(snapshot(args.snapshot.resolve()), indent=2))
        elif args.verify_local_baseline:
            if args.verify_local_baseline.resolve() != APP.resolve():
                raise RuntimeError('Local baseline verification must target the installed app.')
            value = snapshot(APP)
            require_installed_signature(value)
            print(json.dumps(value, indent=2))
        elif args.local_identity_pin:
            print(json.dumps({'sha1': local_identity_pin()}))
        elif args.self_test:
            self_test()
        elif args.check:
            plan = preflight(args.check, allow_local_signing=args.allow_local_signing)
            print(json.dumps({'preflight': 'no_exchange' if plan.get('noExchange') else 'passed', 'operation': args.check, 'signingTeam': plan.get('team'),
                              'runningAppProcesses': len(app_processes((APP, plan['replacement'])))}))
        else:
            wait_and_swap(args.wait, args.timeout, allow_local_signing=args.allow_local_signing)
    except KeyboardInterrupt:
        if args.wait:
            write_status('cancelled', operation=args.wait, message='Check the recovery record if exchange had already started.')
        print('\nCancelled.', file=sys.stderr)
        return 130
    except Exception as error:
        if args.wait:
            write_status('failed', operation=args.wait, error=str(error))
        print(f'Neon Codex: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
