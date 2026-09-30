import importlib.util
import io
import json
import hashlib
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('package_release', Path(__file__).resolve().parents[1] / 'scripts/package-release.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class ReleaseIdentityTests(unittest.TestCase):
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
