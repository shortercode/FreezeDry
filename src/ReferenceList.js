import { REFERENCE } from "./types.js";

export class ReferenceList {
	constructor () {
		this.data = new Map();
		this.counter = 0;
	}
	add (obj) {
		let ref = this.data.get(obj);

		if (ref)
			return ref;

		this.data.set(obj, {
			type: REFERENCE,
			data: this.counter++
		});
	}
}