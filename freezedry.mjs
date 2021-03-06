const NULL = 0x00;
const UNDEFINED = 0x01;
const FLOAT_64 = 0x02;
const VINT_POS = 0x03;
const VINT_NEG = 0x04;
const BOOLEAN_TRUE = 0x05;
const BOOLEAN_FALSE = 0x06;
const REFERENCE = 0x07;
const DATE = 0x08;
const STRING = 0x09;
const REGEXP = 0x0A;
const BLOB = 0x0B;
const FILE = 0x0C;
const ARRAYBUFFER = 0x0D;
const INT8_ARRAY = 0x0E;
const UINT8_ARRAY = 0x0F;
const CLAMPED_UINT8_ARRAY = 0x10;
const INT16_ARRAY = 0x11;
const UINT16_ARRAY = 0x12;
const INT32_ARRAY = 0x13;
const UINT32_ARRAY = 0x14;
const FLOAT32_ARRAY = 0x15;
const FLOAT64_ARRAY = 0x16;
const DATAVIEW = 0x17;
const IMAGE_DATA = 0x18;
const GENERIC_ARRAY = 0x19;
const GENERIC_OBJECT = 0x1A;
const MAP = 0x1B;
const SET = 0x1C;
const IMAGE_BITMAP = 0x01D;

const MAX_UINT = 2 ** 32;
const LOWER_BITMASK = 0b01111111;
const HIGHER_BITMASK = 0b10000000;
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

const encoder = typeof TextEncoder != "undefined" && new TextEncoder();
const decoder = typeof TextDecoder != "undefined" && new TextDecoder();
const Buff = typeof Buffer != "undefined" && Buffer;

function encodeText(txt) {
	if (encoder)
		return encoder.encode(txt);
	else
		return Buffer.from(txt);
}

function textLength(txt) {
	if (Buff)
		return Buff.byteLength(txt);

	let length = 0;

	for (let i = 0, l = txt.length; i < l; i++) {
		const codePoint = txt.charCodeAt(i);
		if (codePoint < 0x100) {
			length += 1;
			continue;
		}

		if (codePoint < 0x10000) {
			length += 2;
			continue;
		}

		if (codePoint < 0x1000000) {
			length += 3;
			continue;
		}

		length += 4;
	}

	return length;
}

function decodeText(buffer) {
	if (decoder)
		return decoder.decode(buffer);
	else
		return Buffer.from(buffer).toString("utf-8");
}

class Writer {
	constructor (size)
	{
		const buffer = new ArrayBuffer(size);

		this.view = new DataView(buffer);
		this.uintview = new Uint8Array(buffer);
		this.position = 0;
		this.length = size;
	}

	get available ()
	{
		return this.length - this.position;
	}

	Close ()
	{
		const output = this.uintview;

		this.view = null;
		this.uintview = null;
		this.position = 0;
		this.length = 0;

		return output;
	}

	WriteBytes (typedArray)
	{
		const length = typedArray.length;

		if (this.available < length)
			throw new Error("Not enough buffer space available");

		this.uintview.set(typedArray, this.position);
		this.position += length;
	}

	async WriteBlob (blob)
	{
		if (this.available < blob.size)
			throw new Error("Not enough buffer space available");

		const buffer = await ReadBlob(blob);

		this.WriteBytes(new Uint8Array(buffer));
	}

	WriteText (str)
	{
		// NOTE this may not be correct for strings with multi byte characters
		if (this.available < str.length)
			throw new Error("Not enough buffer space available");

		const view = encodeText(str);

		this.WriteBytes(view);
	}

	WriteTextAndLength (str)
	{
		const length = textLength(str);

		if (this.available < length)
			throw new Error("Not enough buffer space available");

		this.WriteV(length);
		this.WriteText(str);
	}

	WriteV (v)
	{
		if (v >= MAX_UINT)
			throw new Error("Exceeded max size");
		if (v == 0) {
			this.Write8(0);
			return;
		}
		while (v != 0) {
			let byte = v & LOWER_BITMASK;
			v >>>= 7;
			if (v != 0) /* more bytes to come */
	    		byte |= HIGHER_BITMASK;
			this.Write8(byte);
  	}
	}

	Write8 (v)
	{
		if (this.available < 1)
			throw new Error("Not enough buffer space available");

		this.view.setUint8(this.position, v);
		this.position += 1;
	}

	Write16 (v)
	{
		if (this.available < 2)
			throw new Error("Not enough buffer space available");

		this.view.setUint16(this.position, v);
		this.position += 2;
	}

	Write32 (v)
	{
		if (this.available < 4)
			throw new Error("Not enough buffer space available");

		this.view.setUint32(this.position, v);
		this.position += 4;
	}

	Write64 (v)
	{
		if (this.available < 8)
			throw new Error("Not enough buffer space available");

		if (v >= Number.MAX_SAFE_INTEGER)
			throw new Error("Value larger than MAX_SAFE_INTEGER");

		const lower32 = v >>> 0;
		const upper32 = (v / 0x100000000) >>> 0;

		this.Write32(lower32);
		this.Write32(upper32);
	}

	WriteFloat (v)
	{
		if (this.available < 8)
			throw new Error("Not enough buffer space available");

		this.view.setFloat64(this.position, v);
		this.position += 8;
	}
}

class ReferenceList {
	constructor () {
		this.data = new Map();
		this.counter = 0;
	}
	add (obj) {
		let ref = this.data.get(obj);

		if (ref)
			return ref;

		const n = this.counter++;
		const l = vIntLength(n);

		this.data.set(obj, {
			type: REFERENCE,
			length: l,
			data: n
		});
	}
}

// NOTE could potentially use offscreen canvas here to give worker support, but the API is still a bit flaky
let workingCanvas, workingContext;

function resize(x, y) {
	workingCanvas.width = x;
	workingCanvas.height = y;
}

function bitmapToImageData(bitmap) {
	if (!workingCanvas) {
		workingCanvas = document.createElement('canvas');
		workingContext = workingCanvas.getContext('2d');
	}
	resize(imageData.width, imageData.height);
	workingContext.drawImage(bitmap, 0, 0);
	const img = workingContext.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
	resize(1, 1);
	return img;
}

/*
 * Keep fixed value tokens as constants
 */

const TOKEN_NULL = { type: NULL };
const TOKEN_UNDEFINED = { type: UNDEFINED };
const TOKEN_BOOLEAN_TRUE = { type: BOOLEAN_TRUE };
const TOKEN_BOOLEAN_FALSE = { type: BOOLEAN_FALSE };

/*
 * Potential options:
 * - deduplicate strings
 * - use UINT64 for lengths
 * - use UINT64 for references
 * - come up with some way of writing larger values to VINTs
 */

async function dry (obj) {
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
		case NULL:
		case UNDEFINED:
		case BOOLEAN_TRUE:
		case BOOLEAN_FALSE:
			// no additional data for these types
			break;

		case STRING:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case REGEXP:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
		case SET:
		case GENERIC_ARRAY:
			writer.WriteV(token.length);
			for (const item of token.data)
				await serializeToken(item, writer);
			break;
		case GENERIC_OBJECT:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				writer.WriteTextAndLength(key);
				await serializeToken(item, writer);
			}
			break;
		case MAP:
			writer.WriteV(token.length);
			for (const [key, item] of token.data) {
				await serializeToken(key, writer);
				await serializeToken(item, writer);
			}
			break;
		case UINT8_ARRAY:
		case INT8_ARRAY:
		case CLAMPED_UINT8_ARRAY:
		case INT16_ARRAY:
		case UINT16_ARRAY:
		case INT32_ARRAY:
		case UINT32_ARRAY:
		case FLOAT32_ARRAY:
		case FLOAT64_ARRAY:
		case DATAVIEW:
			writer.WriteV(token.length);
			writer.WriteV(token.data[1]);
			writer.WriteV(token.data[2]);
			await serializeToken(token.data[0], writer);
			break;
		case ARRAYBUFFER:
			writer.WriteV(token.length);
			writer.WriteBytes(new Uint8Array(token.data));
			break;
		case FILE:
			writer.WriteV(token.length);
			writer.WriteTextAndLength(token.data[0]);
			writer.WriteTextAndLength(token.data[1]);
			writer.Write64(token.data[2]);
			writer.WriteBytes(new Uint8Array(await ReadBlob$1(token.data[3])));
			break;
		case BLOB:
			writer.WriteV(token.length);
			writer.WriteTextAndLength(token.data[0]);
			writer.WriteBytes(new Uint8Array(await ReadBlob$1(token.data[1])));
			break;
		case IMAGE_DATA:
		case IMAGE_BITMAP:
			writer.WriteV(token.length);
			await serializeToken(token.data[0], writer);
			writer.WriteV(token.data[1]);
			writer.WriteV(token.data[2]);
			break;
		case FLOAT_64:
		case DATE:
			writer.WriteFloat(token.data);
			break;
		case VINT_POS:
		case VINT_NEG:
		case REFERENCE:
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

function ReadBlob$1(blob) {
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
		ref = createToken(ARRAYBUFFER, buffer.byteLength, buffer);

	const contents = [ref, len, byteOffset];
	const l = tokenSize(ref) + vIntLength(len) + vIntLength(byteOffset);

	return createToken(type, l, contents);
}

function tokenizeIterable (obj, object_set) {
	const contents = [];
	for (const item of obj) {
		contents.push(tokenize(item, object_set));
	}

	return createToken(GENERIC_ARRAY, evaluateArrayLength(contents), contents);
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
	return createToken(REGEXP, textLength(str), str);
});

define(Date, obj => createToken(DATE, 8, obj.getTime()));

define(ArrayBuffer, obj => createToken(ARRAYBUFFER, obj.byteLength, obj));

// typed array instances

define(DataView, (obj, set) => tokenizeTypedArray(DATAVIEW, obj, set));
define(Uint8Array, (obj, set) => tokenizeTypedArray(UINT8_ARRAY, obj, set));
define(Int8Array, (obj, set) => tokenizeTypedArray(INT8_ARRAY, obj, set));
define(Uint8ClampedArray, (obj, set) => tokenizeTypedArray(CLAMPED_UINT8_ARRAY, obj, set));
define(Uint16Array, (obj, set) => tokenizeTypedArray(UINT16_ARRAY, obj, set));
define(Int16Array, (obj, set) => tokenizeTypedArray(INT16_ARRAY, obj, set));
define(Uint32Array, (obj, set) => tokenizeTypedArray(UINT32_ARRAY, obj, set));
define(Int32Array, (obj, set) => tokenizeTypedArray(INT32_ARRAY, obj, set));
define(Float32Array, (obj, set) => tokenizeTypedArray(FLOAT32_ARRAY, obj, set));
define(Float64Array, (obj, set) => tokenizeTypedArray(FLOAT64_ARRAY, obj, set));

// blob like objects

// NOTE these aren't available in node.js, so we need to check if they exist
// before defining them

if (typeof ImageBitmap != "undefined") {
	define(ImageBitmap, obj => {
		const imageData = bitmapToImageData(obj);
		const { width, height } = imageData;
		const buffer = createToken(imageData.data);
		const length = buffer.length + vIntLength(width) + vIntLength(height);
		return createToken(IMAGE_BITMAP, length, [ buffer, width, height ]);
	});
}

if (typeof ImageData != "undefined") {
	define(ImageData, obj => {
		// TODO this does not perform a ref check with it's buffer
		const  { width, height } = obj;
		const buffer = createToken(obj.data);
		const length = buffer.length + vIntLength(width) + vIntLength(height);
		return createToken(IMAGE_DATA, length, [ buffer, width, height ]);
	});
}

if (typeof File != "undefined") {
	define(File, obj => {
		const  { type, name, lastModified } = obj;
		const typeLength = textLength(type);
		const nameLength = textLength(name);
		const length = obj.size + nameLength + typeLength + vIntLength(typeLength) + vIntLength(nameLength) + 8;
		return createToken(FILE, length, [ type, name, lastModified, obj ]);
	});
}

if (typeof Blob != "undefined") {
	define(Blob, obj => {
		const  { type } = obj;
		const typeLength = textLength(type);
		const data = [ type, obj ];
		return createToken(BLOB, obj.size + typeLength + vIntLength(typeLength), data);
	});
}

// collections

define(Map, (obj, object_set) => {
	const contents = [];
	for (const [key, item] of Object.entries(obj)) {
		contents.push([
			tokenize(key, object_set),
			tokenize(item, object_set)
		]);
	}

	return createToken(MAP, evaluateMapLength(contents), contents);
});

define(Set, (obj, object_set) => {
	const contents = [];
	for (const item of obj) {
		contents.push(tokenize(item, object_set));
	}

	return createToken(SET, evaluateArrayLength(contents), contents);
});

define(Array, tokenizeIterable);

define(Object, (obj, object_set) => {

	if (isIterable(obj))
		return tokenizeIterable(obj, object_set);

	const contents = [];
	for (const [key, item] of Object.entries(obj)) {
		contents.push([ key, tokenize(item, object_set) ]);
	}

	return createToken(GENERIC_OBJECT, evaluateObjectLength(contents), contents);
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

			return createToken(STRING, textLength(obj), obj);

			break;
		case "number":
			// if an integer, try using LEB variable length uint encoding
			if (Number.isInteger(obj) && obj < MAX_UINT) {
				const abs = Math.abs(obj);
				return createToken(obj >= 0 ? VINT_POS : VINT_NEG, vIntLength(abs), abs);
			// fallback to double
			} else {
				return createToken(FLOAT_64, 8, obj);
			}

			break;
		case "function":
			throw new TypeError("Unable to serialize function");
			break;
	}
}

class Reader {
	constructor (typedArray)
	{
		this.buffer = typedArray.buffer;
		this.view = new DataView(this.buffer);
		this.length = this.buffer.byteLength;
		this.position = 0;
	}

	Close ()
	{
		this.buffer = null;
		this.view = null;
		this.length = 0;
		this.position = 0;
	}

	Skip(l)
	{
		this.position += l;
	}

	ReadBlob (length, type = "text/plain")
	{
		const i = this.position;
		this.position += length;
		return new Blob([this.buffer.slice(i, this.position)], { type });
	}

	ReadBuffer (length)
	{
		const buffer = this.buffer.slice(this.position, this.position + length);
		this.position += length;
		return buffer;
	}

	ReadBytes (length)
	{
		const view = new Uint8Array(this.buffer, this.position, length);
		this.position += length;
		return view;
	}

	ReadText (length)
	{
		const view = this.ReadBytes(length, this.position);
		return decodeText(view);
	}

	Peek8 ()
	{
		return this.view.getUint8(this.position);
	}

	ReadV ()
	{
		let result = 0;
		let shift = 0;
		while(true) {
	  		const byte = this.Read8();
	  		result |= (byte & LOWER_BITMASK) << shift;
	  		if ((byte & HIGHER_BITMASK) == 0)
	    		break;
	  		shift += 7;
		}
		return result;
	}

	Read8 ()
	{
		const v = this.view.getUint8(this.position);
		this.position += 1;
		return v;
	}
	Read16 ()
	{
		const v = this.view.getUint16(this.position);
		this.position += 2;
		return v;
	}
	Read32 ()
	{
		const v = this.view.getUint32(this.position);
		this.position += 4;
		return v;
	}
	Read64 ()
	{
		/*
			JS cannot accurately hold Uint64 values within it's number type
			as it uses 64 bit floats for it's numbers. As such there's no
			native methods to actually read or write Uint64 values. The
			maximum safe integer for JS is 9,007,199,254,740,991. Mostly
			the Uint64 values in zip files for filecounts,
			offsets and length. Unless we somehow load a 9 petabyte zip file
			into a browser we should be fine.

			To read the value we need to read 2 Uint32 values, and multiply
			the upper half by MAX_UINT_32. It would be simpler to bitshift
			by 32 but JS bitshifts force the value to a Uint32 so we can't
			do that. For safety we can calculate an easy bounds check for
			the upper half by doing the sum:

			Math.floor((Number.MAX_SAFE_INTEGER - (2 ** 32 - 1)) / 2 ** 32)

			= 2097151
		*/

		const lower32 = this.Read32();
		const upper32 = this.Read32();

		if (upper32 > 2097151)
			throw new Error("Unable to read Uint64, exceeds MAX_SAFE_INT");

		return upper32 * 0x100000000 + lower32;
	}

	ReadFloat ()
	{
		const v = this.view.getFloat64(this.position);
		this.position += 8;
		return v;
	}
}

function hydrate (buffer) {
	const reader = new Reader(buffer);
	const lookup = [];
	return parseToken(reader, lookup);
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
	if (subtype === ARRAYBUFFER)
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
		case NULL:
			return null;
		case UNDEFINED:
			return undefined;
		case BOOLEAN_TRUE:
			return true;
		case BOOLEAN_FALSE:
			return false;
			break;
		case STRING:
			result = reader.ReadText(l);
			break;
		case REGEXP:
			result = createRegExp(reader.ReadText(l));
			break;
		case SET:
			return parseSet(l, reader, lookup);
			break;
		case GENERIC_ARRAY:
			return parseArray(l, reader, lookup);
			break;
		case GENERIC_OBJECT:
			return parseObject(l, reader, lookup);
			break;
		case MAP:
			return parseMap(l, reader, lookup);
			break;
		case UINT8_ARRAY:
			return parseTypedArray(l, Uint8Array, reader, lookup);
			break;
		case INT8_ARRAY:
			return parseTypedArray(l, Int8Array, reader, lookup);
			break;
		case CLAMPED_UINT8_ARRAY:
			return parseTypedArray(l, Uint8ClampedArray, reader, lookup);
			break;
		case INT16_ARRAY:
			return parseTypedArray(l, Int16Array, reader, lookup);
			break;
		case UINT16_ARRAY:
			return parseTypedArray(l, Uint16Array, reader, lookup);
			break;
		case INT32_ARRAY:
			return parseTypedArray(l, Int32Array, reader, lookup);
			break;
		case UINT32_ARRAY:
			return parseTypedArray(l, Uint32Array, reader, lookup);
			break;
		case FLOAT32_ARRAY:
			return parseTypedArray(l, Float32Array, reader, lookup);
			break;
		case FLOAT64_ARRAY:
			return parseTypedArray(l, Float64Array, reader, lookup);
			break;
		case DATAVIEW:
			return parseTypedArray(l, DataView, reader, lookup);
			break;
		case ARRAYBUFFER:
			return parseArrayBuffer(l, reader);
			break;
		case FILE:
			result = parseFile(l, reader);
			break;
		case BLOB:
			result = parseBlob(l, reader);
			break;
		case IMAGE_DATA:
			result = parseImageData(l, reader, lookup);
			break;
		case IMAGE_BITMAP:
			result = createImageBitmap(parseImageData(l, reader, lookup));
			break;
		case FLOAT_64:
			return reader.ReadFloat();
			break;
		case DATE:
			result = new Date(reader.ReadFloat());
			break;
		case VINT_POS:
			return reader.ReadV();
			break;
		case VINT_NEG:
			return -reader.ReadV();
			break;
		case REFERENCE:
			return getReference(reader, lookup);
			break;
	}

	if (result)
		lookup.push(result);

	return result;
}

export { dry, hydrate };
