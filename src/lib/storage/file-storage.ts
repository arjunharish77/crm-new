import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";

const DEFAULT_STORAGE_ROOT = path.join(process.cwd(), "storage");
export type FileStorageDriver = "local" | "s3";

export type PrivateFileWrite = {
  storageKey: string;
  bucket: string;
  driver: FileStorageDriver;
  byteSize: number;
  checksum: string;
  contentType?: string | null;
};

export function storageRoot() {
  return path.resolve(process.env.FILE_STORAGE_ROOT || DEFAULT_STORAGE_ROOT);
}

export function getFileStorageDriver(): FileStorageDriver {
  const driver = (process.env.FILE_STORAGE_DRIVER || "local").toLowerCase();
  if (driver === "s3") return "s3";
  return "local";
}

export function normalizeStorageKey(relativePath: string) {
  const normalized = relativePath.replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) throw new Error("INVALID_STORAGE_PATH");
  return normalized;
}

export function resolveLocalStoragePath(relativePath: string) {
  const normalized = normalizeStorageKey(relativePath);
  const absolute = path.resolve(storageRoot(), normalized);
  if (!absolute.startsWith(`${storageRoot()}${path.sep}`) && absolute !== storageRoot()) {
    throw new Error("INVALID_STORAGE_PATH");
  }
  return absolute;
}

function checksum(data: Buffer) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export type ScanResult = { clean: boolean; engine: string; scannedAt: string };

// Central scan hook used by generated files and user uploads. No antivirus engine is
// configured: this placeholder does not inspect file content. Upload surfaces must not
// represent its result as a real malware scan. Replace it with an actual engine integration.
export async function scanFileForThreats(_data: Buffer, _filename?: string | null): Promise<ScanResult> {
  return { clean: true, engine: "none-configured", scannedAt: new Date().toISOString() };
}

export async function writePrivateFile(
  relativePath: string,
  data: Buffer,
  options: { bucket?: string; contentType?: string | null } = {},
): Promise<PrivateFileWrite> {
  const driver = getFileStorageDriver();
  if (driver === "s3") {
    throw new Error("S3_STORAGE_DRIVER_NOT_CONFIGURED");
  }

  const scan = await scanFileForThreats(data, relativePath);
  if (!scan.clean) throw new Error("FILE_FAILED_VIRUS_SCAN");

  const storageKey = normalizeStorageKey(relativePath);
  const absolute = resolveLocalStoragePath(storageKey);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, data);
  return {
    storageKey,
    bucket: options.bucket || "private",
    driver,
    byteSize: data.length,
    checksum: checksum(data),
    contentType: options.contentType ?? null,
  };
}

// Stream large private files to a temporary file in the same directory, then rename it
// atomically. This avoids holding long call recordings in the web process's memory.
export async function writePrivateFileStream(
  relativePath: string,
  source: ReadableStream<Uint8Array>,
  options: { maxBytes: number; bucket?: string; contentType?: string | null },
): Promise<PrivateFileWrite & { prefix: Buffer }> {
  const driver = getFileStorageDriver();
  if (driver === "s3") throw new Error("S3_STORAGE_DRIVER_NOT_CONFIGURED");
  const storageKey = normalizeStorageKey(relativePath);
  const absolute = resolveLocalStoragePath(storageKey);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temp = `${absolute}.${crypto.randomUUID()}.tmp`;
  const file = await fs.open(temp, "wx", 0o600);
  const hash = crypto.createHash("sha256");
  let byteSize = 0;
  let prefix = Buffer.alloc(0);
  const reader = source.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      byteSize += chunk.length;
      if (byteSize > options.maxBytes) throw new Error("PRIVATE_FILE_TOO_LARGE");
      if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.subarray(0, 16 - prefix.length)]);
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const result = await file.write(chunk, offset, chunk.length - offset);
        if (!result.bytesWritten) throw new Error("PRIVATE_FILE_WRITE_FAILED");
        offset += result.bytesWritten;
      }
    }
    if (!byteSize) throw new Error("PRIVATE_FILE_EMPTY");
    await file.sync();
    await file.close();
    await fs.rename(temp, absolute);
    return { storageKey, bucket: options.bucket || "private", driver, byteSize, checksum: hash.digest("hex"), contentType: options.contentType ?? null, prefix };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await file.close().catch(() => undefined);
    await fs.unlink(temp).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function readPrivateFile(relativePath: string) {
  const driver = getFileStorageDriver();
  if (driver === "s3") {
    throw new Error("S3_STORAGE_DRIVER_NOT_CONFIGURED");
  }
  return fs.readFile(resolveLocalStoragePath(relativePath));
}

export async function deletePrivateFile(relativePath: string) {
  const driver = getFileStorageDriver();
  if (driver === "s3") {
    throw new Error("S3_STORAGE_DRIVER_NOT_CONFIGURED");
  }
  try {
    await fs.unlink(resolveLocalStoragePath(relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
