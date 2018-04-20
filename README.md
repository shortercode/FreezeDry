# FreezeDry

JSON is great for storing and sending data, but with some types of data it just doesn't cut it. Wouldn't it be great if JSON supported things like cyclic structures and binary data? Hmm even better; how about if you could serialise any old JavaScript object?

FreezeDry is a data format designed specifically for JavaScript, with a 1 to 1 representation that can be serialised and deserialised with a single function call. Based on the structured clone algorithm; cyclic references are respected, ArrayBufferViews maintain their reference to the ArrayBuffer and Strings are deduplicated. Many of the built types are supported, including:

- Number
- String
- Boolean
- Null
- Date
- Undefined
- Array
- Object
- Set
- Map
- Regular Expression
- File
- Blob
- ImageBitmap
- ImageData
- ArrayBuffer
- DataView
- Uint8Array
- Uint16Array
- Uint32Array
- Int8Array
- Int16Array
- Int32Array
- Float32Array
- Float64Array
- Uint8ClampedArray

## Serialisation

### `Uint8Array async dry(<Any> input)`

The `freeze.dry()` method converts a JavaScript value to a byte array in the FreezeDry format. This method is asynchronous.

```javascript
	const packet = freeze.dry(testData);
	websocket.send(packet);

```

## Deserialisation

### `<Any> hydrate(Uint8Array input)`

The `freeze.hydrate()` method parses a byte array from the FreezeDry format, constructing the JavaScript value.

```javascript
	websocket.on("data", packet => {
		const data = freeze.hydrate(packet);
	});
```

## What does it not support?

- Function
- Error
- WebAssembly.Module
- FileList
- ESModule
- HTMLElement
- Document
- Symbol
- WeakMap / WeakSet
- Promise
- Proxy
- URL

## Why do you not support xyz?

Some data types cannot be serialised or deserialised. Others can be, but only partially. For instance; Functions can be serialised, but lose their scoping, making them limited in use.

You can work around support for some types by using blobs to store the source of the type, then you can create the object after you have hydrated the blob.

```javascript
	async function save () {
		const res = await fetch("main.wasm");
		const blob = await res.blob();

		return await freeze.dry({
			blob,
			type: "wasm"
		});
	}

	async function restore (byteArray) {
		const blob = freeze.hydrate(byteArray);
		const url = URL.createObjectURL(blob);
		const res = await fetch(url);
		const module = await WebAssembly.compileStreaming(res);
		URL.revokeObjectURL(url);
		return module;
	}
```


## Implementation details

Values are serialised into simple node structure, which allows for nested nodes.

```javascript
	[ TYPE ] [ LENGTH optional ] [ DATA optional ]
```

Some simple types have no data value, and hence no need of the length or data chunk. Other simple types indicate their length by their type or their data so only have a TYPE and DATA value. As such the parser is required to understand the node types in order to parse them.

The type value is specified via a single byte. The length value is specified by variable length unsigned integer ( between 1 and 5 bytes ). The data chunk can be any number of bytes.

It is expected that only one root node exists, and this root node can be of any type.

Unsigned LEB128 is used for variable unsigned integers throughout, but due to JavaScript bitwise limitations it only supports values below `2 ** 32`. This puts a cap on the maximum size of the FreezeDry format at:

`(2 ** 32 - 1) + 5 + 1`

## Understanding LEB128

In LEB128 the first bit of the byte indicates if there are any following bytes, leaving 7 bits per byte to indicate the value.

```javascript
function encodeUINT (v, writeByte) {
	if (v == 0) {
		writeByte(0);
		return;
	}
	while (v != 0) {
		let byte = v & 0b01111111;
		v >>>= 7;
		if (v != 0) /* more bytes to come */
				byte |= 0b10000000;
		writeByte(byte);
	}
}
```

## Types

No length value is defined for the following types:

- **NULL** : 0x00 ( no data )
- **UNDEFINED** : 0x01 ( no data )
- **FLOAT_64** : 0x02 ( fixed size )
- **VINT_POS** : 0x03 ( size indicated by data )
- **VINT_NEG** : 0x04 ( size indicated by data )
- **BOOLEAN_TRUE** : 0x05 ( no data )
- **BOOLEAN_FALSE** : 0x06 ( no data )
- **REFERENCE** : 0x07 ( size indicated by data )
- **DATE** : 0x08 ( fixed size )

These types have data and length values:

- **STRING** : 0x09
- **REGEXP** : 0x0A
- **BLOB** : 0x0B
- **FILE** : 0x0C
- **ARRAYBUFFER** : 0x0D
- **INT8_ARRAY** : 0x0E
- **UINT8_ARRAY** : 0x0F
- **CLAMPED_UINT8_ARRAY** : 0x10
- **INT16_ARRAY** : 0x11
- **UINT16_ARRAY** : 0x12
- **INT32_ARRAY** : 0x13
- **UINT32_ARRAY** : 0x14
- **FLOAT32_ARRAY** : 0x15
- **FLOAT64_ARRAY** : 0x16
- **DATAVIEW** : 0x17
- **IMAGE_DATA** : 0x18
- **GENERIC_ARRAY** : 0x19
- **GENERIC_OBJECT** : 0x1A
- **MAP** : 0x1B
- **SET** : 0x1C
- **IMAGE_BITMAP** : 0x1D

Numbers can be encoded as 3 types; FLOAT_64, VINT_POS and VINT_NEG. As all JS numbers are doubles the type choice is opaque, and is meant as a means of reducing the number of bytes needed to represent a number. If a value is an integer and below the maximum vint value then it is either stored as VINT_POS or VINT_NEG, depending if the value is positive or negative. All other numerical values are stored as FLOAT_64.

All "object" types ( 0x09 and higher ) are added to a reference list as they are serialised / deserialised and assigned a unique value. Whenever the object appears again a REFERENCE type is used instead, which only contains that value. This enables the cyclic referencing. An incrementing integer value is used for the unique value, and it is stored as a VINT. Values which only appear once will not have any additional overhead.

The internal structure of a type is generally specific for the type. For example, ArrayBufferViews will contain a length and byteOffset value with either a REFERENCE or ARRAYBUFFER node depending on if the ArrayBuffer has been seen before.

For more detail on the structure of each type please refer to encode.js




