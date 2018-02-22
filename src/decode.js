import * as TYPE from "./types.js";
import { Reader } from "./Reader.js";

export async function decode (buffer) {
	const reader = new Reader(buffer);

	const str = reader.ReadText(4);
	const props = reader.Read16();
	const end = reader.Read16();

	if (str != "JSOF" || end != 0x0D0A)
		throw new Error("Invalid header");

	return parseToken(reader);
}

function skip (l, reader) {
	reader.Skip(l);
	return null;
}

function parseToken (reader) {
	const type = reader.Read8();
	const l = type < 9 ? reader.ReadV() : 0;

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
			return new RegExp(reader.ReadText(l));
			break;
		case TYPE.SET:
			return skip(l, reader);
			break;
		case TYPE.GENERIC_ARRAY:
			return skip(l, reader);
			break;
		case TYPE.GENERIC_OBJECT:
			return skip(l, reader);
			break;
		case TYPE.MAP:
			return skip(l, reader);
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
			return skip(l, reader);
			break;
		case TYPE.ARRAYBUFFER:
			return skip(l, reader);
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
			return skip(reader);
			break;
	}
}
