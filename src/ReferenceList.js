import { REFERENCE } from "./types.js";

const MAX_UINT = 2 ** 32;

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

export class ReferenceList {
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