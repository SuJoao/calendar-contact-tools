import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const sourceRoot = 'src';
const forbidden = [
  /\.outerHTML\s*=/,
  /\.insertAdjacentHTML\s*\(/,
  /document\.write\s*\(/,
  /\bsrcdoc\s*=/,
  /dangerouslySetInnerHTML/,
];
const findings: string[] = [];

for (const filename of await sourceFiles(sourceRoot)) {
  if (filename.includes('/tests/') || filename.endsWith('.test.ts')) continue;
  const lines = (await readFile(filename, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line)))
      findings.push(`${relative('.', filename)}:${index + 1}: forbidden HTML sink`);
    if (/\.innerHTML\s*=/.test(line)) {
      const context = lines.slice(Math.max(0, index - 3), index).join('\n');
      if (!context.includes('SECURITY:'))
        findings.push(
          `${relative('.', filename)}:${index + 1}: innerHTML needs a nearby SECURITY review note`,
        );
    }
  });
}

if (findings.length) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('DOM sink audit passed: every production sink is reviewed.\n');
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return extname(entry.name) === '.ts' ? [path] : [];
    }),
  );
  return nested.flat();
}
