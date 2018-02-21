export async function decode (buffer) {
	const reader = new Reader(buffer);
	
	const str = reader.ReadText(4);
	const props = reader.Read16();
	const end = reader.Read16();
	
	if (str != "JSOF" || end != 0x0D0A)
		throw new Error("Invalid header");
	
	return parseToken(reader);	
}

function parseToken (reader) {
	switch (reader.Read8()) {
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
			const l = reader.ReadV();
			return reader.ReadText(l);
			break;
		case TYPE_REGEXP:
			const l = reader.ReadV();
			return new RegExp(reader.ReadText(l));
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
			return writer.WriteV(token.data);
			break;
	}
}
