import * as TYPE from "./types.js";
import { Reader } from "./Reader.js";

export async function decode (buffer) {
	const reader = new Reader(buffer);
	const lookup = [];
	return parseToken(reader, lookup);
}

function skip (l, reader) {
	reader.Skip(l);
	return null;
}

function createRegExp(str) {
	const parser = /^\/(.*)\/(\w*)$/g;
	const match = parser.exec(str);
	if (!match)
		throw new Error("Unable to parse Regular Expression");

	return new RegExp(match[1], match[2]);
}

function parseArray(l, reader, lookup) {
	const n = reader.position + l;
	const results = [];
	lookup.push(results);
	while (reader.position < n) {
		results.push(parseToken(reader, lookup));
	}
	return results;
}

function parseSet(l, reader, lookup) {
	const n = reader.position + l;
	const results = new Set();
	lookup.push(results);
	while (reader.position < n) {
		results.push(parseToken(reader, lookup));
	}
	return results;
}

function parseObject(l, reader, lookup) {
	const n = reader.position + l;
	const results = {};
	lookup.push(results);
	while (reader.position < n) {
		const textLength = reader.ReadV();
		const key = reader.ReadText(textLength);
		results[key] = parseToken(reader, lookup);
	}
	return results;
}

function parseMap(l, reader, lookup) {
	const n = reader.position + l;
	const results = new Map();
	lookup.push(results);
	while (reader.position < n) {
		const key = parseToken(reader, lookup);
		const value = parseToken(reader, lookup);
		results.set(key, value);
	}
	return results;
}

function parseTypedArray(l, type, reader, lookup) {
	const length = reader.ReadV();
	const offset = reader.ReadV();
	const subtype = reader.Peek8();
	const buffer = parseToken(reader, lookup);
	const result = new type(buffer, offset, length);

	lookup.push(result);
	// only push the buffer to the lookup if the subtype was NOT a REFERENCE
	if (subtype === TYPE.ARRAYBUFFER)
		lookup.push(buffer);

	return result;
}

function parseImageData(l, reader, lookup) {
	const array = parseToken(reader, lookup);
	const width = reader.ReadV();
	const height = reader.ReadV();
	return new ImageData(array, width, height);
}

function parseArrayBuffer(l, reader) {
	return reader.ReadBuffer(l);
}

function parseFile(l, reader) {
	const i = reader.position;
	const typeLength = reader.ReadV();
	const type = reader.ReadText(typeLength);
	const nameLength = reader.ReadV();
	const name = reader.ReadText(nameLength);
	const lastModified = reader.Read64();
	const blob = reader.ReadBlob(l + i - reader.position);
	return new File([ blob ], name, { type, lastModified });
}

function parseBlob(l, reader) {
	const i = reader.position;
	const typeLength = reader.ReadV();
	const type = reader.ReadText(typeLength);
	return reader.ReadBlob(l + i - reader.position, type);
}

function getReference(reader, arr) {
	const i = reader.ReadV();
	if (i < arr.length)
		return arr[i];

	throw new Error("Invalid reference value");
}

function parseToken (reader, lookup) {
	const type = reader.Read8();
	const l = type < 9 ? 0 : reader.ReadV();
	let result;

	switch (type) {
		case TYPE.NULL:
			return null;
		case TYPE.UNDEFINED:
			return undefined;
		case TYPE.BOOLEAN_TRUE:
			return true;
		case TYPE.BOOLEAN_FALSE:
			return false;
			break;
		case TYPE.STRING:
			result = reader.ReadText(l);
			break;
		case TYPE.REGEXP:
			result = createRegExp(reader.ReadText(l));
			break;
		case TYPE.SET:
			return parseSet(l, reader, lookup);
			break;
		case TYPE.GENERIC_ARRAY:
			return parseArray(l, reader, lookup);
			break;
		case TYPE.GENERIC_OBJECT:
			return parseObject(l, reader, lookup);
			break;
		case TYPE.MAP:
			return parseMap(l, reader, lookup);
			break;
		case TYPE.UINT8_ARRAY:
			return parseTypedArray(l, Uint8Array, reader, lookup);
			break;
		case TYPE.INT8_ARRAY:
			return parseTypedArray(l, Int8Array, reader, lookup);
			break;
		case TYPE.CLAMPED_UINT8_ARRAY:
			return parseTypedArray(l, Uint8ClampedArray, reader, lookup);
			break;
		case TYPE.INT16_ARRAY:
			return parseTypedArray(l, Int16Array, reader, lookup);
			break;
		case TYPE.UINT16_ARRAY:
			return parseTypedArray(l, Uint16Array, reader, lookup);
			break;
		case TYPE.INT32_ARRAY:
			return parseTypedArray(l, Int32Array, reader, lookup);
			break;
		case TYPE.UINT32_ARRAY:
			return parseTypedArray(l, Uint32Array, reader, lookup);
			break;
		case TYPE.FLOAT32_ARRAY:
			return parseTypedArray(l, Float32Array, reader, lookup);
			break;
		case TYPE.FLOAT64_ARRAY:
			return parseTypedArray(l, Float64Array, reader, lookup);
			break;
		case TYPE.DATAVIEW:
			return parseTypedArray(l, DataView, reader, lookup);
			break;
		case TYPE.ARRAYBUFFER:
			return parseArrayBuffer(l, reader);
			break;
		case TYPE.FILE:
			result = parseFile(l, reader);
			break;
		case TYPE.BLOB:
			result = parseBlob(l, reader);
			break;
		case TYPE.IMAGE_DATA:
			result = parseImageData(l, reader, lookup);
			break;
		case TYPE.IMAGE_BITMAP:
			result = createImageBitmap(parseImageData(l, reader, lookup));
			break;
		case TYPE.FLOAT_64:
			return reader.ReadFloat();
			break;
		case TYPE.DATE:
			result = new Date(reader.ReadFloat());
			break;
		case TYPE.VINT_POS:
			return reader.ReadV();
			break;
		case TYPE.VINT_NEG:
			return -reader.ReadV();
			break;
		case TYPE.REFERENCE:
			return getReference(reader, lookup);
			break;
	}

	if (result)
		lookup.push(result);

	return result;
}
