#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

import {
	createInspectData,
	extractPatterns,
	extractSamples,
	formatInspectText,
	parseMod,
	sanitizeFilename,
} from './modParser';

function printUsage(): void {
	console.log('Usage: mod-tools <command> <input.mod> [options]');
	console.log('');
	console.log('Commands:');
	console.log('  inspect <input.mod>                   Print MOD metadata and sample summary');
	console.log('  inspect <input.mod> --json            Print MOD metadata as JSON');
	console.log('  extract-samples <input.mod> --output-dir <dir>');
	console.log('                                       Write raw PCM samples and sample_meta.8f4e');
	console.log('  extract-patterns <input.mod> --output-dir <dir>');
	console.log('                                       Write one pattern file per channel and patterns_order.8f4e');
	console.log('  extract-all <input.mod> --output-dir <dir>');
	console.log('                                       Run both extraction steps into one directory');
	console.log('');
	console.log('Options:');
	console.log('  --output-dir <dir>                    Output directory for extraction commands');
	console.log('  --json                                JSON output for inspect');
	console.log('  -h, --help          Show this help message');
}

function parseArgs(args: string[]): {
	command?: string;
	inputPath?: string;
	outputDir?: string;
	json: boolean;
} {
	let command: string | undefined;
	let inputPath: string | undefined;
	let outputDir: string | undefined;
	let json = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--output-dir') {
			outputDir = args[i + 1];
			i++;
			continue;
		}
		if (arg === '--json') {
			json = true;
			continue;
		}
		if (arg === '-h' || arg === '--help') {
			printUsage();
			process.exit(0);
		}
		if (!command && !arg.startsWith('-')) {
			command = arg;
			continue;
		}
		if (!inputPath && !arg.startsWith('-')) {
			inputPath = arg;
		}
	}

	return { command, inputPath, outputDir, json };
}

async function readParsedMod(inputPath: string) {
	const resolvedInput = path.resolve(process.cwd(), inputPath);
	const buffer = await fs.readFile(resolvedInput);
	return { resolvedInput, parsed: parseMod(buffer) };
}

async function writeSamples(outputDir: string, parsed: ReturnType<typeof parseMod>): Promise<void> {
	const { samples, metadataConstants } = extractSamples(parsed);

	for (const sample of samples) {
		const sampleName = sample.name ? `_${sanitizeFilename(sample.name)}` : '';
		const filePath = path.join(outputDir, `sample_${String(sample.index).padStart(2, '0')}${sampleName}.pcm`);
		await fs.writeFile(filePath, sample.data);
		process.stderr.write(`Written ${filePath}\n`);
	}

	const metaPath = path.join(outputDir, 'sample_meta.8f4e');
	await fs.writeFile(metaPath, metadataConstants, 'utf8');
	process.stderr.write(`Written ${metaPath}\n`);
}

async function writePatterns(outputDir: string, parsed: ReturnType<typeof parseMod>): Promise<void> {
	const { buffers, orderTableModule } = extractPatterns(parsed);

	for (let ch = 0; ch < buffers.length; ch++) {
		const filePath = path.join(outputDir, `patterns_ch${ch}.bin`);
		await fs.writeFile(filePath, buffers[ch]);
		process.stderr.write(`Written ${filePath}\n`);
	}

	const orderTablePath = path.join(outputDir, 'patterns_order.8f4e');
	await fs.writeFile(orderTablePath, orderTableModule, 'utf8');
	process.stderr.write(`Written ${orderTablePath}\n`);
}

async function run(): Promise<void> {
	const { command, inputPath, outputDir, json } = parseArgs(process.argv.slice(2));

	if (!command || !inputPath) {
		printUsage();
		process.exit(1);
	}

	const { resolvedInput, parsed } = await readParsedMod(inputPath);

	if (command === 'inspect') {
		if (json) {
			process.stdout.write(`${JSON.stringify(createInspectData(parsed), null, 2)}\n`);
			return;
		}
		process.stdout.write(formatInspectText(parsed, resolvedInput));
		return;
	}

	if (!outputDir) {
		printUsage();
		process.exit(1);
	}

	const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
	await fs.mkdir(resolvedOutputDir, { recursive: true });

	if (command === 'extract-samples') {
		await writeSamples(resolvedOutputDir, parsed);
		return;
	}

	if (command === 'extract-patterns') {
		await writePatterns(resolvedOutputDir, parsed);
		return;
	}

	if (command === 'extract-all' || command === 'extract') {
		await writePatterns(resolvedOutputDir, parsed);
		await writeSamples(resolvedOutputDir, parsed);
		return;
	}

	throw new Error(`Unknown command: ${command}`);
}

run().catch(error => {
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
				? error.message
				: String(error);
	console.error(message);
	process.exit(1);
});
