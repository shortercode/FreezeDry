const MAX_UINT = 2 ** 32;
const LOWER_BITMASK = 0b01111111;
const HIGHER_BITMASK = 0b10000000;
const ENCODER = new TextEncoder();

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
