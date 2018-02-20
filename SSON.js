/*
	Designed to match the structured clone algorithm in behaviour,
	with the exception of FileList objects as they cannot be created
*/

/*
 * Constants for different token types
 */
const TYPE_NULL = 0x00;
const TYPE_UNDEFINED = 0x01;
const TYPE_FLOAT_64 = 0x02;
const TYPE_VINT_POS = 0x03;
const TYPE_VINT_NEG = 0x04;
const TYPE_BOOLEAN_TRUE = 0x05;
const TYPE_BOOLEAN_FALSE = 0x06;
const TYPE_STRING = 0x07;
const TYPE_DATE = 0x08;
const TYPE_REGEXP = 0x09;
const TYPE_BLOB = 0x0A;
const TYPE_FILE = 0x0B
const TYPE_ARRAYBUFFER = 0x0C;
const TYPE_INT8_ARRAY = 0x0D;
const TYPE_UINT8_ARRAY = 0x0E;
const TYPE_CLAMPED_UINT8_ARRAY = 0x0F;
const TYPE_INT16_ARRAY = 0x10;
const TYPE_UINT16_ARRAY = 0x11;
const TYPE_INT32_ARRAY = 0x12;
const TYPE_UINT32_ARRAY = 0x13;
const TYPE_FLOAT32_ARRAY = 0x14;
const TYPE_FLOAT64_ARRAY = 0x15;
const TYPE_DATAVIEW = 0x16;
const TYPE_IMAGEDATA = 0x17;
const TYPE_GENERIC_ARRAY = 0x18;
const TYPE_GENERIC_OBJECT = 0x19;
const TYPE_MAP = 0x1A;
const TYPE_SET = 0x1B;
const TYPE_REFERENCE = 0x1C;
/*
 * Constants for tokens with static values
 */
const TOKEN_NULL = { type: TYPE_NULL };
const TOKEN_UNDEFINED = { type: TYPE_UNDEFINED };
const TOKEN_BOOLEAN_TRUE = { type: TYPE_BOOLEAN_TRUE };
const TOKEN_BOOLEAN_FALSE = { type: TYPE_BOOLEAN_FALSE };
/*
 * Constants for general stuff
 */
const MAX_UINT = 2 ** 32;
const LOWER_BITMASK = 0b01111111;
const HIGHER_BITMASK = 0b10000000;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const TypedArray = Object.getPrototypeOf(Int8Array)

class ReferenceSet {
	constructor () {
		this.data = new Map();
		this.counter = 0;
	}
	add (obj) {
		let ref = this.data.get(obj);

		if (ref)
			return ref;

		this.set(obj, {
			type: TYPE_REFERENCE,
			data: this.counter++
		});
	}
}

/*
	async to allow writing blobs to the package
*/
async function serialize (obj) {
	const referenceList = new ReferenceSet();
	const structure = tokenize(obj, referenceList);

	const size = tokenSize(structure);
	const writer = new Writer();

	writer.Allocate(size);

	await serializeToken(structure, writer);

	return writer.Close();
}

function serializeToken (token, writer) {
	writer.Write8(token.type);
	switch (token.type) {
		case TYPE_NULL:
		case TYPE_BOOLEAN_TRUE:
		case TYPE_BOOLEAN_FALSE:
			// no additional data for these types
			break;

		case TYPE_STRING:
			writer.WriteV(token.length);
			writer.WriteText(token.data);
			break;
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
		case TYPE_UINT8_ARRAY:
			writer.WriteV(token.length);
			writer.WriteBytes(token.data);
			break;
		case TYPE_BLOB:
			writer.WriteV(token.length);
			writer.WriteBlob(token.data);
			//these types require length and data
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

function parse (buffer) {

}

const isIterable = obj => obj != null && typeof obj[Symbol.iterator] === 'function';

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
		if (this.available < str.length)
			throw new Error("Not enough buffer space available");

		const view = ENCODER.encode(str);

		this.WriteBytes(view);
	}

	WriteV (v)
	{
		if (v >= MAX_UINT)
			throw new Error("Exceeded max size");
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

		this.allocation.setUint8(this.position, v);
		this.position += 1;
	}

	Write16 (v)
	{
		if (this.available < 2)
			throw new Error("Not enough buffer space available");

		this.allocation.setUint16(this.position, v);
		this.position += 2;
	}

	Write32 (v)
	{
		if (this.available < 4)
			throw new Error("Not enough buffer space available");

		this.allocation.setUint32(this.position, v);
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

		this.allocation.setFloat64(this.position, v);
		this.position += 8;
	}
}

class Reader {
	constructor ()
	{
		this.blob = null;
		this.buffer = null;
		this.view = null;

		this.position = 0;
		this.length = 0;
	}

	async ReadFrom (blob)
	{
		this.blob = blob;
		this.buffer = await ReadBlob(blob);
		this.view = new DataView(this.buffer);
		this.length = this.buffer.byteLength;
	}

	Close ()
	{
		this.blob = null;
		this.buffer = null;
		this.view = null;
		this.length = 0;
		this.position = 0;
	}

	ReadBlob (length, type = "text/plain")
	{
		const i = this.position;
		this.position += length;
		return this.blob.slice(i, this.position, type);
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
		return DECODER.decode(view);
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
		const v = this.view.getUint8(this.position, true);
		this.position += 1;
		return v;
	}
	Read16 ()
	{
		const v = this.view.getUint16(this.position, true);
		this.position += 2;
		return v;
	}
	Read32 ()
	{
		const v = this.view.getUint32(this.position, true);
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
		const v = this.view.getFloat64(this.position, true);
		this.position += 8;
		return v;
	}
}

function createToken(type, length, data) {
	return {
		type,
		length,
		data
	};
}

function tokenizeTypedArray(obj) {
	if (obj instanceof Uint8Array) {
		return createToken(TYPE_UINT8_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Int8Array) {
		return createToken(TYPE_INT8_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Uint8ClampedArray) {
		return createToken(TYPE_CLAMPED_UINT8_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Uint16Array) {
		return createToken(TYPE_UINT16_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Int16Array) {
		return createToken(TYPE_INT16_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Uint32Array) {
		return createToken(TYPE_UINT32_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Int32Array) {
		return createToken(TYPE_INT32_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Float32Array) {
		return createToken(TYPE_FLOAT32_ARRAY, obj.byteLength, obj);
	}
	else if (obj instanceof Float64Array) {
		return createToken(TYPE_FLOAT64_ARRAY, obj.byteLength, obj);
	}
}

function tokenizeObject(obj, object_set) {
	if (obj === null)
		return TOKEN_NULL;

	const ref = object_set.add(obj);

	if (ref)
		return ref;

	if (obj instanceof Date) {
		return createToken(TYPE_DATE, 8, obj.getTime());
	}
	else if (obj instanceof RegExp) {
		const str = obj.toString();
		return createToken(TYPE_REGEXP, str, str);
	}
	else if (obj instanceof TypedArray) {
		return tokenizeTypedArray(obj);
	}
	else if (obj instanceof DataView) {
		return createToken(TYPE_DATAVIEW, obj.byteLength, obj);
	}
	else if (obj instanceof ArrayBuffer) {
		return createToken(TYPE_ARRAYBUFFER, obj.byteLength, obj);
	}
	else if (obj instanceof Map) {
		const contents = [];
		for (const [key, item] of Object.entries(obj)) {
			contents.push([
				tokenize(item, object_set),
				tokenize(item, object_set)
			]);
		}

		return createToken(TYPE_MAP, evaluateObjectLength(contents), contents);
	}
	else if (obj instanceof Set) {
		const contents = [];
		for (const item of obj) {
			contents.push(tokenize(item, object_set));
		}

		return createToken(TYPE_SET, evaluateArrayLength(contents), contents);
	}
	else if (obj instanceof File) {
		const  { type, name, lastModified } = obj;
		const typeLength = type.length;
		const nameLength = name.length;
		return createToken(TYPE_FILE, obj.size + nameLength + typeLength + vIntLength(typeLength) + vIntLength(nameLength) + vIntLength(lastModified), [ type, name, lastModified, obj ]);
	}
	else if (obj instanceof Blob) {
		const  { type } = obj;
		const typeLength = type.length;
		const data = [ type, obj ];
		return createToken(TYPE_BLOB, obj.size + typeLength + vIntLength(typeLength), data);
	}
	else if (obj instanceof ImageData) {
		const  { width, height } = obj;
		return createToken(TYPE_IMAGEDATA, obj.size + vIntLength(width) + vIntLength(height), [ width, height, obj ]);
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
