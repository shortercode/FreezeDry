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

function parseArray(l, reader) {
	const n = reader.position + l;
	const results = [];
	while (reader.position < n) {
		results.push(parseToken(reader));
	}
	return results;
}

function parseObject(l, reader) {
	const n = reader.position + l;
	const results = {};
	while (reader.position < n) {
		const textLength = reader.ReadV();
		const key = reader.ReadText(textLength);
		results[key] = parseToken(reader);
	}
	return results;
}

function parseMap(l, reader) {
	const n = reader.position + l;
	const results = new Map();
	while (reader.position < n) {
		const key = parseToken(reader);
		const value = parseToken(reader);
		results.set(key, value);
	}
	return results;
}

function parseTypedArray(l, type, reader) {
	const offset = reader.ReadV();
	const length = reader.ReadV();
	const buffer = parseToken(reader);

	return new type(buffer, offset, length);
}

function parseArrayBuffer(l, reader) {
	return reader.ReadBuffer(l);
}

function getReference(reader, arr) {
	const i = reader.ReadV();
	if (i < arr.length)
		return arr[i];

	throw new Error("Invalid reference value");
}

function storeReference(obj, arr) {
	arr.push(obj);
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
			return reader.ReadText(l);
			break;
		case TYPE.REGEXP:
			return createRegExp(reader.ReadText(l));
			break;
		case TYPE.SET:
			return new Set(parseArray(l, reader));
			break;
		case TYPE.GENERIC_ARRAY:
			return parseArray(l, reader);
			break;
		case TYPE.GENERIC_OBJECT:
			return parseObject(l, reader);
			break;
		case TYPE.MAP:
			return parseMap(l, reader);
			break;
		case TYPE.UINT8_ARRAY:
			return parseTypedArray(l, Uint8Array, reader);
			break;
		case TYPE.INT8_ARRAY:
			return parseTypedArray(l, Int8Array, reader);
			break;
		case TYPE.CLAMPED_UINT8_ARRAY:
			return parseTypedArray(l, Uint8ClampedArray, reader);
			break;
		case TYPE.INT16_ARRAY:
			return parseTypedArray(l, Int16Array, reader);
			break;
		case TYPE.UINT16_ARRAY:
			return parseTypedArray(l, Uint16Array, reader);
			break;
		case TYPE.INT32_ARRAY:
			return parseTypedArray(l, Int32Array, reader);
			break;
		case TYPE.UINT32_ARRAY:
			return parseTypedArray(l, Uint32Array, reader);
			break;
		case TYPE.FLOAT32_ARRAY:
			return parseTypedArray(l, Float32Array, reader);
			break;
		case TYPE.FLOAT64_ARRAY:
			return parseTypedArray(l, Float64Array, reader);
			break;
		case TYPE.DATAVIEW:
			return parseTypedArray(l, DataView, reader);
			break;
		case TYPE.ARRAYBUFFER:
			return parseArrayBuffer(l, reader);
			break;
		case TYPE.FILE:
			return skip(l, reader);
			break;
		case TYPE.BLOB:
			return skip(l, reader);
			break;
		case TYPE.IMAGE_DATA:
			return skip(l, reader);
			break;
		case TYPE.IMAGE_BITMAP:
			return skip(l, reader);
			break;
		case TYPE.FLOAT_64:
			return reader.ReadFloat();
			break;
		case TYPE.DATE:
			return new Date(reader.ReadFloat());
			break;
		case TYPE.VINT_POS:
			return reader.ReadV();
			break;
		case TYPE.VINT_NEG:
			return -reader.ReadV();
			break;
		case TYPE.REFERENCE:
			result = getReference(reader, lookup);
			break;
	}

	return result;
}
