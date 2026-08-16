export async function measureNormalizedImageDifference(page, left, right) {
  return page.evaluate(async ({ leftBase64, rightBase64 }) => {
    const loadImage = (base64) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${base64}`;
    });
    const [leftImage, rightImage] = await Promise.all([
      loadImage(leftBase64),
      loadImage(rightBase64),
    ]);
    if (
      leftImage.naturalWidth !== rightImage.naturalWidth
      || leftImage.naturalHeight !== rightImage.naturalHeight
    ) {
      throw new Error('Transition screenshots must have matching dimensions.');
    }

    const width = leftImage.naturalWidth;
    const height = leftImage.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(leftImage, 0, 0);
    const leftPixels = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(rightImage, 0, 0);
    const rightPixels = context.getImageData(0, 0, width, height).data;

    let absoluteError = 0;
    const pixelCount = width * height;
    for (let offset = 0; offset < leftPixels.length; offset += 4) {
      absoluteError += Math.abs(leftPixels[offset] - rightPixels[offset]);
      absoluteError += Math.abs(leftPixels[offset + 1] - rightPixels[offset + 1]);
      absoluteError += Math.abs(leftPixels[offset + 2] - rightPixels[offset + 2]);
    }
    return absoluteError / pixelCount / 3 / 255;
  }, {
    leftBase64: left.toString('base64'),
    rightBase64: right.toString('base64'),
  });
}
