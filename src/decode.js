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
		case TYPE_NULL:
			return null;
		case TYPE_UNDEFINED:
			return undefined;
		case TYPE_BOOLEAN_TRUE:
			return true;
		case TYPE_BOOLEAN_FALSE:
			return false;
			break;
		case TYPE_STRING:
			return reader.ReadText(l);
			break;
		case TYPE_REGEXP:
			return new RegExp(reader.ReadText(l));
			break;
		case TYPE_SET:
			return skip(l, reader);
			break;
		case TYPE_GENERIC_ARRAY:
			return skip(l, reader);
			break;
		case TYPE_GENERIC_OBJECT:
			return skip(l, reader);
			break;
		case TYPE_MAP:
			return skip(l, reader);
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
			return skip(l, reader);
			break;
		case TYPE_ARRAYBUFFER:
			return skip(l, reader);
			break;
		case TYPE_FILE:
			return skip(l, reader);
			break;
		case TYPE_BLOB:
			return skip(l, reader);
			break;
		case TYPE_IMAGE_DATA:
			return skip(l, reader);
			break;
		case TYPE_IMAGE_BITMAP:
			return skip(l, reader);
			break;
		case TYPE_FLOAT_64:
			return reader.ReadFloat();
			break;
		case TYPE_DATE:
			return new Date(reader.ReadFloat());
			break;
		case TYPE_VINT_POS:
			return reader.ReadV();
			break;
		case TYPE_VINT_NEG:
			return -reader.ReadV();
			break;
		case TYPE_REFERENCE:
			return skip(reader);
			break;
	}
}
