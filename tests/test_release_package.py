import importlib.util
import io
import json
import hashlib
import tarfile
import tempfile
import unittest
import shutil
import zipfile
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('package_release', Path(__file__).resolve().parents[1] / 'scripts/package-release.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)
merge_spec = importlib.util.spec_from_file_location('merge_release', package.ROOT/'scripts/merge-release.py')
merge_release = importlib.util.module_from_spec(merge_spec)
merge_spec.loader.exec_module(merge_release)


class ReleaseIdentityTests(unittest.TestCase):
    def test_source_inventory_is_selected_and_checked_for_each_cpu(self):
        lock = {'imageInventory': {'fixture': 'amd64'}, 'platformInventories': {'linux/arm64': {'fixture': 'arm64'}}}
        for arch in ['amd64', 'arm64', 'riscv64']:
            inspected = json.dumps([{'Os': 'linux', 'Architecture': arch}]).encode()
            with patch.object(package.release_sources.subprocess, 'check_output', return_value=inspected), patch.object(package.release_sources, 'image_inventory', return_value={'fixture': arch}):
                if arch == 'riscv64':
                    with self.assertRaises(ValueError):
                        package.release_sources.verify_image('fixture', lock)
                else:
                    package.release_sources.verify_image('fixture', lock)
            with patch.object(package.release_sources.subprocess, 'check_output', return_value=inspected), patch.object(package.release_sources, 'image_inventory', return_value={'fixture': 'altered'}):
                with self.assertRaises(ValueError):
                    package.release_sources.verify_image('fixture', lock)

    def test_merge_verifies_both_archives_and_shared_source_without_overwriting(self):
        for fault in [None, 'changed-archive', 'conflicting-source', 'extra-file', 'unsafe-path']:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                for arch in ['amd64', 'arm64']:
                    directory = root / arch
                    directory.mkdir()
                    (directory / (arch+'.zip')).write_bytes(arch.encode())
                    (directory / 'fixture-source.zip').write_bytes(b'common source' if fault != 'conflicting-source' or arch == 'amd64' else b'other source')
                    sums = ''.join(f'{package.sha256(file)}  {file.name}\n' for file in sorted(directory.iterdir()))
                    if fault == 'unsafe-path':
                        sums += 'a'*64+'  ../outside\n'
                    (directory / 'SHA256SUMS.txt').write_text(sums, encoding='ascii')
                if fault == 'changed-archive':
                    (root/'arm64/arm64.zip').write_bytes(b'altered')
                if fault == 'extra-file':
                    (root/'arm64/unverified.zip').write_bytes(b'extra')
                if fault:
                    with self.assertRaises(ValueError):
                        merge_release.merge(root, root/'combined')
                else:
                    merge_release.merge(root, root/'combined')
                    self.assertEqual(len(list((root/'combined').iterdir())), 4)
                    for line in (root/'combined/SHA256SUMS.txt').read_text('ascii').splitlines():
                        expected, name = line.split('  ', 1)
                        self.assertEqual(package.sha256(root/'combined'/name), expected)
                    with self.assertRaises(ValueError):
                        merge_release.merge(root, root/'combined')

    def test_installer_contains_readme_images_and_resource_notices(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            package.copy_documentation(directory)
            for name in ['docs/images/personal-trends.png', 'docs/images/score-curve.png',
                         'dist/fonts/INKLING-NOTICE.txt', 'licenses/SOURCE-BUILD.md',
                         'packages/splatnet3-compat/README.md', 'docs/RESOURCE_RIGHTS.md']:
                self.assertEqual((directory/name).read_bytes(), (package.ROOT/name).read_bytes())
            self.assertFalse(list(directory.rglob('*.otf')))

    def test_source_materials_reject_missing_modified_and_unsafe_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            file = directory / 'source.tar'
            file.write_bytes(b'fixture source')
            record = {'file': file.name, 'bytes': file.stat().st_size,
                      'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
            package.release_sources.verify_files(directory, {'files': [record]})
            file.write_bytes(b'altered source')
            with self.assertRaises(ValueError):
                package.release_sources.verify_files(directory, {'files': [record]})
            file.unlink()
            with self.assertRaises(ValueError):
                package.release_sources.verify_files(directory, {'files': [record]})
            with self.assertRaises(ValueError):
                package.release_sources.target_file(directory, {'file': '../outside'})

    def notice_bundle(self, directory):
        directory = Path(directory)
        expected = package.ROOT / 'licenses/tr46-0.0.3'
        provenance = json.loads((expected / 'provenance.json').read_text('utf-8'))
        relative = 'licenses/node_modules/tr46/upstream-supplement'
        shutil.copytree(expected, directory / relative)
        record = {key: provenance[key] for key in ['name', 'version', 'license', 'integrity', 'sourceArchive']}
        record.update(path='node_modules/tr46', evidence='upstream-license-supplement; version and source hashes verified',
                      notices=[relative + '/' + file for file in ['LICENSE.md', 'provenance.json']])
        (directory / 'installed-packages.json').write_text(json.dumps({'packages': [record]}), encoding='utf-8')
        return directory / relative

    def test_release_notice_bundle_and_rejection_of_incomplete_materials(self):
        for fault in [None, 'missing', 'modified', 'metadata-only', 'absent-package']:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                supplement = self.notice_bundle(directory)
                if fault == 'missing':
                    (supplement / 'LICENSE.md').unlink()
                elif fault == 'modified':
                    (supplement / 'LICENSE.md').write_text('MIT', encoding='utf-8')
                elif fault in ['metadata-only', 'absent-package']:
                    file = directory / 'installed-packages.json'
                    data = json.loads(file.read_text('utf-8'))
                    if fault == 'metadata-only':
                        data['packages'][0]['evidence'] = 'metadata-only'
                    else:
                        data['packages'] = []
                    file.write_text(json.dumps(data), encoding='utf-8')
                if fault:
                    with self.assertRaises(ValueError):
                        package.verify_notice_bundle(directory)
                else:
                    package.verify_notice_bundle(directory)

    def archive(self, directory, tag='salmon-review:0.3.4', arch='amd64', revision='fixture'):
        config = json.dumps({'os': 'linux', 'architecture': arch, 'config': {'Labels': {'org.opencontainers.image.revision': revision}}}).encode()
        digest = hashlib.sha256(config).hexdigest()
        name = 'blobs/sha256/' + digest
        archive = Path(directory) / 'image.tar.gz'
        with tarfile.open(archive, 'w:gz') as saved:
            for filename, data in [(name, config), ('manifest.json', json.dumps([{'Config': name, 'RepoTags': [tag], 'Layers': []}]).encode())]:
                member = tarfile.TarInfo(filename)
                member.size = len(data)
                saved.addfile(member, io.BytesIO(data))
        return archive, 'sha256:' + digest

    def test_containerd_and_classic_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            archive, config_id = self.archive(directory)
            index_id = 'sha256:' + 'a' * 64
            self.assertEqual(package.image_ids(archive, 'salmon-review:0.3.4', index_id, 'fixture'), sorted([index_id, config_id]))
            self.assertEqual(package.image_ids(archive, 'salmon-review:0.3.4', config_id, 'fixture'), [config_id])

    def test_arm64_archive_requires_explicit_matching_platform(self):
        with tempfile.TemporaryDirectory() as directory:
            archive, config_id = self.archive(directory, arch='arm64')
            self.assertEqual(package.image_ids(archive, 'salmon-review:0.3.4', config_id, 'fixture', 'linux/arm64'), [config_id])
            with self.assertRaises(ValueError):
                package.image_ids(archive, 'salmon-review:0.3.4', config_id, 'fixture')

    def test_all_installers_have_matching_platform_checksums_and_launchers(self):
        for platform in ['linux/amd64', 'linux/arm64']:
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / 'image.gz'
                archive.write_bytes(b'fixture image')
                output = root / 'out'
                output.mkdir()
                metadata = dict(version='0.4.0', commit='a'*40, platform=platform,
                                image='salmon-review:0.4.0', imageId='sha256:'+'b'*64, imageIds=['sha256:'+'b'*64])
                for target in package.installer_targets(platform):
                    package.write_installer(root, output, target, metadata, archive)
                    name = f'SalmonReview-v0.4.0-{target}'
                    with zipfile.ZipFile(output / (name+'.zip')) as saved:
                        read = lambda file: saved.read(name+'/'+file)
                        self.assertEqual(json.loads(read('release.json')), metadata)
                        self.assertEqual(read('compose.yaml').decode().count('platform: '+platform), 2)
                        self.assertEqual(read('salmon-review-image.tar.gz'), archive.read_bytes())
                        self.assertNotIn(b'\r', read('SHA256SUMS.txt'))
                        for line in read('SHA256SUMS.txt').decode().splitlines():
                            digest, file = line.split('  ', 1)
                            self.assertEqual(hashlib.sha256(read(file)).hexdigest(), digest)
                        if target == 'windows-x64':
                            self.assertEqual(read('Start.ps1').decode('utf-8-sig'), (package.ROOT/'release/Start.ps1').read_text('utf-8-sig').replace('\n', '\r\n'))
                            self.assertNotIn(name+'/Start.command', saved.namelist())
                        else:
                            self.assertIn('PLATFORM='+platform, read('release.env').decode())
                            self.assertNotIn(b'\r', read('release.env'))
                            self.assertNotIn(b'\r', read('start-macos.sh'))
                            for file in ['Start.command', 'start-macos.sh']:
                                self.assertEqual(saved.getinfo(name+'/'+file).external_attr >> 16 & 0o777, 0o755)
                            self.assertNotIn(name+'/Start.cmd', saved.namelist())

    def test_wrong_tag_platform_or_revision_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for options in [{'tag': 'unrelated:1'}, {'arch': 'arm64'}, {'revision': 'other'}]:
                archive, config_id = self.archive(directory, **options)
                with self.assertRaises(ValueError):
                    package.image_ids(archive, 'salmon-review:0.3.4', config_id, 'fixture')


if __name__ == '__main__':
    unittest.main()
