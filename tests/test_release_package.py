import importlib.util
import io
import json
import hashlib
import tarfile
import tempfile
import unittest
import shutil
from pathlib import Path

spec = importlib.util.spec_from_file_location('package_release', Path(__file__).resolve().parents[1] / 'scripts/package-release.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class ReleaseIdentityTests(unittest.TestCase):
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

    def test_wrong_tag_platform_or_revision_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for options in [{'tag': 'unrelated:1'}, {'arch': 'arm64'}, {'revision': 'other'}]:
                archive, config_id = self.archive(directory, **options)
                with self.assertRaises(ValueError):
                    package.image_ids(archive, 'salmon-review:0.3.4', config_id, 'fixture')


if __name__ == '__main__':
    unittest.main()
