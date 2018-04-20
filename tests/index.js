const freezedry = require("../freezedry.js");
const BSON = require("bson");
const msgpack = require("msgpack-lite");
const fs = require('fs');
const { performance } = require('perf_hooks');

function time(str) {
	const start = performance.now();
	return v => console.log(str, v, performance.now() - start);
}

function wait(t) {
	return new Promise(res => setTimeout(res, t));
}

async function testObject(obj) {
	try {
		const bson = new BSON();
		const jsontime = time("JSON");
		const jsonstring = Buffer.from(JSON.stringify(obj));
		const drytime = time("FREEZEDRY");
		const dried = await freezedry.dry(obj);
		const packtime = time("MSGPACK");
		const packed = await msgpack.encode(obj);
		const bisontime = time("BSON");
		const bison = await bson.serialize(obj);

		jsontime(jsonstring.length);
		drytime(dried.byteLength);
		packtime(packed.length);
		bisontime(bison.length);
	} catch (e) { console.log(e)}
}

async function main () {
	const txt = fs.readFileSync("./tests/example.json", "utf-8");
	const obj = JSON.parse(txt);

	let i = 100;
	while (i--) {
		console.log("\t\tInterval " + (100 - i));
		testObject(obj);
		await wait(10)
	}
}

main();