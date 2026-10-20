"""Download hash-locked corresponding sources; never execute upstream archives."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'licenses/release-sources.json'


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def target_file(directory, record):
    root = directory.resolve()
    target = (root / record['file']).resolve()
    if not target.is_relative_to(root) or target == root:
        raise ValueError('Unsafe source archive path')
    return target


def verify_files(directory, lock):
    for record in lock['files']:
        target = target_file(directory, record)
        if not target.is_file() or target.stat().st_size != record['bytes'] or digest(target) != record['sha256']:
            raise ValueError('Missing or altered source archive: ' + record['file'])


def image_inventory(image):
    def run(*args):
        return subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', image, *args]).decode('utf-8').strip()
    debian = run('dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n')
    versions = json.loads(run('node', '-e', "console.log(JSON.stringify({node:process.versions.node,sharp:require('sharp').versions,nxapi:require('./node_modules/nxapi/package.json').version}))"))
    return {'debianPackages': sorted(debian.splitlines()), 'runtime': versions}


def verify_image(image, lock):
    if image_inventory(image) != lock['imageInventory']:
        raise ValueError('Source lock does not match installed system/native versions; regenerate and review it')


def download(directory, record):
    target = target_file(directory, record)
    if target.is_file() and target.stat().st_size == record['bytes'] and digest(target) == record['sha256']:
        return
    if not record['url'].startswith('https://'):
        raise ValueError('Source URL must use HTTPS')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + '.part')
    for attempt in range(3):
        try:
            if os.name == 'nt':
                # Windows curl uses the system certificate store; some Python
                # distributions do not include a usable CA bundle.
                subprocess.run(['curl.exe', '--fail', '--location', '--silent', '--show-error',
                                '--max-time', '300', '--output', str(temporary), record['url']], check=True)
            else:
                request = urllib.request.Request(record['url'], headers={'User-Agent': 'SalmonReview-source-bundle'})
                with urllib.request.urlopen(request, timeout=180) as source, temporary.open('wb') as output:
                    shutil.copyfileobj(source, output)
            if temporary.stat().st_size != record['bytes'] or digest(temporary) != record['sha256']:
                raise ValueError('Source hash mismatch: ' + record['file'])
            temporary.replace(target)
            return
        except Exception:
            temporary.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    directory = Path(args.output).resolve()
    if directory == ROOT or ROOT in directory.parents:
        raise SystemExit('Keep downloaded source archives outside the checkout')
    lock = json.loads(LOCK.read_text('utf-8'))
    verify_image(args.image, lock)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as workers:
        list(workers.map(lambda record: download(directory, record), lock['files']))
    verify_files(directory, lock)
    shutil.copy2(LOCK, directory / 'release-sources.json')
    shutil.copy2(ROOT / 'licenses/SOURCE-BUILD.md', directory / 'SOURCE-BUILD.md')
    print(f"Verified {len(lock['files'])} source archives against the release image")


if __name__ == '__main__':
    main()
