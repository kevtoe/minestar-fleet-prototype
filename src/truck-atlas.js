import truckAtlasSrc from './Grid.png';
import truckMaskSrc from './Grid_mask.png';

export const TRUCK_ATLAS_LAYOUT = {
  statusColumns: 4,
  rows: 10,
  cellWidth: 180,
  cellHeight: 180,
};

const MATERIAL_COLOURS = [
  '#464648',
  '#BC733A',
  '#867868',
  '#B68C3D',
  '#B55333',
  '#D0C192',
];

export async function getTruckComposedAtlas() {
  const [baseImage, maskImage] = await Promise.all([
    loadImage(truckAtlasSrc),
    loadImage(truckMaskSrc),
  ]);

  const maskCanvas = createTransparentMaskCanvas(maskImage);
  const width = baseImage.width * MATERIAL_COLOURS.length;
  const height = baseImage.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  for (let materialIndex = 0; materialIndex < MATERIAL_COLOURS.length; materialIndex++) {
    const x = materialIndex * baseImage.width;
    const tintedMask = createTintedMaskCanvas(maskCanvas, MATERIAL_COLOURS[materialIndex]);
    ctx.drawImage(baseImage, x, 0);
    ctx.drawImage(tintedMask, x, 0);
  }

  return {
    ...TRUCK_ATLAS_LAYOUT,
    columns: TRUCK_ATLAS_LAYOUT.statusColumns * MATERIAL_COLOURS.length,
    materialVariantCount: MATERIAL_COLOURS.length,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

function createTransparentMaskCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;

    if (brightness < 16) {
      data[i + 3] = 0;
      continue;
    }

    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.max(data[i + 3], Math.round((brightness / 255) * 255));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function createTintedMaskCanvas(maskCanvas, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = maskCanvas.width;
  canvas.height = maskCanvas.height;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';

  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load atlas asset: ${src}`));
    image.src = src;
  });
}