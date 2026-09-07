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

// Virus-scan hook (gap checklist: "virus-scan hook placeholder"). Genuinely a placeholder --
// there is no antivirus engine wired up (confirmed by audit: every file this app ever writes
// is app-generated -- CSV exports, PDF invoices, GDPR JSON dumps, rendered report CSVs -- there
// is no end-user file-upload surface anywhere in this codebase for a malicious upload to even
// reach today). Wired into writePrivateFile itself, the one choke point every file write
// already goes through, specifically so a future upload feature gets real scanning for free by
// routing through this function rather than needing its own integration. Always reports clean
// today; swap the body for a real engine call (ClamAV daemon, a cloud AV API) without touching
// any of this function's callers.
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
