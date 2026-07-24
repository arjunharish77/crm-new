import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let storageRoot = "";

describe("private file storage", () => {
  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "crm-storage-"));
    process.env.FILE_STORAGE_ROOT = storageRoot;
    process.env.FILE_STORAGE_DRIVER = "local";
  });

  afterEach(async () => {
    delete process.env.FILE_STORAGE_ROOT;
    delete process.env.FILE_STORAGE_DRIVER;
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  it("writes files under the configured local storage root with metadata", async () => {
    const { writePrivateFile, resolveLocalStoragePath } = await import("@/lib/storage/file-storage");
    const result = await writePrivateFile("partner-invoices/tenant-1/invoice-1.pdf", Buffer.from("pdf-data"), {
      bucket: "partner-invoices",
      contentType: "application/pdf",
    });

    expect(result).toMatchObject({
      bucket: "partner-invoices",
      driver: "local",
      storageKey: "partner-invoices/tenant-1/invoice-1.pdf",
      byteSize: 8,
      contentType: "application/pdf",
    });
    expect(result.checksum).toHaveLength(64);
    await expect(readFile(resolveLocalStoragePath(result.storageKey), "utf8")).resolves.toBe("pdf-data");
  });

  it("rejects path traversal", async () => {
    const { writePrivateFile } = await import("@/lib/storage/file-storage");
    await expect(writePrivateFile("../outside.pdf", Buffer.from("x"))).rejects.toThrow("INVALID_STORAGE_PATH");
  });

  it("fails explicitly when S3 driver is selected without an implementation", async () => {
    process.env.FILE_STORAGE_DRIVER = "s3";
    const { writePrivateFile } = await import("@/lib/storage/file-storage");
    await expect(writePrivateFile("invoice.pdf", Buffer.from("x"))).rejects.toThrow("S3_STORAGE_DRIVER_NOT_CONFIGURED");
  });
});
