export const MAX_UINT = 2 ** 32;
export const LOWER_BITMASK = 0b01111111;
export const HIGHER_BITMASK = 0b10000000;
export function vIntLength(obj) {
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

export function encodeText(txt) {
	if (encoder)
		return encoder.encode(txt);
	else
		return Buffer.from(txt);
}

export function textLength(txt) {
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

export function decodeText(buffer) {
	if (decoder)
		return decoder.decode(buffer);
	else
		return Buffer.from(buffer).toString("utf-8");
}