"""Package an already-built Linux/amd64 image; never reads a running data volume."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import shutil
import subprocess
import tempfile
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source_spec = importlib.util.spec_from_file_location('release_sources', ROOT/'scripts/collect-release-sources.py')
release_sources = importlib.util.module_from_spec(source_spec)
source_spec.loader.exec_module(release_sources)


def run(*args):
    return subprocess.check_output(args, cwd=ROOT).decode('utf-8').strip()


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify_notice_bundle(directory):
    """Do not publish an image whose tr46 supplement is missing or stale."""
    expected = ROOT / 'licenses/tr46-0.0.3'
    packages = json.loads((directory / 'installed-packages.json').read_text('utf-8'))['packages']
    records = [p for p in packages if p['name'] == 'tr46']
    if not records:
        raise ValueError('Missing tr46 package in image notice inventory')
    provenance = json.loads((expected / 'provenance.json').read_text('utf-8'))
    for record in records:
        if any(record.get(key) != provenance[key] for key in ['version', 'license', 'integrity', 'sourceArchive']):
            raise ValueError('tr46 image notice version or archive mismatch')
        if record.get('evidence') != 'upstream-license-supplement; version and source hashes verified':
            raise ValueError('tr46 image is missing reviewed license evidence')
        for filename in ['LICENSE.md', 'provenance.json']:
            relative = f"licenses/{record['path']}/upstream-supplement/{filename}"
            target = (directory / relative).resolve()
            if not target.is_relative_to(directory.resolve()) or relative not in record['notices']:
                raise ValueError('tr46 image notice path mismatch')
            if not target.is_file() or sha256(target) != sha256(expected / filename):
                raise ValueError('tr46 image supplemental notice missing or changed')


def image_ids(archive, image, inspected_id, revision):
    """Classic stores expose the config ID; containerd may expose the index ID."""
    with tarfile.open(archive, 'r:gz') as saved:
        manifests = json.load(saved.extractfile('manifest.json'))
        matches = [entry for entry in manifests if image in (entry.get('RepoTags') or [])]
        if len(matches) != 1:
            raise ValueError('Expected exactly one tagged image in docker save archive')
        config_bytes = saved.extractfile(matches[0]['Config']).read()
        config = json.loads(config_bytes)
        if (config.get('os'), config.get('architecture')) != ('linux', 'amd64'):
            raise ValueError('Archived image platform mismatch')
        if config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision:
            raise ValueError('Archived image source revision mismatch')
        config_id = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
        return sorted(set([inspected_id, config_id]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--sources', required=True, help='Verified corresponding-source cache outside the checkout')
    parser.add_argument('--signing-key', help='Private update-signing key outside the repository; enables web-update assets')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output == ROOT or ROOT in output.parents:
        raise SystemExit('Keep release artifacts outside the source checkout.')
    version = json.loads((ROOT / 'package.json').read_text('utf-8'))['version']
    commit = run('git', 'rev-parse', 'HEAD')
    if run('git', 'status', '--porcelain', '--untracked-files=normal'):
        raise SystemExit('Commit source changes before packaging a release.')
    image = f'salmon-review:{version}'
    info = json.loads(run('docker', 'image', 'inspect', image))[0]
    if (info['Os'], info['Architecture']) != ('linux', 'amd64'):
        raise SystemExit('This release supports Linux/amd64 images only.')
    if info['Config']['Labels'].get('org.opencontainers.image.revision') != commit:
        raise SystemExit('Rebuild the image with --build-arg VCS_REF=<current commit>.')
    sources = Path(args.sources).resolve()
    source_lock = json.loads(release_sources.LOCK.read_text('utf-8'))
    release_sources.verify_image(image, source_lock)
    release_sources.verify_files(sources, source_lock)
    output.mkdir(parents=True, exist_ok=True)
    package_name = f'SalmonReview-v{version}-windows-x64'
    if any((output / name).exists() for name in [package_name+'.zip', f'SalmonReview-v{version}-source.zip', f'SalmonReview-v{version}-third-party.zip']):
        raise SystemExit('Release output already exists; choose a new empty output directory.')
    with tempfile.TemporaryDirectory(prefix='salmon-release-') as temporary:
        scratch = Path(temporary)
        package = scratch / package_name
        package.mkdir()
        docs = ['README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_PACKAGES.json', 'BETA_TESTING.md', 'SECURITY.md', 'CHANGELOG.md', 'UPDATING.md', 'compose.yaml']
        for name in docs:
            shutil.copy2(ROOT / name, package / name)
        # BOM is intentional: Windows PowerShell 5.1 otherwise decodes Chinese as ANSI.
        (package / 'Start.ps1').write_text((ROOT/'release/Start.ps1').read_text('utf-8-sig'), encoding='utf-8-sig', newline='\r\n')
        (package / 'Start.cmd').write_text((ROOT/'release/Start.cmd').read_text('utf-8'), encoding='ascii', newline='\r\n')
        archive = package / 'salmon-review-image.tar.gz'
        with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
            process = subprocess.Popen(['docker', 'save', image], stdout=subprocess.PIPE, cwd=ROOT)
            try:
                shutil.copyfileobj(process.stdout, compressed)
            finally:
                process.stdout.close()
            if process.wait():
                raise SystemExit('docker save failed')
        metadata = {'version': version, 'commit': commit, 'image': image, 'imageId': info['Id'],
                    'imageIds': image_ids(archive, image, info['Id'], commit), 'platform': 'linux/amd64'}
        (package/'release.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
        if args.signing_key:
            update_image = output / f'salmon-review-{version}-linux-amd64.tar.gz'
            shutil.copy2(archive, update_image)
            update = {'format': 1, 'updaterProtocol': 2, 'dataFormat': 1,
                      'repository': 'Awewlife/Salmon-review', 'version': version,
                      'commit': commit, 'platform': 'linux/amd64', 'image': image,
                      'imageIds': metadata['imageIds'], 'asset': update_image.name,
                      'bytes': update_image.stat().st_size, 'sha256': sha256(update_image)}
            unsigned = scratch / 'unsigned-update.json'
            unsigned.write_text(json.dumps(update, separators=(',', ':')), encoding='utf-8')
            subprocess.run(['node', str(ROOT/'scripts/sign-update.mjs'), str(unsigned),
                            str(Path(args.signing_key).resolve()), str(output/'update.json')], check=True)
        (package/'SHA256SUMS.txt').write_text(''.join(f'{sha256(p)}  {p.name}\n' for p in sorted(package.iterdir())), encoding='ascii')
        with zipfile.ZipFile(output/(package_name+'.zip'), 'w', compression=zipfile.ZIP_DEFLATED) as result:
            for path in sorted(package.iterdir()):
                result.write(path, package_name+'/'+path.name, compress_type=zipfile.ZIP_STORED if path.suffix=='.gz' else zipfile.ZIP_DEFLATED)
        subprocess.run(['git', 'archive', '--format=zip', f'--prefix=SalmonReview-v{version}-source/', '-o', str(output/f'SalmonReview-v{version}-source.zip'), commit], cwd=ROOT, check=True)

        # Copy only software notices from a fresh, never-started container; no user volumes.
        third_party = scratch/'third-party'
        third_party.mkdir()
        container = run('docker', 'create', '--network', 'none', image)
        try:
            subprocess.run(['docker','cp',container+':/app/third-party',str(third_party/'npm-notices')], check=True)
            verify_notice_bundle(third_party/'npm-notices')
            # Keep Linux symlinks in a tar archive; extracting them on Windows
            # would unnecessarily require administrator/symlink privileges.
            with (third_party/'system-notices.tar.gz').open('wb') as raw, gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as compressed:
                process = subprocess.Popen(['docker','cp',container+':/usr/share/doc','-'],stdout=subprocess.PIPE)
                try:
                    shutil.copyfileobj(process.stdout,compressed)
                finally:
                    process.stdout.close()
                if process.wait():
                    raise SystemExit('Could not archive system notices')
        finally:
            subprocess.run(['docker','rm',container], check=True, stdout=subprocess.DEVNULL)
        for record in source_lock['files']:
            target = release_sources.target_file(third_party/'sources', record)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(release_sources.target_file(sources, record), target)
        shutil.copy2(release_sources.LOCK, third_party/'sources/release-sources.json')
        shutil.copy2(ROOT/'licenses/SOURCE-BUILD.md', third_party/'SOURCE-BUILD.md')
        release_sources.verify_files(third_party/'sources', source_lock)
        installed = run('docker','run','--rm','--network','none',image,'dpkg-query','-W','-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n')
        (third_party/'debian-packages.tsv').write_text(installed+'\n',encoding='utf-8')
        (third_party/'SOURCE-INDEX.md').write_text(
            '# Source and notice materials\n\n'
            f'Application source: SalmonReview-v{version}-source.zip, commit {commit}.\n\n'
            'Corresponding-source archives, patches and build recipes are in sources/.\n'
            'Exact versions, upstream URLs and SHA-256 values: sources/release-sources.json.\n'
            'Rebuild and native-library replacement instructions: SOURCE-BUILD.md.\n\n'
            'Exact npm archive URLs and integrity values are in THIRD_PARTY_PACKAGES.json.\n'
            'Debian binary/source versions: debian-packages.tsv; source packages included under sources/debian/.\n\n'
            'Third-party rights, including optional remote fonts: THIRD_PARTY_NOTICES.md.\n', encoding='utf-8')
        for name in ['THIRD_PARTY_NOTICES.md','THIRD_PARTY_PACKAGES.json','LICENSE','NOTICE']:
            shutil.copy2(ROOT/name,third_party/name)
        with zipfile.ZipFile(output/f'SalmonReview-v{version}-third-party.zip', 'w') as result:
            for file in sorted(third_party.rglob('*')):
                if file.is_file():
                    result.write(file, file.relative_to(third_party), compress_type=zipfile.ZIP_STORED if file.suffix in ['.gz','.xz','.bz2','.zip'] else zipfile.ZIP_DEFLATED)
        (output/'SHA256SUMS.txt').write_text(''.join(f'{sha256(p)}  {p.name}\n' for p in sorted(output.iterdir()) if p.is_file() and p.name != 'SHA256SUMS.txt'),encoding='ascii')
        print(json.dumps({'version':version,'commit':commit,'imageId':info['Id'],'files':[{'name':p.name,'bytes':p.stat().st_size} for p in sorted(output.iterdir())]},indent=2))


if __name__ == '__main__':
    main()
