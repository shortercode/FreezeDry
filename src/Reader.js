const MAX_UINT = 2 ** 32;
const LOWER_BITMASK = 0b01111111;
const HIGHER_BITMASK = 0b10000000;
const DECODER = new TextDecoder();

export class Reader {
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
