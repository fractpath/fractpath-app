import crypto from "crypto";
import sharp from "sharp";

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function isHeicBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf.slice(4, 8).toString("ascii") !== "ftyp") return false;
  const brand = buf.slice(8, 12).toString("ascii");
  const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"]);
  if (heicBrands.has(brand)) return true;
  const head = buf.slice(0, Math.min(buf.length, 32)).toString("latin1");
  return head.includes("heic") || head.includes("heif");
}

function sniffContentType(buf) {
  if (!buf || buf.length < 4) return "application/octet-stream";

  if (buf.slice(0, 4).toString("ascii") === "%PDF") return "application/pdf";

  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buf.length >= 8 && buf.slice(0, 8).equals(pngSig)) return "image/png";

  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";

  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  return "application/octet-stream";
}

function extForContentType(contentType) {
  switch (contentType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "application/pdf": return "pdf";
    default: return "bin";
  }
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function enforceLimitsAndProcess(rawBuf, clientContentType) {
  const MAX_BYTES = 12 * 1024 * 1024;

  if (rawBuf.length > MAX_BYTES) {
    const e = new Error("File too large");
    e.status = 413;
    throw e;
  }

  if (isHeicBuffer(rawBuf)) {
    const e = new Error("HEIC/HEIF not supported");
    e.status = 415;
    throw e;
  }

  const sniffed = sniffContentType(rawBuf);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowed.has(sniffed)) {
    const e = new Error("Unsupported file type");
    e.status = 415;
    throw e;
  }

  const meta = {
    original_content_type: sniffed || clientContentType || null,
    width: null,
    height: null,
    phash: null,
    byte_size: null,
    sha256: null,
  };

  // PDFs pass-through
  if (sniffed === "application/pdf") {
    meta.byte_size = rawBuf.length;
    meta.sha256 = sha256Hex(rawBuf);
    return { outBuf: rawBuf, storedContentType: "application/pdf", ext: "pdf", meta };
  }

  // Images => transcode to JPEG, strip metadata, max 2400px long edge, quality 82
  const img = sharp(rawBuf, { failOnError: true }).rotate();
  const md = await img.metadata();
  // resize only if needed; never enlarge
  const width = md.width ?? null;
  const height = md.height ?? null;

  let pipeline = img;
  if (width && height) {
    const longEdge = Math.max(width, height);
    if (longEdge > 2400) {
      if (width >= height) pipeline = pipeline.resize({ width: 2400, withoutEnlargement: true });
      else pipeline = pipeline.resize({ height: 2400, withoutEnlargement: true });
    }
  }

  const outBuf = await pipeline.jpeg({ quality: 82 }).toBuffer();
  meta.byte_size = outBuf.length;
  meta.sha256 = sha256Hex(outBuf);

  // final dimensions after processing
  const md2 = await sharp(outBuf).metadata();
  meta.width = md2.width ?? null;
  meta.height = md2.height ?? null;

  return { outBuf, storedContentType: "image/jpeg", ext: "jpg", meta };
}

async function main() {
  let pass = 0;

  // sniffing basics
  assert(sniffContentType(Buffer.from("%PDF-1.7\n")) === "application/pdf", "PDF sniff");
  pass++;

  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert(sniffContentType(jpg) === "image/jpeg", "JPEG sniff");
  pass++;

  const heic = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypheic", "ascii"),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ]);
  assert(isHeicBuffer(heic) === true, "HEIC detect");
  pass++;

  // size limit
  try {
    await enforceLimitsAndProcess(Buffer.alloc(12 * 1024 * 1024 + 1), "image/jpeg");
    assert(false, "size limit should throw");
  } catch (e) {
    assert(e.status === 413, "size limit 413");
  }
  pass++;

  // HEIC reject
  try {
    await enforceLimitsAndProcess(heic, "image/jpeg");
    assert(false, "HEIC should throw");
  } catch (e) {
    assert(e.status === 415, "HEIC reject 415");
  }
  pass++;

  // PDF passthrough
  const pdfBuf = Buffer.from("%PDF-1.4\n%...\n", "ascii");
  const rPdf = await enforceLimitsAndProcess(pdfBuf, "application/pdf");
  assert(rPdf.storedContentType === "application/pdf", "PDF stored type");
  assert(rPdf.ext === "pdf", "PDF ext");
  pass++;

  // Transcode smoke test: generate PNG => transcode => JPEG magic ff d8 ff
  const pngOut = await sharp({
    create: { width: 50, height: 30, channels: 3, background: { r: 200, g: 10, b: 10 } }
  }).png().toBuffer();

  const rImg = await enforceLimitsAndProcess(pngOut, "image/png");
  assert(rImg.storedContentType === "image/jpeg", "image stored type jpeg");
  assert(rImg.outBuf.length >= 3 && rImg.outBuf[0] === 0xff && rImg.outBuf[1] === 0xd8 && rImg.outBuf[2] === 0xff, "jpeg magic ff d8 ff");
  assert(typeof rImg.meta.sha256 === "string" && rImg.meta.sha256.length === 64, "sha256 present");
  pass++;

  console.log(`OK: ${pass} assertions passed`);
}

main().catch((e) => {
  console.error("Test script failed:", e);
  process.exit(1);
});