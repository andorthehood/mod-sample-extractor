const SONG_TITLE_LENGTH = 20;
const SAMPLE_HEADER_SIZE = 30;
const NUM_SAMPLES = 31;
const SONG_LENGTH_OFFSET = SONG_TITLE_LENGTH + NUM_SAMPLES * SAMPLE_HEADER_SIZE;
const PATTERN_ORDER_TABLE_OFFSET = SONG_LENGTH_OFFSET + 2;
const PATTERN_ORDER_TABLE_LENGTH = 128;
const FORMAT_TAG_OFFSET = PATTERN_ORDER_TABLE_OFFSET + PATTERN_ORDER_TABLE_LENGTH;
const PATTERN_DATA_OFFSET = FORMAT_TAG_OFFSET + 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL = 4;
const SAMPLE_NAME_LENGTH = 22;
const SAMPLE_LENGTH_OFFSET = SAMPLE_NAME_LENGTH;
const SAMPLE_FINETUNE_OFFSET = SAMPLE_NAME_LENGTH + 2;
const SAMPLE_VOLUME_OFFSET = SAMPLE_NAME_LENGTH + 3;
const SAMPLE_REPEAT_OFFSET = SAMPLE_NAME_LENGTH + 4;
const SAMPLE_REPEAT_LENGTH_OFFSET = SAMPLE_NAME_LENGTH + 6;

export interface ParsedModSample {
	index: number;
	name: string;
	lengthBytes: number;
	volume: number;
	finetune: number;
	repeatOffset: number;
	repeatLength: number;
	data: Buffer;
}

export interface ParsedMod {
	title: string;
	songLength: number;
	restartPosition: number;
	formatTag: string;
	channels: number;
	patternCount: number;
	orderTable: number[];
	usedOrderTable: number[];
	patternDataOffset: number;
	patternDataSize: number;
	sampleDataStart: number;
	samples: ParsedModSample[];
	fileSize: number;
	buffer: Buffer;
}

export interface InspectSampleData {
	index: number;
	name: string;
	lengthBytes: number;
	volume: number;
	finetune: number;
	repeatOffset: number;
	repeatLength: number;
	hasData: boolean;
}

export interface InspectData {
	title: string;
	formatTag: string;
	channels: number;
	songLength: number;
	restartPosition: number;
	patternCount: number;
	fileSize: number;
	usedOrderTable: number[];
	samples: InspectSampleData[];
}

export interface ExtractPatternsResult {
	buffers: Buffer[];
	orderTableModule: string;
}

export interface ExtractSamplesResult {
	samples: ParsedModSample[];
	metadataConstants: string;
}

export function detectChannelCount(tag: string): number {
	if (['M.K.', 'M!K!', 'FLT4', '4CHN'].includes(tag)) return 4;
	if (tag === '6CHN') return 6;
	if (['FLT8', '8CHN', 'CD81', 'OKTA'].includes(tag)) return 8;

	const singleDigitMatch = tag.match(/^(\d)CHN$/);
	if (singleDigitMatch) return parseInt(singleDigitMatch[1], 10);

	const doubleDigitMatch = tag.match(/^(\d{2})CH$/);
	if (doubleDigitMatch) return parseInt(doubleDigitMatch[1], 10);

	return 4;
}

function readAscii(buffer: Buffer, start: number, end: number): string {
	return buffer.toString('ascii', start, end).replace(/\0+$/, '').trim();
}

export function sanitizeFilename(value: string): string {
	const cleaned = value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
	return cleaned || 'untitled';
}

export function parseMod(rawBuffer: Uint8Array | Buffer): ParsedMod {
	const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);

	if (buffer.length < PATTERN_DATA_OFFSET) {
		throw new Error(`File too small to be a valid MOD file (got ${buffer.length} bytes, need at least ${PATTERN_DATA_OFFSET})`);
	}

	const title = readAscii(buffer, 0, SONG_TITLE_LENGTH);
	const songLength = buffer.readUInt8(SONG_LENGTH_OFFSET);
	const restartPosition = buffer.readUInt8(SONG_LENGTH_OFFSET + 1);
	const formatTag = buffer.toString('ascii', FORMAT_TAG_OFFSET, FORMAT_TAG_OFFSET + 4);
	const channels = detectChannelCount(formatTag);

	const orderTable: number[] = [];
	for (let i = 0; i < PATTERN_ORDER_TABLE_LENGTH; i++) {
		orderTable.push(buffer.readUInt8(PATTERN_ORDER_TABLE_OFFSET + i));
	}

	const usedOrderTable = orderTable.slice(0, songLength);
	const maxPatternIndex = usedOrderTable.length > 0 ? Math.max(...usedOrderTable) : -1;
	const patternCount = maxPatternIndex + 1;
	const bytesPerPattern = ROWS_PER_PATTERN * channels * BYTES_PER_CELL;
	const patternDataSize = patternCount * bytesPerPattern;
	const sampleDataStart = PATTERN_DATA_OFFSET + patternDataSize;

	if (buffer.length < sampleDataStart) {
		throw new Error(
			`File appears truncated: expected at least ${sampleDataStart} bytes for ${patternCount} pattern(s) with ${channels} channel(s), got ${buffer.length}`
		);
	}

	const samples: ParsedModSample[] = [];
	let sampleDataOffset = sampleDataStart;

	for (let i = 0; i < NUM_SAMPLES; i++) {
		const headerBase = SONG_TITLE_LENGTH + i * SAMPLE_HEADER_SIZE;
		const name = readAscii(buffer, headerBase, headerBase + SAMPLE_NAME_LENGTH);
		const lengthWords = buffer.readUInt16BE(headerBase + SAMPLE_LENGTH_OFFSET);
		const lengthBytes = lengthWords * 2;
		const rawFinetune = buffer.readUInt8(headerBase + SAMPLE_FINETUNE_OFFSET) & 0x0f;
		const finetune = rawFinetune > 7 ? rawFinetune - 16 : rawFinetune;
		const volume = buffer.readUInt8(headerBase + SAMPLE_VOLUME_OFFSET);
		const repeatOffset = buffer.readUInt16BE(headerBase + SAMPLE_REPEAT_OFFSET) * 2;
		const repeatLength = buffer.readUInt16BE(headerBase + SAMPLE_REPEAT_LENGTH_OFFSET) * 2;

		let data = Buffer.alloc(0);
		if (lengthBytes > 0) {
			if (sampleDataOffset + lengthBytes > buffer.length) {
				throw new Error(
					`Sample ${i + 1} overruns file bounds: need ${lengthBytes} bytes at offset ${sampleDataOffset}, file has ${buffer.length}`
				);
			}

			data = Buffer.from(buffer.slice(sampleDataOffset, sampleDataOffset + lengthBytes));
			sampleDataOffset += lengthBytes;
		}

		samples.push({
			index: i + 1,
			name,
			lengthBytes,
			volume,
			finetune,
			repeatOffset,
			repeatLength,
			data,
		});
	}

	return {
		title,
		songLength,
		restartPosition,
		formatTag,
		channels,
		patternCount,
		orderTable,
		usedOrderTable,
		patternDataOffset: PATTERN_DATA_OFFSET,
		patternDataSize,
		sampleDataStart,
		samples,
		fileSize: buffer.length,
		buffer,
	};
}

export function extractPatterns(parsed: ParsedMod): ExtractPatternsResult {
	const bytesPerPattern = ROWS_PER_PATTERN * parsed.channels * BYTES_PER_CELL;
	const bytesPerChannel = parsed.patternCount * ROWS_PER_PATTERN * BYTES_PER_CELL;
	const buffers: Buffer[] = Array.from({ length: parsed.channels }, () => Buffer.allocUnsafe(bytesPerChannel));

	for (let patternIndex = 0; patternIndex < parsed.patternCount; patternIndex++) {
		const patternBase = PATTERN_DATA_OFFSET + patternIndex * bytesPerPattern;

		for (let row = 0; row < ROWS_PER_PATTERN; row++) {
			for (let channelIndex = 0; channelIndex < parsed.channels; channelIndex++) {
				const sourceOffset = patternBase + (row * parsed.channels + channelIndex) * BYTES_PER_CELL;
				const destinationOffset = (patternIndex * ROWS_PER_PATTERN + row) * BYTES_PER_CELL;

				parsed.buffer.copy(buffers[channelIndex], destinationOffset, sourceOffset, sourceOffset + BYTES_PER_CELL);
			}
		}
	}

	const orderLines = parsed.usedOrderTable.map(patternIndex => `int\t0x${patternIndex.toString(16).padStart(2, '0')}`);
	const orderTableModule = `module patternOrder\n; @tab 12\n${orderLines.join('\n')}\n\nmoduleEnd\n`;

	return { buffers, orderTableModule };
}

export function extractSamples(parsed: ParsedMod): ExtractSamplesResult {
	const samples = parsed.samples.filter(sample => sample.lengthBytes > 0);
	const metadataLines: string[] = [];

	for (const sample of samples) {
		const index = String(sample.index).padStart(2, '0');
		metadataLines.push(`const S${index}_VOLUME\t${sample.volume}`);
		metadataLines.push(`const S${index}_FINETUNE\t${sample.finetune}`);
		metadataLines.push(`const S${index}_REPEAT_OFFSET\t${sample.repeatOffset}`);
		metadataLines.push(`const S${index}_REPEAT_LENGTH\t${sample.repeatLength}`);
	}

	const metadataConstants = `constants sampleMeta\n; @tab 24\n${metadataLines.join('\n')}\n\nconstantsEnd\n`;
	return { samples, metadataConstants };
}

export function createInspectData(parsed: ParsedMod): InspectData {
	return {
		title: parsed.title,
		formatTag: parsed.formatTag,
		channels: parsed.channels,
		songLength: parsed.songLength,
		restartPosition: parsed.restartPosition,
		patternCount: parsed.patternCount,
		fileSize: parsed.fileSize,
		usedOrderTable: parsed.usedOrderTable,
		samples: parsed.samples.map(sample => ({
			index: sample.index,
			name: sample.name,
			lengthBytes: sample.lengthBytes,
			volume: sample.volume,
			finetune: sample.finetune,
			repeatOffset: sample.repeatOffset,
			repeatLength: sample.repeatLength,
			hasData: sample.lengthBytes > 0,
		})),
	};
}

export function formatInspectText(parsed: ParsedMod, inputPath: string): string {
	const lines: string[] = [];
	lines.push(`File: ${inputPath}`);
	lines.push(`Title: ${parsed.title || '(untitled)'}`);
	lines.push(`Format: ${parsed.formatTag}`);
	lines.push(`Channels: ${parsed.channels}`);
	lines.push(`Song length: ${parsed.songLength}`);
	lines.push(`Restart position: ${parsed.restartPosition}`);
	lines.push(`Patterns: ${parsed.patternCount}`);
	lines.push(`File size: ${parsed.fileSize} bytes`);
	lines.push(`Order table: ${parsed.usedOrderTable.join(', ') || '(empty)'}`);
	lines.push('');
	lines.push('Samples:');

	const nonEmptySamples = parsed.samples.filter(sample => sample.lengthBytes > 0);
	if (nonEmptySamples.length === 0) {
		lines.push('  (no non-empty samples)');
	} else {
		for (const sample of nonEmptySamples) {
			lines.push(
				`  ${String(sample.index).padStart(2, '0')}. ${sample.name || '(unnamed)'} | ${sample.lengthBytes} bytes | vol=${sample.volume} | fine=${sample.finetune} | loop=${sample.repeatOffset}:${sample.repeatLength}`
			);
		}
	}

	return `${lines.join('\n')}\n`;
}
