"""Refresh regression tests: temporary fake bundles and mocked external calls only.

Never reads, launches, quits, copies, signs, or exchanges the user's installed app.
"""
import contextlib
import copy
import fcntl
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('neon_refresh_test', ROOT / 'scripts/refresh.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sys.path.pop(0)
i = m.installer
OLD = ('26.1007.21159', '20052')
NEW = ('26.1007.30912', '20156')
SIG = {'identifier': 'com.openai.codex', 'teamIdentifier': 'TESTTEAM01',
       'cdHash': 'synthetic', 'flags': 0x10000, 'adHoc': False, 'authorities': ['Test only']}


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='neon-refresh-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        local = self.root / '.local'
        for obj, fields in ((m, {'ROOT': self.root, 'PINS': self.root / 'scripts/source-pins.json'}),
                            (i, {'ROOT': self.root, 'LOCAL': local, 'APP': self.root / 'Applications/ChatGPT.app',
                                 'STAGED': local / 'staging/ChatGPT.app',
                                 'REPORT': local / 'staging/ChatGPT.app.build-report.json',
                                 'RECOVERY': local / 'recovery', 'LATEST': local / 'recovery/latest.json',
                                 'STATUS': local / 'install-status.json', 'LOCK': local / 'install.lock'})):
            for key, value in fields.items():
                self.enterContext(patch.object(obj, key, value))
        self.enterContext(patch.object(i, 'signature', return_value=copy.deepcopy(SIG)))
        self.wait = self.enterContext(patch.object(i, 'wait_and_swap'))
        self.build = self.enterContext(patch.object(m, 'build_command', side_effect=self.build_command))
        self.external = self.enterContext(patch.object(m.subprocess, 'run', side_effect=self.external_command))
        self.output = self.enterContext(contextlib.redirect_stdout(io.StringIO()))
        self.root.joinpath('scripts').mkdir()
        m.PINS.write_text(json.dumps({f'{version}:{build}': {'bundle': 'com.openai.codex', 'version': version, 'build': build} for version, build in (OLD, NEW)}))
        (self.root / 'package.json').write_text('{"version":"0.8.4"}')
        for name in m.ASSETS:
            file = self.root / name
            file.parent.mkdir(exist_ok=True)
            file.write_text('test source ' + name)
        self.bundle(i.APP)

    # context-manager support is intentionally compatible with macOS Python 3.9.
    def enterContext(self, manager):
        value = manager.__enter__()
        self.addCleanup(manager.__exit__, None, None, None)
        return value

    def bundle(self, app, version=NEW, label='official', official=True):
        app.mkdir(parents=True, exist_ok=True)
        for name, relative in i.FILES.items():
            file = app / relative
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(label + name)
        (app / i.FILES['plist']).write_bytes(plistlib.dumps({
            'CFBundleIdentifier': 'com.openai.codex', 'CFBundleShortVersionString': version[0],
            'CFBundleVersion': version[1], 'Official': official,
            'ElectronAsarIntegrity': {'Resources/app.asar': {'hash': 'test-header'}}}))

    def cached(self, version=NEW):
        app = i.LOCAL / 'originals' / f'{version[0]}-{version[1]}' / 'ChatGPT.app'
        self.bundle(app, version)
        return app

    def report(self, baseline=None, theme='0.8.4'):
        if not i.STAGED.exists():
            self.bundle(i.STAGED, label='patched', official=False)
        value = {'schemaVersion': 2, 'buildId': str(uuid.uuid4()), 'themeVersion': theme,
                 'installedBaseline': baseline or i.snapshot(i.APP), 'stagedSnapshot': i.snapshot(i.STAGED),
                 'sourceAssets': m.theme_inputs()[1], 'newHeaderHash': 'test-header',
                 'signingIdentity': {'teamIdentifier': SIG['teamIdentifier'], 'sha1': 'A' * 40},
                 **{name: True for name in i.VERIFICATIONS}}
        i.REPORT.write_text(json.dumps(value))
        return value

    def build_command(self, *arguments, quiet=False):
        args = list(arguments)
        if '--check-identity' in args:
            if args[args.index('--identity') + 1] not in ('A' * 40, 'B' * 40):
                raise RuntimeError('Certificate is not available')
            return
        source = Path(args[args.index('--source') + 1])
        with (source / i.FILES['plist']).open('rb') as handle:
            info = plistlib.load(handle)
        if not info.get('Official'):
            raise RuntimeError('Source does not match reviewed vendor signature and hashes')
        if '--inspect' in args:
            return
        if i.STAGED.exists():
            raise AssertionError('Builder received an occupied output')
        report = self.report()
        if '--identity' in args:
            report['signingIdentity']['sha1'] = args[args.index('--identity') + 1]
            i.REPORT.write_text(json.dumps(report))

    def external_command(self, arguments, **kwargs):
        self.assertEqual(arguments[0], '/usr/bin/ditto')
        shutil.copytree(arguments[1], arguments[2])
        return subprocess.CompletedProcess(arguments, 0)

    def completed_install(self):
        report = self.report()
        shutil.rmtree(i.APP)
        i.STAGED.rename(i.APP)
        record = i.RECOVERY / report['buildId'] / 'record.json'
        record.parent.mkdir(parents=True)
        record.write_text(json.dumps({'schemaVersion': 1, 'buildId': report['buildId'],
                                     'state': 'installed', 'target': str(i.APP),
                                     'replacement': report['stagedSnapshot'], 'buildReport': report}))
        i.LATEST.write_text(json.dumps({'buildId': report['buildId']}))
        return report

    def test_exact_completed_install_is_read_only_noop(self):
        self.completed_install()
        files = sorted(str(path) for path in self.root.rglob('*'))
        m.refresh()
        self.assertEqual(sorted(str(path) for path in self.root.rglob('*')), files)
        self.assertFalse(i.LOCK.exists())
        self.build.assert_not_called()
        self.wait.assert_not_called()
        self.assertIn('already installed', self.output.getvalue())

    def test_vendor_update_is_not_completed_install_noop(self):
        self.completed_install()
        self.bundle(i.APP, OLD)
        m.refresh(prepare_only=True)
        self.assertTrue(i.STAGED.exists())
        self.assertEqual(json.loads(i.REPORT.read_text())['installedBaseline']['build'], OLD[1])
        self.assertNotIn('already installed', self.output.getvalue())

    def test_completed_install_changed_source_requires_new_build(self):
        self.completed_install()
        self.cached()
        (self.root / m.ASSETS[0]).write_text('changed source')
        m.refresh(prepare_only=True)
        self.assertTrue(i.STAGED.exists())
        self.assertNotIn('already installed', self.output.getvalue())

    def test_completed_install_does_not_hide_new_staging(self):
        self.completed_install()
        self.report()
        m.refresh()
        self.wait.assert_called_once()
        self.assertNotIn('already installed', self.output.getvalue())

    def test_explicit_identity_is_checked_for_reuse_and_noop(self):
        self.report()
        m.prepare(identity='a' * 40)
        self.build.assert_called_once_with('--check-identity', '--identity', 'A' * 40, quiet=True)
        self.build.reset_mock()
        self.completed_install()
        m.refresh(identity='a' * 40)
        self.build.assert_called_once_with('--check-identity', '--identity', 'A' * 40, quiet=True)
        self.wait.assert_not_called()

    def test_explicit_different_identity_rebuilds_reuse_and_noop(self):
        self.cached()
        self.report()
        m.prepare(identity='B' * 40)
        self.assertEqual(json.loads(i.REPORT.read_text())['signingIdentity']['sha1'], 'B' * 40)
        self.completed_install()
        m.refresh(prepare_only=True, identity='B' * 40)
        self.assertTrue(i.STAGED.exists())
        self.assertEqual(json.loads(i.REPORT.read_text())['signingIdentity']['sha1'], 'B' * 40)

    def test_invalid_identity_fails_before_archiving_or_lock_creation(self):
        original = self.report()
        for identity in ('not-a-sha', 'C' * 40):
            with self.assertRaisesRegex(RuntimeError, 'SHA-1|not available'):
                m.prepare(identity=identity)
            self.assertEqual(json.loads(i.REPORT.read_text()), original)
            self.assertFalse(i.LOCK.exists())
            self.assertFalse((i.LOCAL / 'superseded-staging').exists())

    def test_unknown_version_stops_before_any_local_mutation(self):
        self.bundle(i.APP, ('99.1', '999'))
        before = i.snapshot(i.APP)
        with self.assertRaisesRegex(RuntimeError, 'has not been reviewed'):
            m.refresh(prepare_only=True)
        self.assertFalse(i.LOCAL.exists())
        self.assertEqual(i.snapshot(i.APP), before)
        self.build.assert_not_called()
        self.wait.assert_not_called()

    def test_prepare_reuses_exact_current_build_and_never_waits(self):
        expected = self.report()
        before = i.snapshot(i.APP)
        m.refresh(prepare_only=True)
        self.assertEqual(json.loads(i.REPORT.read_text()), expected)
        self.assertEqual(i.snapshot(i.APP), before)
        self.build.assert_not_called()
        self.wait.assert_not_called()
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())

    def test_stale_baseline_is_archived_and_reviewed_cache_rebuilt(self):
        old_app = self.root / 'old/ChatGPT.app'
        self.bundle(old_app, OLD)
        previous = self.report(dict(i.snapshot(old_app), app=str(i.APP)))
        cached = self.cached()
        before = i.snapshot(i.APP)
        result = m.prepare(identity='A' * 40)
        saved = list((i.LOCAL / 'superseded-staging').iterdir())
        self.assertEqual(len(saved), 1)
        self.assertEqual(json.loads((saved[0] / i.REPORT.name).read_text()), previous)
        self.assertTrue((saved[0] / 'ChatGPT.app').is_dir())
        self.assertEqual(result['installedBaseline'], before)
        self.assertEqual(i.snapshot(i.APP), before)
        self.assertIn(cached, self.build.call_args.args)
        self.assertIn('A' * 40, self.build.call_args.args)

    def test_stale_theme_or_source_assets_rebuild_not_reuse(self):
        self.cached()
        self.report(theme='0.8.3')
        m.prepare()
        self.assertEqual(len(list((i.LOCAL / 'superseded-staging').iterdir())), 1)
        (self.root / m.ASSETS[0]).write_text('new CSS')
        m.prepare()
        self.assertEqual(len(list((i.LOCAL / 'superseded-staging').iterdir())), 2)
        self.assertEqual(json.loads(i.REPORT.read_text())['sourceAssets'], m.theme_inputs()[1])

    def test_staged_code_tampering_rejected_without_archive_or_build(self):
        self.report()
        (i.STAGED / i.FILES['archive']).write_text('changed code')
        with self.assertRaisesRegex(RuntimeError, 'Staged app differs'):
            m.prepare()
        self.build.assert_not_called()
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())
        self.assertTrue(i.STAGED.is_dir())

    def test_staged_signature_mismatch_is_not_rebuilt_or_ignored(self):
        report = self.report()
        report['signingIdentity']['teamIdentifier'] = 'OTHERTEAM0'
        i.REPORT.write_text(json.dumps(report))
        with self.assertRaisesRegex(RuntimeError, 'Staged signature differs'):
            m.prepare()
        self.build.assert_not_called()

    def test_source_cache_inspection_failure_preserves_staging(self):
        cached = self.cached()
        self.bundle(cached, official=False)
        report = self.report(theme='0.8.3')
        with self.assertRaisesRegex(RuntimeError, 'reviewed vendor'):
            m.prepare()
        self.assertEqual(json.loads(i.REPORT.read_text()), report)
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())

    def test_vendor_source_copied_verified_before_build(self):
        before = i.snapshot(i.APP)
        m.prepare()
        cached = i.LOCAL / 'originals' / f'{NEW[0]}-{NEW[1]}' / 'ChatGPT.app'
        self.assertEqual(i.comparable(i.snapshot(cached)), i.comparable(before))
        self.external.assert_called_once()
        self.assertEqual(i.snapshot(i.APP), before)
        self.assertEqual(i.preflight('install')['current'], before)

    def test_local_theme_cannot_be_used_as_pristine_source(self):
        self.bundle(i.APP, official=False)
        with self.assertRaisesRegex(RuntimeError, 'reviewed vendor'):
            m.prepare()
        self.external.assert_not_called()
        self.assertFalse((i.LOCAL / 'originals').exists())
        self.assertFalse(i.STAGED.exists())

    def test_matching_legacy_source_reused_and_wrong_version_skipped(self):
        legacy = i.LOCAL / 'original/ChatGPT.app'
        self.bundle(legacy)
        m.prepare()
        self.external.assert_not_called()
        self.assertIn(legacy, self.build.call_args.args)
        i.STAGED.rename(self.root / 'first-staged')
        i.REPORT.unlink()
        self.bundle(legacy, OLD)
        m.prepare()
        self.external.assert_called_once()
        self.assertNotIn(legacy, self.build.call_args.args)

    def test_active_lock_prevents_refresh_mutations(self):
        i.LOCAL.mkdir()
        with i.LOCK.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, 'Another Neon Codex'):
                m.prepare()
        self.build.assert_not_called()
        self.assertFalse(i.STAGED.parent.exists())

    def test_prepare_holds_lock_but_wait_receives_it_released(self):
        self.report()
        def wait(mode, timeout):
            self.assertEqual(mode, 'install')
            with i.LOCK.open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.wait.side_effect = wait
        original = i.preflight
        def preflight(mode):
            with i.LOCK.open('a') as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return original(mode)
        with patch.object(i, 'preflight', side_effect=preflight):
            m.refresh()
        self.wait.assert_called_once()

    def test_redirected_staging_and_lock_are_rejected(self):
        i.LOCAL.mkdir()
        outside = self.root / 'elsewhere'
        outside.mkdir()
        i.STAGED.parent.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'redirected'):
            m.prepare()
        i.STAGED.parent.unlink()
        i.LOCK.unlink()
        i.LOCK.symlink_to(self.root / 'missing')
        with self.assertRaisesRegex(RuntimeError, 'redirected|symbolic'):
            m.prepare()
        self.assertFalse((self.root / 'missing').exists())

    def test_interrupted_recovery_is_not_archived(self):
        self.report(theme='0.8.3')
        record = i.RECOVERY / str(uuid.uuid4()) / 'record.json'
        record.parent.mkdir(parents=True)
        record.write_text('{"state":"installed_backup_at_staging"}')
        with self.assertRaisesRegex(RuntimeError, 'interrupted installation'):
            m.prepare()
        self.assertTrue(i.STAGED.is_dir())
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())
        self.build.assert_not_called()

    def test_reviewed_update_during_quit_retries_matching_build(self):
        self.bundle(i.APP, OLD)
        self.report()
        self.cached(NEW)
        def wait(mode, timeout):
            if self.wait.call_count == 1:
                self.bundle(i.APP, NEW)
                raise RuntimeError('Installed app after waiting differs')
        self.wait.side_effect = wait
        m.refresh()
        self.assertEqual(self.wait.call_count, 2)
        self.assertEqual(json.loads(i.REPORT.read_text())['installedBaseline']['build'], NEW[1])
        self.assertIn('trying again', self.output.getvalue())

    def test_unknown_update_during_quit_stops_without_rebuild(self):
        self.report()
        def wait(mode, timeout):
            self.bundle(i.APP, ('99.1', '999'))
            raise RuntimeError('Installed app after waiting differs')
        self.wait.side_effect = wait
        with self.assertRaisesRegex(RuntimeError, 'has not been reviewed'):
            m.refresh()
        self.wait.assert_called_once()
        self.build.assert_not_called()
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())

    def test_same_version_content_change_is_not_retry_trigger(self):
        self.report()
        def wait(mode, timeout):
            (i.APP / i.FILES['archive']).write_text('changed same-version content')
            raise RuntimeError('Installed app after waiting differs')
        self.wait.side_effect = wait
        with self.assertRaisesRegex(RuntimeError, 'Installed app after waiting differs'):
            m.refresh()
        self.wait.assert_called_once()
        self.build.assert_not_called()

    def test_repeated_reviewed_updates_are_bounded(self):
        self.report()
        self.cached(OLD)
        self.cached(NEW)
        def wait(mode, timeout):
            current = i.snapshot(i.APP)
            self.bundle(i.APP, OLD if current['build'] == NEW[1] else NEW)
            raise RuntimeError('Installed app after waiting differs')
        self.wait.side_effect = wait
        with self.assertRaisesRegex(RuntimeError, 'changed versions repeatedly'):
            m.refresh()
        self.assertEqual(self.wait.call_count, m.MAX_ATTEMPTS)

    def test_possible_started_exchange_never_retries(self):
        report = self.report()
        def wait(mode, timeout):
            record = i.RECOVERY / report['buildId'] / 'record.json'
            record.parent.mkdir(parents=True)
            record.write_text('{"state":"prepared"}')
            self.bundle(i.APP, OLD)
            raise RuntimeError('Journal error')
        self.wait.side_effect = wait
        with self.assertRaisesRegex(RuntimeError, 'Journal error'):
            m.refresh()
        self.wait.assert_called_once()
        self.build.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
