import crypto from "crypto";
import sharp from "sharp";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_LONG_EDGE = 2400;
const JPEG_QUALITY = 82;

const ALLOWED_SNIFFED: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function isHeicBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  const box = buf.subarray(4, 12).toString("ascii");
  return (
    box === "ftypheic" ||
    box === "ftypheix" ||
    box === "ftyphevc" ||
    box === "ftyphevx" ||
    box === "ftypmif1" ||
    box === "ftypmsf1"
  );
}

export function sniffContentType(buf: Buffer): string | null {
  if (!buf || buf.length < 4) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";

  return null;
}

export type DocProcessingMeta = {
  byte_size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  original_content_type: string;
  processed: boolean;
};

export type DocProcessingResult = {
  outBuf: Buffer;
  storedContentType: string;
  ext: string;
  meta: DocProcessingMeta;
};

type ProcessError = {
  ok: false;
  error: string;
  status: number;
};

type ProcessSuccess = {
  ok: true;
} & DocProcessingResult;

export async function enforceLimitsAndProcess(
  rawBuf: Buffer,
  clientContentType?: string,
): Promise<ProcessSuccess | ProcessError> {
  if (rawBuf.length > MAX_FILE_BYTES) {
    return { ok: false, error: "File too large (max 12MB).", status: 413 };
  }

  if (isHeicBuffer(rawBuf)) {
    return {
      ok: false,
      error: "HEIC/HEIF files are not accepted. Please upload JPG, PNG, or PDF.",
      status: 415,
    };
  }

  const sniffed = sniffContentType(rawBuf);
  const originalContentType = sniffed ?? clientContentType ?? "application/octet-stream";

  if (!sniffed || !ALLOWED_SNIFFED.has(sniffed)) {
    return { ok: false, error: "Unsupported file type.", status: 415 };
  }

  const isImage = sniffed.startsWith("image/");

  if (isImage) {
    const pipeline = sharp(rawBuf)
      .rotate()
      .resize({
        width: MAX_LONG_EDGE,
        height: MAX_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

    const outBuf = await pipeline.toBuffer();
    const { width, height } = await sharp(outBuf).metadata();

    const sha256 = crypto.createHash("sha256").update(outBuf).digest("hex");

    return {
      ok: true,
      outBuf,
      storedContentType: "image/jpeg",
      ext: "jpg",
      meta: {
        byte_size: outBuf.length,
        sha256,
        width: width ?? null,
        height: height ?? null,
        original_content_type: originalContentType,
        processed: true,
      },
    };
  }

  const sha256 = crypto.createHash("sha256").update(rawBuf).digest("hex");

  return {
    ok: true,
    outBuf: rawBuf,
    storedContentType: "application/pdf",
    ext: "pdf",
    meta: {
      byte_size: rawBuf.length,
      sha256,
      width: null,
      height: null,
      original_content_type: originalContentType,
      processed: false,
    },
  };
}
