import * from "./types.js";
import { Writer } from "./Writer.js";
import { ReferenceList } from "./ReferenceList.js";
import { bitmapToImageData } from "./bitmap.js";

/*
 * Keep fixed value tokens as constants
 */

const TOKEN_NULL = { type: TYPE_NULL };
const TOKEN_UNDEFINED = { type: TYPE_UNDEFINED };
const TOKEN_BOOLEAN_TRUE = { type: TYPE_BOOLEAN_TRUE };
const TOKEN_BOOLEAN_FALSE = { type: TYPE_BOOLEAN_FALSE };
const HEADER_SIZE = 8;

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
	const writer = new Writer();

	writer.Allocate(size);

	/*
	 * Header chunk ( 8 bytes )
	 * - File ID string
	 * - 2 bytes for versioning
	 * - CRLF
	 */

	writer.WriteText("JSOF");
	writer.Write8(0x00);
	writer.Write8(0x00);
	writer.Write8(0x0D);
	writer.Write8(0x0A);

	await serializeToken(structure, writer);

	return writer.Close();
}

function isIterable (obj) {
	return obj != null && typeof obj[Symbol.iterator] === 'function';
}

function serializeToken (token, writer) {
	writer.Write8(token.type);
	switch (token.type) {
		case TYPE_NULL:
		case TYPE_UNDEFINED:
		case TYPE_BOOLEAN_TRUE:
		case TYPE_BOOLEAN_FALSE:
			// no additional data for these types
			break;

		case TYPE_STRING:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case TYPE_REGEXP:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case TYPE_SET:
		case TYPE_GENERIC_ARRAY:
			writer.WriteV(token.length);
			for (const item of token.data)
				serializeToken(item, writer);
			break;
		case TYPE_GENERIC_OBJECT:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				writer.WriteV(key.length);
				writer.WriteText(key);
				serializeToken(item, writer);
			}
			break;
		case TYPE_MAP:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				serializeToken(key, writer);
				serializeToken(item, writer);
			}
			break;
		case TYPE_UINT8_ARRAY:
		case TYPE_INT8_ARRAY:
		case TYPE_CLAMPED_UINT8_ARRAY:
		case TYPE_INT16_ARRAY:
		case TYPE_UINT16_ARRAY:
		case TYPE_INT32_ARRAY:
		case TYPE_UINT32_ARRAY:
		case TYPE_FLOAT32_ARRAY:
		case TYPE_FLOAT64_ARRAY:
		case TYPE_DATAVIEW:
			writer.WriteV(token.length);
			writer.WriteV(token.data[1]);
			writer.WriteV(token.data[2]);
			serializeToken(token.data[0], writer);
			break;
		case TYPE_ARRAYBUFFER:
			writer.WriteV(token.length);
			writer.WriteBytes(new Uint8Array(token.data));
			break;
		case TYPE_FILE:
			writer.WriteV(token.length);
			writer.WriteV(token.data[0].length);
			writer.WriteText(token.data[0]);
			writer.WriteV(token.data[1].length);
			writer.WriteText(token.data[1]);
			writer.WriteV(token.data[2]);
			writer.WriteBytes(await ReadBlob(token.data[3]));
			break;
		case TYPE_BLOB:
			writer.WriteV(token.length);
			writer.WriteV(token.data[0].length);
			writer.WriteText(token.data[0]);
			writer.WriteBytes(await ReadBlob(token.data[1]));
			break;
		case TYPE_IMAGE_DATA:
		case TYPE_IMAGE_BITMAP:
			writer.WriteV(token.length);
			writer.WriteV(token.data.width);
			writer.WriteV(token.data.height);
			writer.WriteBytes(token.data.data);
			break;
		case TYPE_FLOAT_64:
		case TYPE_DATE:
			writer.Write64(token.data);
			break;
		case TYPE_VINT_POS:
		case TYPE_VINT_NEG:
		case TYPE_REFERENCE:
			writer.WriteV(token.data);
			// these types only require the data
			break;
	}
}

function vIntLength(i) {
	if (!Number.isInteger(obj) || obj >= MAX_UINT)
		throw new Error("Invalid value for LEB UINT");
	let length = 5;
	if (value < 128)
		length =  1;
	else if (value < 16384)
		length =  2;
	else if (value < 2097152)
		length =  3;
	else if (value < 268435456)
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
	return 1 + ("length" in obj ? obj.length + vIntLength(obj.length) : 0)
}

function createToken(type, length, data) {
	return {
		type,
		length,
		data
	};
}

function tokenizeTypedArray(obj) {
	
	const { buffer, byteLength, byteOffset } = obj;
	const ref = object_set.add(buffer);

	if (!ref)
		ref = createToken(TYPE_ARRAYBUFFER, buffer.byteLength, buffer);
	
	const contents = [ref, byteLength, byteOffset];
	const length = tokenSize(ref) + vIntLength(byteLength) + vIntLength(byteOffset);
	
	// should deduplicate the underlying array buffer here, could be very useful
	if (obj instanceof DataView) {
		return createToken(TYPE_DATAVIEW, length, contents);
	}
	else if (obj instanceof Uint8Array) {
		return createToken(TYPE_UINT8_ARRAY, length, contents);
	}
	else if (obj instanceof Int8Array) {
		return createToken(TYPE_INT8_ARRAY, length, contents);
	}
	else if (obj instanceof Uint8ClampedArray) {
		return createToken(TYPE_CLAMPED_UINT8_ARRAY, length, contents);
	}
	else if (obj instanceof Uint16Array) {
		return createToken(TYPE_UINT16_ARRAY, length, contents);
	}
	else if (obj instanceof Int16Array) {
		return createToken(TYPE_INT16_ARRAY, length, contents);
	}
	else if (obj instanceof Uint32Array) {
		return createToken(TYPE_UINT32_ARRAY, length, contents);
	}
	else if (obj instanceof Int32Array) {
		return createToken(TYPE_INT32_ARRAY, length, contents);
	}
	else if (obj instanceof Float32Array) {
		return createToken(TYPE_FLOAT32_ARRAY, length, contents);
	}
	else if (obj instanceof Float64Array) {
		return createToken(TYPE_FLOAT64_ARRAY, length, contents);
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
		return createToken(TYPE_REGEXP, str, str);
	}
	else if (obj instanceof Date) {
		return createToken(TYPE_DATE, 8, obj.getTime());
	}
	else if (obj instanceof ArrayBuffer) {
		return createToken(TYPE_ARRAYBUFFER, obj.byteLength, obj);
	}

	// array buffer views

	else if (obj instanceof TypedArray || obj instanceof DataView) {
		return tokenizeTypedArray(obj);
	})

  // blob type objects

	else if (obj instanceof ImageBitmap) {
		const imageData = bitmapToImageData(obj);
		const { width, height } = imageData;
		const length = imageData.data.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE_IMAGE_BITMAP, length, imageData);
	}
	else if (obj instanceof ImageData) {
		const  { width, height } = obj;
		const length = obj.data.length + vIntLength(width) + vIntLength(height);
		return createToken(TYPE_IMAGE_DATA, length, obj);
	}
	else if (obj instanceof File) {
		const  { type, name, lastModified } = obj;
		const typeLength = type.length;
		const nameLength = name.length;
		const length = obj.size + nameLength + typeLength + vIntLength(typeLength) + vIntLength(nameLength) + vIntLength(lastModified);
		return createToken(TYPE_FILE, length, [ type, name, lastModified, obj ]);
	}
	else if (obj instanceof Blob) {
		const  { type } = obj;
		const typeLength = type.length;
		const data = [ type, obj ];
		return createToken(TYPE_BLOB, obj.size + typeLength + vIntLength(typeLength), data);
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

		return createToken(TYPE_MAP, evaluateMapLength(contents), contents);
	}
	else if (obj instanceof Set) {
		const contents = [];
		for (const item of obj) {
			contents.push(tokenize(item, object_set));
		}

		return createToken(TYPE_SET, evaluateArrayLength(contents), contents);
	}
	else if (isIterable(obj)) {
		const contents = [];
		for (const item of obj) {
			contents.push(tokenize(item, object_set));
		}

		return createToken(TYPE_GENERIC_ARRAY, evaluateArrayLength(contents), contents);
	}
	else {
		const contents = [];
		for (const [key, item] of Object.entries(obj)) {
			contents.push([ key, tokenize(item, object_set) ]);
		}

		return createToken(TYPE_GENERIC_OBJECT, evaluateObjectLength(contents), contents);
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

			return createToken(TYPE_STRING, obj.length, obj);

			break;
		case "number":
			// if an integer, try using LEB variable length uint encoding
			if (Number.isInteger(obj) && obj < MAX_UINT) {
				return createToken(obj >= 0 ? TYPE_VINT_POS : TYPE_VINT_NEG, vIntLength(obj), Math.abs(obj));
			// fallback to double
			} else {
				return createToken(TYPE_FLOAT_64, 8, obj);
			}

			break;
		case "function":
			throw new TypeError("Unable to serialize function");
			break;
	}
}
