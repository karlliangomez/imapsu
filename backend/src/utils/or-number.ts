/**
 * OCR utilities for extracting an Official Receipt (OR) number from an
 * uploaded payment receipt (image or PDF).
 *
 * Images are read with Tesseract.js; PDFs are read as text via unpdf
 * (scanned PDFs with no embedded text yield nothing, which the UI treats
 * as "no OR number" and allows manual entry).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { createWorker } from 'tesseract.js';
import { getDocumentProxy, extractText } from 'unpdf';

type Strapi = Core.Strapi;

const TESSDATA_CACHE = path.join(os.tmpdir(), 'imapsu-tessdata');

const OR_NUMBER_PATTERNS: RegExp[] = [
  // "Official Receipt No. 123456"
  /\bofficial\s+receipt\s+(?:no\.?|number)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "OR No. 123456", "O.R. No: 123456", "OR#123456", "ORNo 123456"
  /\bo\.?\s?r\.?\s*(?:no\.?|number|#)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "Receipt No. 123456" (generic receipt number)
  /\breceipt\s+(?:no\.?|number)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "Official Receipt 123456" / "OR 123456" (bare number, digits only)
  /\b(?:official\s+receipt|or)\s*[:#.-]*\s*([0-9][0-9/-]{3,})/i,
];

const cleanOrNumber = (value: string): string | null => {
  const trimmed = value.trim().replace(/[^A-Za-z0-9/.-]$/g, '');
  return trimmed.length > 0 ? trimmed : null;
};

export function matchOrNumber(text: string): string | null {
  const normalized = text.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ');
  for (const pattern of OR_NUMBER_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const cleaned = cleanOrNumber(match[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getTesseractWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', undefined, { logger: () => {}, cachePath: TESSDATA_CACHE });
  }
  return workerPromise;
}

async function ocrImage(filePath: string): Promise<string> {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(filePath);
  return data.text ?? '';
}

async function pdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? '';
}

/**
 * Resolve an uploaded media file to its OR number, or null when nothing can
 * be confidently extracted. Never throws: failures simply yield null.
 */
export async function extractOrNumberFromFile(
  strapi: Strapi,
  fileId: number | string
): Promise<string | null> {
  try {
    const file = await strapi.db
      .query('plugin::upload.file')
      .findOne({ where: { id: fileId } });
    if (!file || !file.url) return null;

    const filePath = path.join(strapi.dirs.static.public, file.url);
    if (!fs.existsSync(filePath)) return null;

    const isPdf = file.mime === 'application/pdf' || (file.ext ?? '').toLowerCase() === '.pdf';
    const text = isPdf ? await pdfText(filePath) : await ocrImage(filePath);
    return text ? matchOrNumber(text) : null;
  } catch (err) {
    strapi.log?.warn?.(`[ocr] could not read file ${fileId}: ${String(err)}`);
    return null;
  }
}
