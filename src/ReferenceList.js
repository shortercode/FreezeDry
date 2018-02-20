export class ReferenceList {
	constructor () {
		this.data = new Map();
		this.counter = 0;
	}
	add (obj) {
		let ref = this.data.get(obj);

		if (ref)
			return ref;

		this.set(obj, {
			type: TYPE_REFERENCE,
			data: this.counter++
		});
	}
}