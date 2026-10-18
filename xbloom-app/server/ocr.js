// OCR fallback — runs locally with tesseract.js (Arabic + English).
// Only used when every vision-capable model fails to read the attached photo.

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require("tesseract.js");
      return createWorker("ara+eng");
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

async function ocrImage(dataUrl) {
  const base64 = String(dataUrl).replace(/^data:[^,]+,/, "");
  const buffer = Buffer.from(base64, "base64");
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return (data?.text || "").trim();
}

module.exports = { ocrImage };
