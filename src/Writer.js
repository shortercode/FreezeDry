import { MAX_UINT, LOWER_BITMASK, HIGHER_BITMASK, encodeText, textLength } from "./misc.js";

export class Writer {
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
