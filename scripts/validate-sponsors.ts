import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { sponsorDatasetErrors, validateSponsor } from '../src/utils/sponsors';

const sponsorDataPath = resolve('src/data/sponsors.json');
const sponsorAssetRoot = resolve('public/sponsors');
const sponsors = JSON.parse(await readFile(sponsorDataPath, 'utf8')) as unknown;
const assets = new Set((await readdir(sponsorAssetRoot)).map((name) => `/sponsors/${name}`));
const errors = sponsorDatasetErrors(sponsors, assets);

if (Array.isArray(sponsors)) {
  for (const [index, raw] of sponsors.entries()) {
    if (!validateSponsor(raw)) continue;
    const assetPath = resolve('public', raw.image.slice(1));
    const info = await stat(assetPath);
    if (info.size > 100 * 1024)
      errors.push(`Sponsor ${index}: image exceeds the 100 KB asset limit.`);
    if (extname(assetPath).toLowerCase() === '.svg') {
      const svg = await readFile(assetPath, 'utf8');
      if (
        /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["']?(?:https?:|data:|javascript:)/i.test(
          svg,
        )
      )
        errors.push(`Sponsor ${index}: SVG contains executable or remotely loaded content.`);
    }
  }
}

if (errors.length) throw new Error(errors.join('\n'));

const today = new Date().toISOString().slice(0, 10);
const expired = Array.isArray(sponsors)
  ? sponsors
      .filter(validateSponsor)
      .filter((sponsor) => sponsor.endDate <= today)
      .map((sponsor) => sponsor.id)
  : [];

process.stdout.write(
  `Validated ${Array.isArray(sponsors) ? sponsors.length : 0} sponsor record(s).\n`,
);
if (expired.length) process.stdout.write(`Expired sponsorships: ${expired.join(', ')}\n`);
