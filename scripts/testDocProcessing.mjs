import { createHash } from "crypto";

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);
const HEIC_FTYP = Buffer.alloc(12);
HEIC_FTYP.writeUInt32BE(0x00000020, 0);
HEIC_FTYP.write("ftypheic", 4, "ascii");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

async function run() {
  const mod = await import("../src/lib/uploads/documentProcessing.ts");

  assert(mod.isHeicBuffer(HEIC_FTYP), "isHeicBuffer detects HEIC");
  assert(!mod.isHeicBuffer(JPEG_MAGIC), "isHeicBuffer rejects JPEG");
  assert(!mod.isHeicBuffer(PNG_MAGIC), "isHeicBuffer rejects PNG");

  assert(mod.sniffContentType(JPEG_MAGIC) === "image/jpeg", "sniff JPEG");
  assert(mod.sniffContentType(PNG_MAGIC) === "image/png", "sniff PNG");
  assert(mod.sniffContentType(PDF_MAGIC) === "application/pdf", "sniff PDF");
  assert(mod.sniffContentType(Buffer.from([0x00, 0x00])) === null, "sniff unknown returns null");

  const tooBig = Buffer.alloc(13 * 1024 * 1024);
  const bigResult = await mod.enforceLimitsAndProcess(tooBig);
  assert(!bigResult.ok && bigResult.status === 413, "rejects >12MB with 413");

  const heicResult = await mod.enforceLimitsAndProcess(HEIC_FTYP);
  assert(!heicResult.ok && heicResult.status === 415, "rejects HEIC with 415");

  const unknownBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const unknownResult = await mod.enforceLimitsAndProcess(unknownBuf);
  assert(!unknownResult.ok && unknownResult.status === 415, "rejects unknown type with 415");

  const pdfBuf = Buffer.concat([PDF_MAGIC, Buffer.from("-1.4 fake pdf content")]);
  const pdfResult = await mod.enforceLimitsAndProcess(pdfBuf);
  assert(pdfResult.ok, "PDF passes processing");
  if (pdfResult.ok) {
    assert(pdfResult.storedContentType === "application/pdf", "PDF stored as application/pdf");
    assert(pdfResult.ext === "pdf", "PDF ext is pdf");
    assert(!pdfResult.meta.processed, "PDF not transcoded");
    assert(pdfResult.meta.byte_size === pdfBuf.length, "PDF byte_size correct");
    assert(typeof pdfResult.meta.sha256 === "string" && pdfResult.meta.sha256.length === 64, "PDF sha256 present");
    const expectedSha = createHash("sha256").update(pdfBuf).digest("hex");
    assert(pdfResult.meta.sha256 === expectedSha, "PDF sha256 matches");
  }

  const sharp = (await import("sharp")).default;
  const pngBuf = await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const pngResult = await mod.enforceLimitsAndProcess(pngBuf, "image/png");
  assert(pngResult.ok, "PNG image passes processing");
  if (pngResult.ok) {
    assert(pngResult.storedContentType === "image/jpeg", "PNG transcoded to JPEG");
    assert(pngResult.ext === "jpg", "PNG transcoded ext is jpg");
    assert(pngResult.meta.processed === true, "PNG marked as processed");
    assert(typeof pngResult.meta.width === "number" && pngResult.meta.width > 0, "width populated");
    assert(typeof pngResult.meta.height === "number" && pngResult.meta.height > 0, "height populated");
    assert(pngResult.meta.original_content_type === "image/png", "original_content_type is image/png");
    assert(pngResult.outBuf[0] === 0xff && pngResult.outBuf[1] === 0xd8 && pngResult.outBuf[2] === 0xff, "output starts with JPEG magic ff d8 ff");
  }

  console.log("\nAll document processing tests complete.");
}

run().catch((e) => {
  console.error("Test script failed:", e);
  process.exitCode = 1;
});
