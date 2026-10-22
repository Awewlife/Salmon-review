"""Merge independently verified amd64/arm64 assets before staging a draft."""
import argparse
import hashlib
import shutil
from pathlib import Path


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def merge(parts, output):
    if output.exists() and any(output.iterdir()):
        raise ValueError('Choose an empty combined release directory')
    output.mkdir(parents=True, exist_ok=True)
    for arch in ['amd64', 'arm64']:
        directory = parts / arch
        checks = (directory / 'SHA256SUMS.txt').read_text('ascii').splitlines()
        listed = set()
        for line in checks:
            expected, name = line.split('  ', 1)
            if Path(name).name != name or name in ['', '.', '..'] or '\\' in name:
                raise ValueError('Unsafe release filename')
            file = directory / name
            if file.is_symlink() or digest(file) != expected:
                raise ValueError('Release checksum mismatch: '+name)
            listed.add(name)
            target = output / name
            if target.exists():
                if not name.endswith('-source.zip') or digest(target) != expected:
                    raise ValueError('Conflicting release assets: '+name)
            else:
                shutil.copy2(file, target)
        actual = {file.name for file in directory.iterdir() if file.name != 'SHA256SUMS.txt'}
        if actual != listed:
            raise ValueError('Unverified release assets')
    (output / 'SHA256SUMS.txt').write_text(''.join(f'{digest(file)}  {file.name}\n' for file in sorted(output.iterdir())), encoding='ascii')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--parts', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    merge(Path(args.parts).resolve(), Path(args.output).resolve())
