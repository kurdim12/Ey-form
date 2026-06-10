/**
 * Client-side image processing for the registration form.
 *
 * Downscales to a max dimension of 1600px and exports JPEG at quality 0.82.
 * If the browser can't decode the file (e.g. some HEIC files), we fall back to
 * uploading the original bytes rather than failing the whole registration.
 */

export const MAX_DIMENSION = 1600;
export const JPEG_QUALITY = 0.82;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ProcessedPhoto {
  blob: Blob;
  /** File extension to use for the storage path (jpg when re-encoded). */
  ext: string;
  contentType: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode-failed"));
    };
    img.src = url;
  });
}

/**
 * Returns a downscaled JPEG blob, or the original file if it can't be decoded.
 * Throws only for caller-validated conditions handled upstream.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  try {
    const img = await loadImage(file);

    const { width, height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas-context");

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    );

    if (!blob) throw new Error("encode-failed");

    return { blob, ext: "jpg", contentType: "image/jpeg" };
  } catch {
    // Couldn't decode/encode — upload the original bytes untouched.
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : "jpg";
    return {
      blob: file,
      ext,
      contentType: file.type || "application/octet-stream",
    };
  }
}
