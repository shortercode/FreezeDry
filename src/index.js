import { encode } from "./encode.js";
import { decode } from "./decode.js";

/*
	Designed to match the structured clone algorithm in behaviour,
	with the exception of FileList objects as they cannot be created
*/

export encode;
export decode;