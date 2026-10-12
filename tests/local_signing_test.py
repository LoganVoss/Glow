"""Opt-in local signing and recovery checks using temporary fake apps only.

No app, Keychain, signing command, process, or system policy is touched.
The inherited refresh cases also exercise backward compatibility with schema 2.
"""
import copy
import importlib.util
import json
from pathlib import Path
import plistlib
import shutil
import unittest

spec = importlib.util.spec_from_file_location('glow_refresh_fixture', Path(__file__).with_name('refresh_test.py'))
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
m, i = fixture.m, fixture.i
SHA1 = 'C' * 40
STABLE_IDENTITY = {'kind': 'local', 'strategy': 'persistent-self-signed', 'sha1': SHA1,
                   'certificateSha256': 'd' * 64, 'name': 'Glow Local Test',
                   'teamIdentifier': None, 'keychainPath': '/test/Glow/local.keychain-db',
                   'certificateValidTo': '2099-01-01T00:00:00Z'}
VERIFY_REQUIREMENT = i.verify_stable_requirement


class LocalSigningTests(fixture.RefreshTests):
    def setUp(self):
        super().setUp()
        i.signature.side_effect = self.fake_signature
        self.verify_requirement = self.enterContext(fixture.patch.object(i, 'verify_stable_requirement'))
        self.inspect_identity = self.enterContext(fixture.patch.object(m, 'inspect_local_identity', return_value=copy.deepcopy(STABLE_IDENTITY)))

    def fake_signature(self, path):
        path = Path(path)
        bundle = next((candidate for candidate in (path, *path.parents)
                       if candidate.suffix == '.app' and (candidate / i.FILES['plist']).is_file()), None)
        if bundle:
            with (bundle / i.FILES['plist']).open('rb') as handle:
                info = plistlib.load(handle)
            if info.get('LocalSigning'):
                stable = info['LocalSigning'] == 'stable'
                identifier = 'com.openai.codex.framework' if str(path).endswith(i.FILES['framework']) else 'com.openai.codex'
                return {**copy.deepcopy(fixture.SIG), 'identifier': identifier, 'teamIdentifier': None,
                        'flags': 0x10000 if stable else 0x10002, 'adHoc': not stable,
                        'authorities': ['Glow Local Test'] if stable else []}
        return copy.deepcopy(fixture.SIG)

    def local_report(self, label='local patched', legacy=False):
        if not i.STAGED.exists():
            self.bundle(i.STAGED, label=label, official=False)
        plist = i.STAGED / i.FILES['plist']
        info = plistlib.loads(plist.read_bytes())
        info['LocalSigning'] = 'ad-hoc' if legacy else 'stable'
        plist.write_bytes(plistlib.dumps(info))
        report = self.report()
        report.update(schemaVersion=3 if legacy else 4, signingMode='local',
                      signingIdentity=None if legacy else copy.deepcopy(STABLE_IDENTITY),
                      signingPolicyVerified=True, signingTeamVerified=False,
                      libraryValidationException=True)
        if not legacy:
            report.update(localSigningStrategy='persistent-self-signed', stableIdentityVerified=True)
        i.REPORT.write_text(json.dumps(report))
        return report

    def build_command(self, *arguments, quiet=False):
        if '--local-signing' not in arguments:
            return super().build_command(*arguments, quiet=quiet)
        self.assertNotIn('--identity', arguments)
        source = Path(arguments[arguments.index('--source') + 1])
        info = plistlib.loads((source / i.FILES['plist']).read_bytes())
        if not info.get('Official'):
            raise RuntimeError('Source does not match reviewed vendor signature and hashes')
        self.assertFalse(i.STAGED.exists())
        self.local_report()

    def install_local_fixture(self, label='local installed', legacy=False):
        report = self.local_report(label, legacy=legacy)
        if legacy:
            record_file = i.RECOVERY / report['buildId'] / 'record.json'
            record = {'schemaVersion': 1, 'buildId': report['buildId'], 'target': str(i.APP),
                      'baseline': report['installedBaseline'], 'replacement': report['stagedSnapshot'],
                      'stagedPath': str(i.STAGED), 'backupPath': str(record_file.parent / 'ChatGPT.app'),
                      'buildReport': report}
            if i.LATEST.exists():
                record['previousBuildId'] = json.loads(i.LATEST.read_text())['buildId']
        else:
            plan = i.preflight('install', allow_local_signing=True)
            record, record_file = plan['record'], plan['recordFile']
        record_file.parent.mkdir(parents=True)
        i.APP.rename(Path(record['backupPath']))
        i.STAGED.rename(i.APP)
        record['state'] = 'installed'
        record_file.write_text(json.dumps(record))
        i.LATEST.write_text(json.dumps({'buildId': report['buildId']}))
        return report, record

    def test_local_replacement_requires_explicit_installer_opt_in(self):
        report = self.local_report()
        with self.assertRaisesRegex(RuntimeError, 'explicit --allow-local-signing'):
            i.preflight('install')
        plan = i.preflight('install', allow_local_signing=True)
        self.assertEqual(plan['team'], 'local')
        self.assertEqual(plan['incoming'], report['stagedSnapshot'])
        self.assertFalse(i.LATEST.exists())

    def test_local_prepare_never_looks_up_a_certificate(self):
        result = m.prepare(local_signing=True)
        self.assertEqual(result['schemaVersion'], 4)
        self.assertEqual(result['signingIdentity']['sha1'], SHA1)
        self.assertTrue(any('--local-signing' in call.args for call in self.build.call_args_list))
        self.assertFalse(any('--check-identity' in call.args or '--identity' in call.args
                             for call in self.build.call_args_list))
        self.wait.assert_not_called()

    def test_exact_local_stage_is_reused_only_in_local_mode(self):
        expected = self.local_report()
        self.assertEqual(m.prepare(local_signing=True), expected)
        self.build.assert_not_called()
        self.cached()
        result = m.prepare()
        self.assertEqual(result['schemaVersion'], 2)
        self.assertTrue((i.LOCAL / 'superseded-staging').is_dir())
        self.assertFalse(any('--local-signing' in call.args for call in self.build.call_args_list))

    def test_certificate_stage_is_rebuilt_for_local_mode(self):
        self.report()
        self.cached()
        result = m.prepare(local_signing=True)
        self.assertEqual(result['schemaVersion'], 4)
        self.assertTrue((i.LOCAL / 'superseded-staging').is_dir())

    def test_local_refresh_passes_explicit_install_permission(self):
        self.local_report()
        m.refresh(local_signing=True)
        self.wait.assert_called_once_with('install', 1800, allow_local_signing=True)

    def test_local_prepare_only_does_not_wait_or_install(self):
        self.local_report()
        before = i.snapshot(i.APP)
        m.refresh(prepare_only=True, local_signing=True)
        self.wait.assert_not_called()
        self.assertEqual(i.snapshot(i.APP), before)

    def test_local_identity_options_are_mutually_exclusive_before_mutation(self):
        with self.assertRaisesRegex(RuntimeError, 'mutually exclusive'):
            m.prepare(identity='A' * 40, local_signing=True)
        with self.assertRaisesRegex(RuntimeError, 'mutually exclusive'):
            m.refresh(identity='A' * 40, local_signing=True)
        self.assertFalse(i.LOCAL.exists())
        self.build.assert_not_called()

    def test_local_policy_fields_cannot_be_omitted_or_downgraded(self):
        original = self.local_report()
        changes = ({'signingPolicyVerified': False}, {'signingTeamVerified': True},
                   {'libraryValidationException': False}, {'signingMode': 'certificate'},
                   {'signingIdentity': {'teamIdentifier': 'TESTTEAM01'}}, {'schemaVersion': 2},
                   {'stableIdentityVerified': False}, {'localSigningStrategy': 'ad-hoc'})
        for change in changes:
            with self.subTest(change=change):
                report = {**original, **change}
                i.REPORT.write_text(json.dumps(report))
                with self.assertRaisesRegex(RuntimeError, 'required checks'):
                    i.preflight('install', allow_local_signing=True)
        self.assertFalse(i.LATEST.exists())

    def test_tampered_local_stage_is_never_rebuilt_or_ignored(self):
        self.local_report()
        (i.STAGED / i.FILES['archive']).write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'Staged app differs'):
            m.prepare(local_signing=True)
        self.build.assert_not_called()
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())

    def test_arbitrary_ad_hoc_installed_app_is_rejected(self):
        self.local_report()
        shutil.rmtree(i.APP)
        i.STAGED.rename(i.APP)
        with self.assertRaisesRegex(RuntimeError, 'no matching verified local Glow recovery record'):
            m.reviewed_snapshot()
        self.assertFalse(i.LATEST.exists())

    def test_complete_local_install_has_a_read_only_noop(self):
        self.install_local_fixture()
        files = sorted(str(path) for path in self.root.rglob('*'))
        m.refresh(local_signing=True)
        self.assertEqual(sorted(str(path) for path in self.root.rglob('*')), files)
        self.assertFalse(i.LOCK.exists())
        self.build.assert_not_called()
        self.wait.assert_not_called()

    def test_complete_local_install_is_not_certificate_mode_noop(self):
        self.install_local_fixture()
        self.cached()
        m.refresh(prepare_only=True)
        self.assertEqual(json.loads(i.REPORT.read_text())['schemaVersion'], 2)
        self.assertNotIn('already installed', self.output.getvalue())

    def test_recorded_local_baseline_refreshes_again(self):
        self.install_local_fixture()
        self.cached()
        (self.root / m.ASSETS[0]).write_text('changed glow css')
        report = m.prepare(local_signing=True)
        self.assertEqual(report['schemaVersion'], 4)
        self.assertFalse(report['installedBaseline']['signature']['adHoc'])

    def test_local_baseline_record_must_match_both_record_and_build_report(self):
        _, record = self.install_local_fixture()
        path = i.RECOVERY / record['buildId'] / 'record.json'
        record['buildReport']['stagedSnapshot']['hashes']['archive'] = 'different'
        path.write_text(json.dumps(record))
        with self.assertRaisesRegex(RuntimeError, 'no matching verified local Glow recovery record'):
            m.reviewed_snapshot()

    def test_local_signature_still_requires_hardened_runtime(self):
        report = self.local_report()
        value = copy.deepcopy(report['stagedSnapshot'])
        for field, change in (('signature', {'flags': 2}), ('frameworkSignature', {'teamIdentifier': 'BADTEAM123'}),
                              ('frameworkSignature', {'adHoc': True})):
            changed = copy.deepcopy(value)
            changed[field].update(change)
            with self.assertRaisesRegex(RuntimeError, 'hardened runtime'):
                i.require_report_signature(changed, report, 'Staged app', allow_local_signing=True)

    def test_restore_after_first_local_install_restores_certificate_without_opt_in(self):
        self.install_local_fixture()
        plan = i.preflight('restore')
        self.assertEqual(plan['team'], 'TESTTEAM01')
        self.assertFalse(plan['incoming']['signature']['adHoc'])

    def test_restore_previous_local_build_uses_recorded_ancestry(self):
        first, first_record = self.install_local_fixture('first local')
        second, second_record = self.install_local_fixture('second local')
        self.assertEqual(second_record['previousBuildId'], first_record['buildId'])
        plan = i.preflight('restore')
        self.assertEqual(plan['team'], 'local')
        self.assertEqual(i.comparable(plan['incoming']), i.comparable(first['stagedSnapshot']))

    def test_unrecognized_local_backup_does_not_pass_restore(self):
        self.install_local_fixture('first local')
        _, second_record = self.install_local_fixture('second local')
        second_record.pop('previousBuildId')
        (i.RECOVERY / second_record['buildId'] / 'record.json').write_text(json.dumps(second_record))
        with self.assertRaisesRegex(RuntimeError, 'no matching verified local Glow recovery record'):
            i.preflight('restore')

    def test_restored_local_build_remains_a_valid_recorded_baseline(self):
        _, first_record = self.install_local_fixture('first local')
        _, second_record = self.install_local_fixture('second local')
        backup = Path(second_record['backupPath'])
        shutil.rmtree(i.APP)
        backup.rename(i.APP)
        second_record['state'] = 'restored'
        (i.RECOVERY / second_record['buildId'] / 'record.json').write_text(json.dumps(second_record))
        self.assertEqual(i.require_installed_signature(i.snapshot(i.APP)), 'local')

    def test_redirected_local_recovery_pointer_is_rejected(self):
        self.install_local_fixture()
        other = self.root / 'other-latest.json'
        i.LATEST.rename(other)
        i.LATEST.symlink_to(other)
        with self.assertRaisesRegex(RuntimeError, 'redirected recovery pointer'):
            m.reviewed_snapshot()

    def test_local_recovery_cycle_is_rejected(self):
        _, record = self.install_local_fixture()
        record['replacement']['hashes']['archive'] = 'different'
        record['previousBuildId'] = record['buildId']
        (i.RECOVERY / record['buildId'] / 'record.json').write_text(json.dumps(record))
        with self.assertRaisesRegex(RuntimeError, 'Invalid local signing recovery chain'):
            m.reviewed_snapshot()

    def test_legacy_ad_hoc_stage_is_rebuilt_instead_of_reused(self):
        self.local_report(legacy=True)
        self.cached()
        report = m.prepare(local_signing=True)
        self.assertEqual(report['schemaVersion'], 4)
        self.assertTrue((i.LOCAL / 'superseded-staging').is_dir())

    def test_legacy_ad_hoc_stage_cannot_be_new_install(self):
        self.local_report(legacy=True)
        with self.assertRaisesRegex(RuntimeError, 'Legacy ad-hoc staging'):
            i.preflight('install', allow_local_signing=True)

    def test_legacy_installed_ad_hoc_build_migrates_instead_of_noop(self):
        self.install_local_fixture(legacy=True)
        self.cached()
        report = m.prepare(local_signing=True)
        self.assertEqual(report['schemaVersion'], 4)
        self.assertTrue(report['installedBaseline']['signature']['adHoc'])
        self.assertNotIn('already installed', self.output.getvalue())

    def test_stable_migration_can_restore_legacy_ad_hoc_backup(self):
        first, _ = self.install_local_fixture(legacy=True)
        self.install_local_fixture()
        plan = i.preflight('restore')
        self.assertEqual(plan['team'], 'local')
        self.assertTrue(plan['incoming']['signature']['adHoc'])
        self.assertEqual(i.comparable(first['stagedSnapshot']), i.comparable(plan['incoming']))

    def test_recovery_does_not_need_private_signing_identity(self):
        self.install_local_fixture('first stable')
        self.install_local_fixture('second stable')
        self.inspect_identity.side_effect = RuntimeError('Private key is missing')
        self.assertEqual(i.preflight('restore')['team'], 'local')
        self.inspect_identity.assert_not_called()

    def test_missing_identity_stops_staged_reuse_without_archiving(self):
        expected = self.local_report()
        self.inspect_identity.side_effect = RuntimeError('Private key is missing')
        with self.assertRaisesRegex(RuntimeError, 'Private key is missing'):
            m.prepare(local_signing=True)
        self.assertEqual(json.loads(i.REPORT.read_text()), expected)
        self.assertFalse((i.LOCAL / 'superseded-staging').exists())
        self.build.assert_not_called()

    def test_missing_identity_stops_installed_noop_without_creating_lock(self):
        self.install_local_fixture()
        self.inspect_identity.side_effect = RuntimeError('Private key is missing')
        with self.assertRaisesRegex(RuntimeError, 'Private key is missing'):
            m.prepare(local_signing=True)
        self.assertFalse(i.LOCK.exists())
        self.build.assert_not_called()

    def test_vendor_update_retains_previous_identity_pin(self):
        self.install_local_fixture()
        self.bundle(i.APP, fixture.OLD)
        self.assertEqual(i.local_identity_pin(), SHA1)
        m.prepare(local_signing=True)
        self.inspect_identity.assert_called_with(SHA1)
        self.assertEqual(json.loads(i.REPORT.read_text())['schemaVersion'], 4)

    def test_vendor_update_with_lost_identity_stops_before_mutation(self):
        self.install_local_fixture()
        self.bundle(i.APP, fixture.OLD)
        self.inspect_identity.side_effect = RuntimeError('Private key is missing')
        before = i.snapshot(i.APP)
        with self.assertRaisesRegex(RuntimeError, 'Private key is missing'):
            m.prepare(local_signing=True)
        self.assertEqual(i.snapshot(i.APP), before)
        self.assertFalse(i.LOCK.exists())
        self.build.assert_not_called()

    def test_stable_identity_pin_walks_beyond_latest_vendor_record(self):
        _, first = self.install_local_fixture()
        self.report()
        plan = i.preflight('install')
        record, file = plan['record'], plan['recordFile']
        file.parent.mkdir(parents=True)
        file.write_text(json.dumps(record))
        i.LATEST.write_text(json.dumps({'buildId': record['buildId']}))
        self.assertEqual(record['previousBuildId'], first['buildId'])
        self.assertEqual(i.local_identity_pin(), SHA1)

    def test_conflicting_identity_pins_stop_instead_of_rotating(self):
        self.install_local_fixture('first stable')
        _, record = self.install_local_fixture('second stable')
        record['buildReport']['signingIdentity']['sha1'] = 'E' * 40
        (i.RECOVERY / record['buildId'] / 'record.json').write_text(json.dumps(record))
        with self.assertRaisesRegex(RuntimeError, 'Conflicting stable local identity pins'):
            i.local_identity_pin()

    def test_direct_installer_rejects_staged_certificate_rotation(self):
        self.install_local_fixture()
        report = self.local_report()
        report['signingIdentity']['sha1'] = 'E' * 40
        i.REPORT.write_text(json.dumps(report))
        with self.assertRaisesRegex(RuntimeError, 'refusing key rotation'):
            i.preflight('install', allow_local_signing=True)

    def test_identity_pin_rejects_recovery_cycle_even_after_matching_record(self):
        _, record = self.install_local_fixture()
        record['previousBuildId'] = record['buildId']
        (i.RECOVERY / record['buildId'] / 'record.json').write_text(json.dumps(record))
        with self.assertRaisesRegex(RuntimeError, 'Invalid local signing recovery chain'):
            i.local_identity_pin()

    def test_existing_recovery_pointer_cannot_silently_drop_identity_pin(self):
        self.install_local_fixture()
        i.LATEST.write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Invalid local signing recovery pointer'):
            i.local_identity_pin()

    def test_snapshot_shape_preserves_legacy_recovery_compatibility(self):
        self.local_report()
        self.assertEqual(set(i.snapshot(i.STAGED)['signature']), set(fixture.SIG))

    def test_stable_signature_verifies_both_main_and_framework_certificate(self):
        report = self.local_report()
        i.require_report_signature(report['stagedSnapshot'], report, 'Staged app', allow_local_signing=True)
        self.assertEqual(self.verify_requirement.call_args_list, [
            fixture.unittest.mock.call(i.STAGED, 'com.openai.codex', SHA1, 'Staged app'),
            fixture.unittest.mock.call(i.STAGED / i.FILES['framework'], 'com.openai.codex.framework', SHA1, 'Staged app')])

    def test_wrong_signer_cannot_pass_stable_signature_check(self):
        report = self.local_report()
        self.verify_requirement.side_effect = RuntimeError('certificate requirement failed')
        with self.assertRaisesRegex(RuntimeError, 'certificate requirement failed'):
            i.require_report_signature(report['stagedSnapshot'], report, 'Staged app', allow_local_signing=True)

    def test_identity_only_requirement_is_rejected_even_with_valid_current_signer(self):
        result = fixture.subprocess.CompletedProcess([], 0, stdout='', stderr='designated => identifier "com.openai.codex"\n')
        with fixture.patch.object(i, 'run', return_value=result) as run:
            with self.assertRaisesRegex(RuntimeError, 'exact certificate-pinned'):
                VERIFY_REQUIREMENT(i.STAGED, 'com.openai.codex', SHA1, 'Staged app')
            self.assertIn('certificate leaf = H"' + SHA1 + '"', run.call_args_list[0].args[4])
            self.assertTrue(run.call_args_list[0].args[4].startswith('='))

    def test_exact_certificate_requirement_accepts_codesign_canonical_hash_case(self):
        result = fixture.subprocess.CompletedProcess([], 0, stdout='', stderr=(
            'Executable=/test\ndesignated => identifier "com.openai.codex" and certificate leaf = H"' + SHA1.lower() + '"\n'))
        with fixture.patch.object(i, 'run', return_value=result):
            VERIFY_REQUIREMENT(i.STAGED, 'com.openai.codex', SHA1, 'Staged app')

    def test_requirement_is_read_from_codesign_stdout(self):
        result = fixture.subprocess.CompletedProcess([], 0, stdout=(
            'designated => identifier "com.openai.codex" and certificate leaf = H"' + SHA1.lower() + '"\n'),
            stderr='Executable=/test/ChatGPT.app/Contents/MacOS/ChatGPT\n')
        with fixture.patch.object(i, 'run', return_value=result):
            VERIFY_REQUIREMENT(i.STAGED, 'com.openai.codex', SHA1, 'Staged app')

    def test_unquoted_requirement_preserves_exact_identifier_and_pin(self):
        for identifier in ('com.openai.codex', 'not.com.openai.codex'):
            with self.subTest(identifier=identifier):
                result = fixture.subprocess.CompletedProcess([], 0, stdout=(
                    'designated => identifier ' + identifier + ' and certificate 0 = H"' + SHA1.lower() + '"\n'), stderr='')
                with fixture.patch.object(i, 'run', return_value=result):
                    if identifier == 'com.openai.codex':
                        VERIFY_REQUIREMENT(i.STAGED, 'com.openai.codex', SHA1, 'Staged app')
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'exact certificate-pinned'):
                            VERIFY_REQUIREMENT(i.STAGED, 'com.openai.codex', SHA1, 'Staged app')


if __name__ == '__main__':
    unittest.main()
