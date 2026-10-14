"""Recovery regression tests using synthetic directories and mocked signatures.

No installed app, Keychain, or app process is read, changed, stopped, or launched.
"""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('neon_installer', ROOT / 'scripts/install.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SIGNATURE = {'identifier': 'com.openai.codex', 'teamIdentifier': 'TESTTEAM01',
             'cdHash': 'synthetic', 'flags': 0x10000, 'adHoc': False, 'authorities': ['Test only']}


def configure(base):
    m.LOCAL = base
    m.APP = base / 'installed/ChatGPT.app'
    m.STAGED = base / 'staging/ChatGPT.app'
    m.REPORT = base / 'staging/ChatGPT.app.build-report.json'
    m.RECOVERY = base / 'recovery'
    m.LATEST = m.RECOVERY / 'latest.json'
    m.STATUS = base / 'status.json'
    m.LOCK = base / 'install.lock'
    m.signature = lambda app: dict(SIGNATURE)
    m.app_processes = lambda paths=None: []
    m.time.sleep = lambda seconds: None


def bundle(app, label):
    app.mkdir(parents=True)
    for name, relative in m.FILES.items():
        file = app / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes((label + ' ' + name).encode())
    (app / m.FILES['plist']).write_bytes(plistlib.dumps({
        'CFBundleIdentifier': 'com.openai.codex', 'CFBundleShortVersionString': '26.1007.21159',
        'CFBundleVersion': '20052', 'SyntheticLabel': label,
        'ElectronAsarIntegrity': {'Resources/app.asar': {'hash': 'synthetic-header'}}}))


def record_for(build_id, baseline, replacement, state='installed'):
    record_file = m.RECOVERY / build_id / 'record.json'
    record = {'schemaVersion': 1, 'buildId': build_id, 'themeVersion': '0.4.0', 'state': state,
              'target': str(m.APP), 'baseline': baseline, 'replacement': replacement,
              'stagedPath': str(m.STAGED), 'backupPath': str(record_file.parent / 'ChatGPT.app')}
    m.atomic_json(record_file, record)
    m.atomic_json(m.LATEST, {'buildId': build_id})
    return record_file, record


def must_reject(action, text):
    try:
        action()
    except RuntimeError as error:
        assert text.lower() in str(error).lower(), str(error)
        return str(error)
    else:
        raise AssertionError('Invalid recovery condition was accepted')


with tempfile.TemporaryDirectory(prefix='neon-recovery-test-') as directory:
    configure(Path(directory).resolve())
    build_id = str(uuid.uuid4())
    backup = m.RECOVERY / build_id / 'ChatGPT.app'
    bundle(backup, 'previous')
    baseline = m.snapshot(backup)
    m.APP.mkdir(parents=True)  # Deliberately corrupt: no plist, code, or archive.
    record_file, record = record_for(build_id, baseline, dict(baseline, app=str(m.APP)))
    allowed = {backup, backup / m.FILES['framework']}
    def backup_signature_only(app):
        assert app in allowed, f'Corrupt installed app was incorrectly validated: {app}'
        return dict(SIGNATURE)
    m.signature = backup_signature_only
    plan = m.preflight('restore')
    assert plan['replacement'] == backup and all(value is None for value in plan['current']['hashes'].values())
    print('PASS: corrupt installed bundle accepted without signature validation')

    (m.APP / 'changed-while-waiting').write_text('changed')
    must_reject(lambda: m.require_snapshot(m.recovery_snapshot(m.APP), plan['current'], 'Installed app'), 'differs')
    (m.APP / 'changed-while-waiting').unlink()
    print('PASS: changes to damaged current bundle detected while waiting')

    archive = backup / m.FILES['archive']
    original = archive.read_bytes()
    archive.write_bytes(b'corrupt backup')
    must_reject(lambda: m.preflight('restore'), 'Previous app backup differs')
    archive.write_bytes(original)
    m.signature = lambda app: dict(SIGNATURE, teamIdentifier='WRONGTEAM0')
    must_reject(lambda: m.preflight('restore'), 'Previous app backup differs')
    m.signature = backup_signature_only
    print('PASS: corrupt backup and wrong backup signing team rejected')

    m.STAGED.parent.mkdir(parents=True)
    backup.rename(m.STAGED)
    allowed = {m.STAGED, m.STAGED / m.FILES['framework']}
    assert m.preflight('restore')['replacement'] == m.STAGED
    print('PASS: verified previous bundle recovered from interrupted-install staging')
    with contextlib.redirect_stdout(io.StringIO()):
        m.wait_and_swap('restore', 5)
    assert {name: m.digest(m.APP / relative) for name, relative in m.FILES.items()} == baseline['hashes']
    record = json.loads(record_file.read_text())
    assert record['state'] == 'restored' and Path(record['displacedBuildPath']).is_dir()
    assert json.loads(m.STATUS.read_text())['state'] == 'restored'
    print('PASS: full synthetic restore preserves the corrupt displaced bundle')

with tempfile.TemporaryDirectory(prefix='neon-prepared-test-') as directory:
    configure(Path(directory).resolve())
    bundle(m.APP, 'previous'); bundle(m.STAGED, 'next')
    baseline, replacement = m.snapshot(m.APP), m.snapshot(m.STAGED)
    build_id = str(uuid.uuid4())
    record_file, record = record_for(build_id, baseline, replacement, 'prepared')
    allowed = {m.STAGED, m.STAGED / m.FILES['framework']}
    m.signature = backup_signature_only
    assert m.preflight('restore')['noExchange'] is True
    with contextlib.redirect_stdout(io.StringIO()):
        m.wait_and_swap('restore', 5)
    assert json.loads(m.STATUS.read_text())['state'] == 'no_exchange'
    assert json.loads(record_file.read_text())['state'] == 'no_exchange'
    assert not m.LATEST.exists()
    assert {name: m.digest(m.APP / relative) for name, relative in m.FILES.items()} == baseline['hashes']
    print('PASS: prepared record before exchange reports no exchange and clears latest pointer')

    m.signature = lambda app: dict(SIGNATURE)
    report = {'schemaVersion': 2, 'buildId': build_id, 'themeVersion': '0.4.0',
              'installedBaseline': baseline, 'stagedSnapshot': replacement,
              'newHeaderHash': 'synthetic-header', 'signingIdentity': {'teamIdentifier': 'TESTTEAM01'},
              **{key: True for key in m.VERIFICATIONS}}
    m.REPORT.write_text(json.dumps(report))
    assert m.preflight('install')['resumePrepared'] is True
    print('PASS: interrupted unexchanged build can be retried without overwriting any backup')

with tempfile.TemporaryDirectory(prefix='neon-snapshot-test-') as directory:
    configure(Path(directory).resolve())
    bundle(m.APP, 'current')
    expected = m.snapshot(m.APP)
    changed = copy.deepcopy(expected)
    changed['version'], changed['build'] = '26.1007.30912', '20156'
    message = must_reject(lambda: m.require_snapshot(changed, expected, 'Installed app'), 'differs')
    assert 'Recorded Codex: 26.1007.21159 (build 20052)' in message
    assert 'found: 26.1007.30912 (build 20156)' in message
    assert 'Rebuild Neon Codex for the installed app version' in message

    changed['version'] = expected['version']
    message = must_reject(lambda: m.require_snapshot(changed, expected, 'Installed app after waiting'), 'differs')
    assert message.startswith('Installed app after waiting differs')
    assert 'found: 26.1007.21159 (build 20156)' in message
    assert 'Rebuild Neon Codex for the installed app version' in message

    # The message is diagnostic only: byte and signature mismatches must still
    # fail even when the app reports exactly the recorded version and build.
    for field in m.FILES:
        changed = copy.deepcopy(expected)
        changed['hashes'][field] = 'changed'
        message = must_reject(lambda: m.require_snapshot(changed, expected, 'Installed app'), 'refusing to swap')
        assert 'Recorded Codex:' not in message and 'Rebuild Neon Codex' not in message
    for signature_key in ('signature', 'frameworkSignature'):
        for field, value in (('teamIdentifier', 'OTHERTEAM0'), ('cdHash', 'changed'),
                             ('flags', 0), ('adHoc', True), ('authorities', ['Changed chain'])):
            changed = copy.deepcopy(expected)
            changed[signature_key][field] = value
            must_reject(lambda: m.require_snapshot(changed, expected, 'Installed app'), 'refusing to swap')
    m.require_snapshot(dict(expected, app='/relocated/ChatGPT.app'), expected, 'Relocated app')
    print('PASS: version/build changes explain rebuild action; byte/signature mismatches still reject')


def relocated_record(base, state='installed', at_staging=False):
    """Keep the target fixed while the entire checkout moves, as on a real Mac."""
    old_local = base / 'old checkout' / '.local'
    configure(old_local)
    m.APP = base / 'Applications' / 'ChatGPT.app'
    build_id = str(uuid.uuid4())
    backup = m.RECOVERY / build_id / 'ChatGPT.app'
    bundle(m.APP, 'current')
    bundle(m.STAGED if at_staging else backup, 'previous')
    baseline = m.snapshot(m.STAGED if at_staging else backup)
    record_file, record = record_for(build_id, baseline, m.snapshot(m.APP), state)
    old_local.parent.rename(base / 'moved checkout')
    configure(base / 'moved checkout' / '.local')
    m.APP = base / 'Applications' / 'ChatGPT.app'
    return m.RECOVERY / build_id / 'record.json', record


for at_staging in (False, True):
    with tempfile.TemporaryDirectory(prefix='neon-relocated-restore-') as directory:
        base = Path(directory).resolve()
        record_file, record = relocated_record(
            base, 'exchanged' if at_staging else 'installed', at_staging)
        original_record = record_file.read_bytes()
        original_pointer = m.LATEST.read_bytes()
        previous = m.STAGED if at_staging else record_file.parent / 'ChatGPT.app'
        plan = m.preflight('restore')
        assert plan['replacement'] == previous
        assert record_file.read_bytes() == original_record and m.LATEST.read_bytes() == original_pointer
        assert not (base / 'old checkout').exists()

        # Relocation never relaxes byte/signature checks on the incoming bundle.
        archive = previous / m.FILES['archive']
        contents = archive.read_bytes()
        archive.write_bytes(b'changed after moving')
        must_reject(lambda: m.preflight('restore'), 'Previous app backup differs')
        archive.write_bytes(contents)
        m.signature = lambda app: dict(SIGNATURE, cdHash='wrong signature')
        must_reject(lambda: m.preflight('restore'), 'Previous app backup differs')
        m.signature = lambda app: dict(SIGNATURE)

        with contextlib.redirect_stdout(io.StringIO()):
            m.wait_and_swap('restore', 5)
        assert m.comparable(m.snapshot(m.APP)) == m.comparable(record['baseline'])
        restored = json.loads(record_file.read_text())
        assert restored['state'] == 'restored'
        assert restored['backupPath'] == record['backupPath']
        assert restored['stagedPath'] == record['stagedPath']
        assert restored['baseline'] == record['baseline']
        displaced = record_file.parent / 'Replaced Neon Codex.app'
        assert restored['displacedBuildPath'] == str(displaced)
        assert m.comparable(m.snapshot(displaced)) == m.comparable(record['replacement'])
        print('PASS: moved checkout restores verified previous app from ' +
              ('interrupted staging' if at_staging else 'recovery backup') +
              ' without rewriting historical paths')

with tempfile.TemporaryDirectory(prefix='neon-relocated-prepared-') as directory:
    base = Path(directory).resolve()
    record_file, record = relocated_record(base, 'prepared', True)
    # This prepared build was never exchanged: current app is the baseline and
    # staging holds the incoming replacement, even after the checkout moves.
    record['baseline'], record['replacement'] = record['replacement'], record['baseline']
    m.atomic_json(record_file, record)
    original_record = record_file.read_bytes()
    original_pointer = m.LATEST.read_bytes()
    assert m.preflight('restore')['noExchange'] is True
    assert record_file.read_bytes() == original_record and m.LATEST.read_bytes() == original_pointer
    print('PASS: moved prepared record recognizes no exchange with unchanged journal')

with tempfile.TemporaryDirectory(prefix='neon-relocated-invalid-') as directory:
    base = Path(directory).resolve()
    record_file, original = relocated_record(base)
    old_local = base / 'old checkout' / '.local'
    other_id = str(uuid.uuid4())
    malformed = [
        {'buildId': other_id},
        {'backupPath': str(old_local / 'recovery' / other_id / 'ChatGPT.app')},
        {'stagedPath': str(base / 'unrelated' / '.local' / 'staging' / 'ChatGPT.app')},
        {'backupPath': str(base / 'not-local' / 'recovery' / original['buildId'] / 'ChatGPT.app'),
         'stagedPath': str(base / 'not-local' / 'staging' / 'ChatGPT.app')},
        {'backupPath': str(old_local / 'recovery') + '/../recovery/' + original['buildId'] + '/ChatGPT.app'},
        {'stagedPath': str(old_local) + '/./staging/ChatGPT.app'},
        {'stagedPath': str(old_local) + '//staging/ChatGPT.app'},
        {'backupPath': '/' + str(old_local / 'recovery' / original['buildId'] / 'ChatGPT.app'),
         'stagedPath': '/' + str(old_local / 'staging' / 'ChatGPT.app')},
        {'backupPath': str(old_local.parent) + '\0/.local/recovery/' + original['buildId'] + '/ChatGPT.app',
         'stagedPath': str(old_local.parent) + '\0/.local/staging/ChatGPT.app'},
        {'stagedPath': str(old_local / 'staging' / 'ChatGPT.app') + '/'},
        {'backupPath': 'relative/.local/recovery/' + original['buildId'] + '/ChatGPT.app'},
        {'backupPath': '/ChatGPT.app'},
        {'backupPath': None},
    ]
    for changes in malformed:
        m.atomic_json(record_file, dict(original, **changes))
        before = record_file.read_bytes()
        must_reject(lambda: m.preflight('restore'), 'recovery')
        assert record_file.read_bytes() == before
    print('PASS: relocated recovery rejects wrong build IDs, roots, traversal, and noncanonical paths')

for redirected in ('pointer', 'record', 'record directory', 'backup', 'staging', 'dangling backup'):
    with tempfile.TemporaryDirectory(prefix='neon-relocated-symlink-') as directory:
        base = Path(directory).resolve()
        record_file, record = relocated_record(base)
        backup = record_file.parent / 'ChatGPT.app'
        if redirected == 'pointer':
            candidate = m.LATEST
        elif redirected == 'record':
            candidate = record_file
        elif redirected == 'record directory':
            candidate = record_file.parent
        elif redirected == 'staging':
            bundle(m.STAGED, 'unrelated staged build')
            candidate = m.STAGED.parent
        else:
            candidate = backup
        target = base / 'redirected target'
        candidate.rename(target)
        candidate.symlink_to(base / 'missing' if redirected == 'dangling backup' else target)
        must_reject(lambda: m.preflight('restore'),
                    'real directory' if redirected == 'record directory' else 'redirected')
        assert candidate.is_symlink()
        print('PASS: relocated recovery rejects symlink redirect in ' + redirected)
