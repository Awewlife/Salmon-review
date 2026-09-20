"""Package an already-built Linux/amd64 image; never reads a running data volume."""
import argparse
import gzip
import hashlib
import json
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    return subprocess.check_output(args, cwd=ROOT).decode('utf-8').strip()


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
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
    output.mkdir(parents=True, exist_ok=True)
    package_name = f'SalmonReview-v{version}-windows-x64'
    if any((output / name).exists() for name in [package_name+'.zip', f'SalmonReview-v{version}-source.zip', f'SalmonReview-v{version}-third-party.zip']):
        raise SystemExit('Release output already exists; choose a new empty output directory.')
    with tempfile.TemporaryDirectory(prefix='salmon-release-') as temporary:
        scratch = Path(temporary)
        package = scratch / package_name
        package.mkdir()
        docs = ['README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_PACKAGES.json', 'BETA_TESTING.md', 'SECURITY.md', 'CHANGELOG.md', 'compose.yaml']
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
        metadata = {'version': version, 'commit': commit, 'image': image, 'imageId': info['Id'], 'platform': 'linux/amd64'}
        (package/'release.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
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
        nxapi_revision = '47c9d35d9d51d33e62dd6d3733b616e0ad31b02b'
        source_url = f'https://api.github.com/repos/samuelthomas2774/nxapi/tarball/{nxapi_revision}'
        request = urllib.request.Request(source_url, headers={'User-Agent':'SalmonReview-release'})
        with urllib.request.urlopen(request, timeout=120) as response, (third_party/'nxapi-source.tar.gz').open('wb') as target:
            shutil.copyfileobj(response, target)
        installed = run('docker','run','--rm','--network','none',image,'dpkg-query','-W','-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n')
        (third_party/'debian-packages.tsv').write_text(installed+'\n',encoding='utf-8')
        (third_party/'SOURCE-INDEX.md').write_text(
            '# Source and notice materials\n\n'
            f'Application source: SalmonReview-v{version}-source.zip, commit {commit}.\n\n'
            f'nxapi source included as nxapi-source.tar.gz, revision {nxapi_revision}.\n\n'
            'Exact npm archive URLs and integrity values are in THIRD_PARTY_PACKAGES.json.\n'
            'Node.js source: https://nodejs.org/dist/v22.23.2/node-v22.23.2.tar.gz\n'
            'Base image source: https://github.com/nodejs/docker-node\n'
            'Exact Debian binary/source versions are in debian-packages.tsv; upstream source archives: https://snapshot.debian.org/\n\n'
            'This is a private prerelease, not a claim of complete third-party license clearance.\n'
            'Unresolved rights/notices are described in THIRD_PARTY_NOTICES.md.\n', encoding='utf-8')
        for name in ['THIRD_PARTY_NOTICES.md','THIRD_PARTY_PACKAGES.json','LICENSE','NOTICE']:
            shutil.copy2(ROOT/name,third_party/name)
        shutil.make_archive(str(output/f'SalmonReview-v{version}-third-party'),'zip',third_party)
        (output/'SHA256SUMS.txt').write_text(''.join(f'{sha256(p)}  {p.name}\n' for p in sorted(output.glob('*.zip'))),encoding='ascii')
        print(json.dumps({'version':version,'commit':commit,'imageId':info['Id'],'files':[{'name':p.name,'bytes':p.stat().st_size} for p in sorted(output.iterdir())]},indent=2))


if __name__ == '__main__':
    main()
