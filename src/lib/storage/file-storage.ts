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
