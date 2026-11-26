export interface CompressImageOptions {
  maxDimension?: number;
  quality?: number;
  maxRawBytes?: number;
}

/**
 * Reads a user-selected image file and downscales/compresses oversized photos
 * or screenshots so uploads stay fast and never trigger PayloadTooLargeError.
 */
export async function readAndCompressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.82;
  const maxRawBytes = options.maxRawBytes ?? 15 * 1024 * 1024;

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WEBP).');
  }
  if (file.size > maxRawBytes) {
    throw new Error('Selected image is too large (max 15 MB). Please choose a smaller screenshot or photo.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });

  // Skip canvas re-encoding for SVGs or already lightweight images (< 180 KB)
  if (file.type === 'image/svg+xml' || rawDataUrl.length <= 240_000) {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}
