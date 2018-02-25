import * as TYPE from "./types.js";
import { Writer } from "./Writer.js";
import { ReferenceList } from "./ReferenceList.js";
import { bitmapToImageData } from "./bitmap.js";

/*
 * Keep fixed value tokens as constants
 */

const MAX_UINT = 2 ** 32;

const TOKEN_NULL = { type: TYPE.NULL };
const TOKEN_UNDEFINED = { type: TYPE.UNDEFINED };
const TOKEN_BOOLEAN_TRUE = { type: TYPE.BOOLEAN_TRUE };
const TOKEN_BOOLEAN_FALSE = { type: TYPE.BOOLEAN_FALSE };
const HEADER_SIZE = 0;//8;

const TypedArray = Object.getPrototypeOf(Int8Array);

/*
 * Potential options:
 * - deduplicate strings
 * - use UINT64 for lengths
 * - use UINT64 for references
 * - come up with some way of writing larger values to VINTs
 */

export async function encode (obj) {
	const referenceList = new ReferenceList();
	const structure = tokenize(obj, referenceList);

	const size = HEADER_SIZE + tokenSize(structure);
	const writer = new Writer(size);

	/*
	 * Header chunk ( 8 bytes )
	 * - File ID string
	 * - 2 bytes for versioning
	 * - CRLF
	 */

	// writer.WriteText("JSOF");
	// writer.Write8(0x00);
	// writer.Write8(0x00);
	// writer.Write8(0x0D);
	// writer.Write8(0x0A);

	console.log(structure);
	console.log(referenceList);

	await serializeToken(structure, writer);

	return writer.Close();
}

function isIterable (obj) {
	return obj != null && typeof obj[Symbol.iterator] === 'function';
}

async function serializeToken (token, writer) {
	writer.Write8(token.type);
	switch (token.type) {
		case TYPE.NULL:
		case TYPE.UNDEFINED:
		case TYPE.BOOLEAN_TRUE:
		case TYPE.BOOLEAN_FALSE:
			// no additional data for these types
			break;

		case TYPE.STRING:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case TYPE.REGEXP:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case TYPE.SET:
		case TYPE.GENERIC_ARRAY:
			writer.WriteV(token.length);
			for (const item of token.data)
				serializeToken(item, writer);
			break;
		case TYPE.GENERIC_OBJECT:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				writer.WriteV(key.length);
				writer.WriteText(key);
				serializeToken(item, writer);
			}
			break;
		case TYPE.MAP:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				serializeToken(key, writer);
				serializeToken(item, writer);
			}
			break;
		case TYPE.UINT8_ARRAY:
		case TYPE.INT8_ARRAY:
		case TYPE.CLAMPED_UINT8_ARRAY:
		case TYPE.INT16_ARRAY:
		case TYPE.UINT16_ARRAY:
		case TYPE.INT32_ARRAY:
		case TYPE.UINT32_ARRAY:
		case TYPE.FLOAT32_ARRAY:
		case TYPE.FLOAT64_ARRAY:
		case TYPE.DATAVIEW:
			writer.WriteV(token.length);
			writer.WriteV(token.data[1]);
			writer.WriteV(token.data[2]);
			serializeToken(token.data[0], writer);
			break;
		case TYPE.ARRAYBUFFER:
			writer.WriteV(token.length);
			writer.WriteBytes(new Uint8Array(token.data));
			break;
		case TYPE.FILE:
			writer.WriteV(token.length);
			writer.WriteV(token.data[0].length);
			writer.WriteText(token.data[0]);
			writer.WriteV(token.data[1].length);
			writer.WriteText(token.data[1]);
			writer.WriteV(token.data[2]);
			writer.WriteBytes(await ReadBlob(token.data[3]));
			break;
		case TYPE.BLOB:
			writer.WriteV(token.length);
			writer.WriteV(token.data[0].length);
			writer.WriteText(token.data[0]);
			writer.WriteBytes(await ReadBlob(token.data[1]));
			break;
		case TYPE.IMAGE_DATA:
		case TYPE.IMAGE_BITMAP:
			writer.WriteV(token.length);
			writer.WriteV(token.data.width);
			writer.WriteV(token.data.height);
			writer.WriteBytes(token.data.data);
			break;
		case TYPE.FLOAT_64:
		case TYPE.DATE:
			writer.WriteFloat(token.data);
			break;
		case TYPE.VINT_POS:
		case TYPE.VINT_NEG:
		case TYPE.REFERENCE:
			writer.WriteV(token.data);
			// these types only require the data
			break;
	}
}

function vIntLength(obj) {
	if (!Number.isInteger(obj) || obj >= MAX_UINT)
		throw new Error("Invalid value for LEB UINT");
	let length = 5;
	if (obj < 128)
		length =  1;
	else if (obj < 16384)
		length =  2;
	else if (obj < 2097152)
		length =  3;
	else if (obj < 268435456)
		length =  4;

	return length;
}

function evaluateMapLength (obj) {
	let count = 0;
	for (const [key, item] of obj) {
		count += tokenSize(key);
		count += tokenSize(item);
	}
	return count;
}

function evaluateArrayLength (obj) {
	let count = 0;
	for (const item of obj) {
		count += tokenSize(item);
	}
	return count;
}

function evaluateObjectLength(obj) {
	let count = 0;
	for (const [key, item] of obj) {
		const l = key.length;
		count += l + vIntLength(l);
		count += tokenSize(item);
	}
	return count;
}

function ReadBlob(blob) {
	return new Promise ((resolve, reject) => {
		const fileReader = new FileReader();
		fileReader.onload = () => resolve(fileReader.result);
		fileReader.onerror = () => reject(fileReader.error);
		fileReader.readAsArrayBuffer(blob);
	});
}

function tokenSize(obj) {
	if ("length" in obj) {
		const { type, length } = obj;
		if (type < 9) {
			return 1 + length;
		}
		else {
			return 1 + length + vIntLength(length);
		}
	}
	else {
		return 1;
	}
}

function createToken(type, length, data) {
	return {
		type,
		length,
		data
	};
}

function tokenizeTypedArray(obj, object_set) {

	const { buffer, length, byteLength, byteOffset } = obj;
	const len = obj instanceof DataView ? byteLength : length;
	let ref = object_set.add(buffer);

	if (!ref)
		ref = createToken(TYPE.ARRAYBUFFER, buffer.byteLength, buffer);

	const contents = [ref, len, byteOffset];
	const l = tokenSize(ref) + vIntLength(len) + vIntLength(byteOffset);

	// should deduplicate the underlying array buffer here, could be very useful
	if (obj instanceof DataView) {
		return createToken(TYPE.DATAVIEW, l, contents);
	}
	else if (obj instanceof Uint8Array) {
		return createToken(TYPE.UINT8_ARRAY, l, contents);
	}
	else if (obj instanceof Int8Array) {
		return createToken(TYPE.INT8_ARRAY, l, contents);
	}
	else if (obj instanceof Uint8ClampedArray) {
		return createToken(TYPE.CLAMPED_UINT8_ARRAY, l, contents);
	}
	else if (obj instanceof Uint16Array) {
		return createToken(TYPE.UINT16_ARRAY, l, contents);
	}
	else if (obj instanceof Int16Array) {
		return createToken(TYPE.INT16_ARRAY, l, contents);
	}
	else if (obj instanceof Uint32Array) {
		return createToken(TYPE.UINT32_ARRAY, l, contents);
	}
	else if (obj instanceof Int32Array) {
		return createToken(TYPE.INT32_ARRAY, l, contents);
	}
	else if (obj instanceof Float32Array) {
		return createToken(TYPE.FLOAT32_ARRAY, l, contents);
	}
	else if (obj instanceof Float64Array) {
		return createToken(TYPE.FLOAT64_ARRAY, l, contents);
	}
}

function tokenizeObject(obj, object_set) {
	if (obj === null)
		return TOKEN_NULL;

	const ref = object_set.add(obj);

	if (ref)
		return ref;

	// semi primative values

	if (obj instanceof RegExp) {
		const str = obj.toString();
		return createToken(TYPE.REGEXP, str.length, str);
	}
	else if (obj instanceof Date) {
		return createToken(TYPE.DATE, 8, obj.getTime());
	}
	else if (obj instanceof ArrayBuffer) {
		return createToken(TYPE.ARRAYBUFFER, obj.byteLength, obj);
	}

	// array buffer views

	else if (obj instanceof TypedArray || obj instanceof DataView) {
		return tokenizeTypedArray(obj, object_set);
	}

  // blob type objects

	else if (obj instanceof ImageBitmap) {
		const imageData = bitmapToImageData(obj);
		const { width, height } = imageData;
		const length = imageData.data.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE.IMAGE_BITMAP, length, imageData);
	}
	else if (obj instanceof ImageData) {
		const  { width, height } = obj;
		const length = obj.data.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE.IMAGE_DATA, length, obj);
	}
	else if (obj instanceof File) {
		const  { type, name, lastModified } = obj;
		const typeLength = type.length;
		const nameLength = name.length;
		const length = obj.size + nameLength + typeLength + vIntLength(typeLength) + vIntLength(nameLength) + vIntLength(lastModified);
		return createToken(TYPE.FILE, length, [ type, name, lastModified, obj ]);
	}
	else if (obj instanceof Blob) {
		const  { type } = obj;
		const typeLength = type.length;
		const data = [ type, obj ];
		return createToken(TYPE.BLOB, obj.size + typeLength + vIntLength(typeLength), data);
	}

	// collections

	else if (obj instanceof Map) {
		const contents = [];
		for (const [key, item] of Object.entries(obj)) {
			contents.push([
				tokenize(key, object_set),
				tokenize(item, object_set)
			]);
		}

		return createToken(TYPE.MAP, evaluateMapLength(contents), contents);
	}
	else if (obj instanceof Set) {
		const contents = [];
		for (const item of obj) {
			contents.push(tokenize(item, object_set));
		}

		return createToken(TYPE.SET, evaluateArrayLength(contents), contents);
	}
	else if (isIterable(obj)) {
		const contents = [];
		for (const item of obj) {
			contents.push(tokenize(item, object_set));
		}

		return createToken(TYPE.GENERIC_ARRAY, evaluateArrayLength(contents), contents);
	}
	else {
		const contents = [];
		for (const [key, item] of Object.entries(obj)) {
			contents.push([ key, tokenize(item, object_set) ]);
		}

		return createToken(TYPE.GENERIC_OBJECT, evaluateObjectLength(contents), contents);
	}
}

function tokenize (obj, object_set) {
	switch (typeof obj) {
		case "undefined":
			return TOKEN_UNDEFINED;
		case "object":
			return tokenizeObject(obj, object_set);
			break;
		case "boolean":
			return obj ? TOKEN_BOOLEAN_TRUE : TOKEN_BOOLEAN_FALSE;
			break;
		case "string":
			const ref = object_set.add(obj);

			if (ref)
				return ref;

			return createToken(TYPE.STRING, obj.length, obj);

			break;
		case "number":
			// if an integer, try using LEB variable length uint encoding
			if (Number.isInteger(obj) && obj < MAX_UINT) {
				return createToken(obj >= 0 ? TYPE.VINT_POS : TYPE.VINT_NEG, vIntLength(obj), Math.abs(obj));
			// fallback to double
			} else {
				return createToken(TYPE.FLOAT_64, 8, obj);
			}

			break;
		case "function":
			throw new TypeError("Unable to serialize function");
			break;
	}
}
