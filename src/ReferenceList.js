import { REFERENCE } from "./types.js";
import { vIntLength } from "./misc.js";

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