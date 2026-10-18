import { fileURLToPath } from 'node:url';

export function androidVersion(tag) {
  const match = /^(?:refs\/tags\/)?v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag || '').trim());
  if (!match) throw new Error(`Not a release version tag: ${JSON.stringify(tag)} (expected v1.2.3)`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 999 || patch > 999) throw new Error(`Version tag parts must be below 1000: ${tag}`);
  return { name: `${major}.${minor}.${patch}`, code: major * 1000000 + minor * 1000 + patch };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { name, code } = androidVersion(process.argv[2]);
  console.log(`QC_VERSION_NAME=${name}`);
  console.log(`QC_VERSION_CODE=${code}`);
}
