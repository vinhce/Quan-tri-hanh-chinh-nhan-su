import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { HRM_CONFIG } from './config';
import type { UploadedFileEntity } from './types';

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

const UPLOAD_DIR = path.join(process.cwd(), 'scratch', 'uploads');

function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function validateCvFile(originalName: string, sizeBytes: number, mimeType: string): void {
  if (sizeBytes > HRM_CONFIG.MAX_UPLOAD_SIZE_BYTES) {
    throw new FileValidationError(
      `Dung lượng tệp (${(sizeBytes / 1024 / 1024).toFixed(1)} MB) vượt quá giới hạn tối đa cho phép là 5 MB.`
    );
  }

  const ext = path.extname(originalName).toLowerCase();
  const allowedExts = HRM_CONFIG.ALLOWED_CV_EXTENSIONS as readonly string[];
  if (!allowedExts.includes(ext)) {
    throw new FileValidationError(
      `Định dạng tệp không hợp lệ (${ext}). Vui lòng tải lên tệp định dạng .pdf, .doc hoặc .docx.`
    );
  }

  const allowedMimes = HRM_CONFIG.ALLOWED_CV_MIMES as readonly string[];
  if (!allowedMimes.includes(mimeType) && mimeType !== 'application/octet-stream') {
    throw new FileValidationError(`Loại nội dung tệp không hợp lệ (${mimeType}).`);
  }
}

export async function saveCvFile(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerType: string;
  ownerId: string;
}): Promise<UploadedFileEntity> {
  const { buffer, originalName, mimeType, ownerType, ownerId } = params;

  validateCvFile(originalName, buffer.length, mimeType);
  ensureUploadDir();

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(originalName).toLowerCase();
  const fileId = `file-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const storedFilename = `${fileId}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, storedFilename);

  fs.writeFileSync(targetPath, buffer);

  const fileEntity: UploadedFileEntity = {
    id: fileId,
    owner_type: ownerType,
    owner_id: ownerId,
    original_name: originalName,
    stored_filename: storedFilename,
    path: targetPath,
    mime: mimeType,
    size: buffer.length,
    sha256,
    created_at: new Date().toISOString(),
  };

  return fileEntity;
}
