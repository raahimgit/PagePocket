import { createWorker } from "tesseract.js";
import { api } from "../shared/api";

export interface OcrProgress {
  status: string;
  progress: number;
}

/** Recognize English text with the OCR engine, model, and WASM files shipped in the extension. */
export async function recognizeText(
  imageDataUrl: string,
  onProgress: (progress: OcrProgress) => void,
): Promise<string> {
  const worker = await createWorker("eng", 1, {
    workerPath: api.runtime.getURL("ocr/worker.min.js"),
    corePath: api.runtime.getURL("ocr/"),
    langPath: api.runtime.getURL("ocr/"),
    workerBlobURL: false,
    gzip: false,
    logger: onProgress,
  });
  try {
    const result = await worker.recognize(imageDataUrl);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
