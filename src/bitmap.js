// NOTE could potentially use offscreen canvas here to give worker support, but the API is still a bit flaky
let workingCanvas, workingContext;

function resize(x, y) {
	workingCanvas.width = x;
	workingCanvas.height = y;
}

export function bitmapToImageData(bitmap) {
	if (!workingCanvas) {
		workingCanvas = document.createElement('canvas');
		workingContext = workingCanvas.getContext('2d');
	}
	resize(imageData.width, imageData.height);
	workingContext.drawImage(bitmap, 0, 0);
	const img = workingContext.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
	resize(1, 1);
	return img;
}