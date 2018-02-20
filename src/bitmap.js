// NOTE could potentially use offscreen canvas here to give worker support, but the API is still a bit flaky
const workingCanvas = document.createElement('canvas');
const workingContext = workingCanvas.getContext('2d');

function resize(x, y) {
	workingCanvas.width = x;
	workingCanvas.height = y;
}

export function bitmapToImageData(bitmap) {
	resize(imageData.width, imageData.height);
	workingContext.drawImage(bitmap, 0, 0);
	return workingContext.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
}

export function bitmapFromImageData(imageData) {
	resize(imageData.width, imageData.height);
	workingContext.putImageData(imagedata, 0, 0);
	return createImageBitmap(workingCanvas, 0, 0, workingCanvas.width, workingCanvas.height);
}