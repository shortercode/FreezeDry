import * as TYPE from "./types.js";
import { Writer } from "./Writer.js";
import { ReferenceList } from "./ReferenceList.js";
import { bitmapToImageData } from "./bitmap.js";
import { MAX_UINT, vIntLength, textLength } from "./misc.js";

/*
 * Keep fixed value tokens as constants
 */

const TOKEN_NULL = { type: TYPE.NULL };
const TOKEN_UNDEFINED = { type: TYPE.UNDEFINED };
const TOKEN_BOOLEAN_TRUE = { type: TYPE.BOOLEAN_TRUE };
const TOKEN_BOOLEAN_FALSE = { type: TYPE.BOOLEAN_FALSE };

/*
 * Potential options:
 * - deduplicate strings
 * - use UINT64 for lengths
 * - use UINT64 for references
 * - come up with some way of writing larger values to VINTs
 */

export async function dry (obj) {
	const referenceList = new ReferenceList();
	const structure = tokenize(obj, referenceList);

	const size = tokenSize(structure);
	const writer = new Writer(size);
	await serializeToken(structure, writer);

	return writer.Close();
}

function isIterable (obj) {
	return obj != null && typeof obj[Symbol.iterator] === 'function';
}

async function serializeToken (token, writer) {

	const startPosition = writer.position;
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
				await serializeToken(item, writer);
			break;
		case TYPE.GENERIC_OBJECT:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				writer.WriteTextAndLength(key);
				await serializeToken(item, writer);
			}
			break;
		case TYPE.MAP:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				await serializeToken(key, writer);
				await serializeToken(item, writer);
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
			await serializeToken(token.data[0], writer);
			break;
		case TYPE.ARRAYBUFFER:
			writer.WriteV(token.length);
			writer.WriteBytes(new Uint8Array(token.data));
			break;
		case TYPE.FILE:
			writer.WriteV(token.length);
			writer.WriteTextAndLength(token.data[0]);
			writer.WriteTextAndLength(token.data[1]);
			writer.Write64(token.data[2]);
			writer.WriteBytes(new Uint8Array(await ReadBlob(token.data[3])));
			break;
		case TYPE.BLOB:
			writer.WriteV(token.length);
			writer.WriteTextAndLength(token.data[0]);
			writer.WriteBytes(new Uint8Array(await ReadBlob(token.data[1])));
			break;
		case TYPE.IMAGE_DATA:
		case TYPE.IMAGE_BITMAP:
			writer.WriteV(token.length);
			await serializeToken(token.data[0], writer);
			writer.WriteV(token.data[1]);
			writer.WriteV(token.data[2]);
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

	const finishPosition = writer.position;
	const writtenLength = finishPosition - startPosition;

	if (writtenLength > tokenSize(token))
		throw "more bytes written than expected";
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
		const l = textLength(key);
		count += l + vIntLength(l);
		count += tokenSize(item);
	}
	return count;
}

function ReadBlob(blob) {
	return new Promise ((resolve, reject) => {
		if (typeof FileReader == "undefined")
			return reject("this platform does not support blobs");

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

const tokenizerMap = new Map();

function tokenizeTypedArray(type, obj, object_set) {

	const { buffer, length, byteLength, byteOffset } = obj;
	const len = obj instanceof DataView ? byteLength : length;
	let ref = object_set.add(buffer);

	if (!ref)
		ref = createToken(TYPE.ARRAYBUFFER, buffer.byteLength, buffer);

	const contents = [ref, len, byteOffset];
	const l = tokenSize(ref) + vIntLength(len) + vIntLength(byteOffset);

	return createToken(type, l, contents);
}

function tokenizeIterable (obj, object_set) {
	const contents = [];
	for (const item of obj) {
		contents.push(tokenize(item, object_set));
	}

	return createToken(TYPE.GENERIC_ARRAY, evaluateArrayLength(contents), contents);
}

function tokenizeObject(obj, object_set) {
	if (obj === null)
		return TOKEN_NULL;

	const ref = object_set.add(obj);

	if (ref)
		return ref;

	let tokenizer = tokenizerMap.get(obj.constructor);

	if (!tokenizer) {

		for (const [key, value] of tokenizerMap.entries()) {
			if (obj instanceof key) {
				tokenizer = value;
				break;
			}
		}

		if (!tokenizer)
			throw new TypeError("Unable to serialize unknown type");
	}

	return tokenizer(obj, object_set);
}

function define (ctor, tokenizer) {
	tokenizerMap.set(ctor, tokenizer);
}

// semi primative objects

define(RegExp, obj => {
	const str = obj.toString();
	return createToken(TYPE.REGEXP, textLength(str), str);
});

define(Date, obj => createToken(TYPE.DATE, 8, obj.getTime()));

define(ArrayBuffer, obj => createToken(TYPE.ARRAYBUFFER, obj.byteLength, obj));

// typed array instances

define(DataView, (obj, set) => tokenizeTypedArray(TYPE.DATAVIEW, obj, set));
define(Uint8Array, (obj, set) => tokenizeTypedArray(TYPE.UINT8_ARRAY, obj, set));
define(Int8Array, (obj, set) => tokenizeTypedArray(TYPE.INT8_ARRAY, obj, set));
define(Uint8ClampedArray, (obj, set) => tokenizeTypedArray(TYPE.CLAMPED_UINT8_ARRAY, obj, set));
define(Uint16Array, (obj, set) => tokenizeTypedArray(TYPE.UINT16_ARRAY, obj, set));
define(Int16Array, (obj, set) => tokenizeTypedArray(TYPE.INT16_ARRAY, obj, set));
define(Uint32Array, (obj, set) => tokenizeTypedArray(TYPE.UINT32_ARRAY, obj, set));
define(Int32Array, (obj, set) => tokenizeTypedArray(TYPE.INT32_ARRAY, obj, set));
define(Float32Array, (obj, set) => tokenizeTypedArray(TYPE.FLOAT32_ARRAY, obj, set));
define(Float64Array, (obj, set) => tokenizeTypedArray(TYPE.FLOAT64_ARRAY, obj, set));

// blob like objects

// NOTE these aren't available in node.js, so we need to check if they exist
// before defining them

if (typeof ImageBitmap != "undefined") {
	define(ImageBitmap, obj => {
		const imageData = bitmapToImageData(obj);
		const { width, height } = imageData;
		const buffer = createToken(imageData.data);
		const length = buffer.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE.IMAGE_BITMAP, length, [ buffer, width, height ]);
	});
}

if (typeof ImageData != "undefined") {
	define(ImageData, obj => {
		// TODO this does not perform a ref check with it's buffer
		const  { width, height } = obj;
		const buffer = createToken(obj.data);
		const length = buffer.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE.IMAGE_DATA, length, [ buffer, width, height ]);
	});
}

if (typeof File != "undefined") {
	define(File, obj => {
		const  { type, name, lastModified } = obj;
		const typeLength = textLength(type);
		const nameLength = textLength(name);
		const length = obj.size + nameLength + typeLength + vIntLength(typeLength) + vIntLength(nameLength) + 8;
		return createToken(TYPE.FILE, length, [ type, name, lastModified, obj ]);
	});
}

if (typeof Blob != "undefined") {
	define(Blob, obj => {
		const  { type } = obj;
		const typeLength = textLength(type);
		const data = [ type, obj ];
		return createToken(TYPE.BLOB, obj.size + typeLength + vIntLength(typeLength), data);
	});
}

// collections

define(Map, (obj, object_set) => {
	const contents = [];
	for (const [key, item] of obj.entries()) {
		contents.push([
			tokenize(key, object_set),
			tokenize(item, object_set)
		]);
	}

	return createToken(TYPE.MAP, evaluateMapLength(contents), contents);
});

define(Set, (obj, object_set) => {
	const contents = [];
	for (const item of obj) {
		contents.push(tokenize(item, object_set));
	}

	return createToken(TYPE.SET, evaluateArrayLength(contents), contents);
});

define(Array, tokenizeIterable);

define(Object, (obj, object_set) => {

	if (isIterable(obj))
		return tokenizeIterable(obj, object_set);

	const contents = [];
	for (const [key, item] of Object.entries(obj)) {
		contents.push([ key, tokenize(item, object_set) ]);
	}

	return createToken(TYPE.GENERIC_OBJECT, evaluateObjectLength(contents), contents);
});

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

			return createToken(TYPE.STRING, textLength(obj), obj);

			break;
		case "number":
			// if an integer, try using LEB variable length uint encoding
			if (Number.isInteger(obj) && obj < MAX_UINT) {
				const abs = Math.abs(obj);
				return createToken(obj >= 0 ? TYPE.VINT_POS : TYPE.VINT_NEG, vIntLength(abs), abs);
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
