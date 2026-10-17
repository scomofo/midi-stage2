import { readFile, writeFile } from 'node:fs/promises';
import { compareTranscriptionReports } from './lib/transcription-report.mjs';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw Error('Usage: node scripts/compare-transcription-benchmarks.mjs BEFORE.json AFTER.json [OUTPUT.md]');
const [before, after] = await Promise.all([beforePath, afterPath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const markdown = compareTranscriptionReports(before, after);
if (outputPath) await writeFile(outputPath, markdown);
else console.log(markdown);
