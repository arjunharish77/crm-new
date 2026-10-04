// What may be stored as a user- or inbound-supplied attachment (round-2 plan S7). The filename is
// reduced to a safe base name before it becomes part of a storage key (a name like
// "../../other/file" could otherwise land outside the record's folder), only listed file types are
// accepted, and the stored content type comes from the extension, not the sender, so an HTML or
// SVG file can never be served back as a page.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    txt: "text/plain",
    csv: "text/csv",
    rtf: "application/rtf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    zip: "application/zip",
    eml: "message/rfc822",
    msg: "application/vnd.ms-outlook",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    mp4: "video/mp4",
};

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_TYPES);

// The last path segment only, without control characters or anything but letters, digits,
// spaces, dots, dashes and underscores; no leading dots; at most 120 characters.
export function safeFileName(name: unknown) {
    const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
    const cleaned = base
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[^\p{L}\p{N} ._-]/gu, "-")
        .replace(/\.{2,}/g, ".")
        .replace(/^[.\s-]+/, "")
        .trim();
    if (!cleaned) return "file";
    if (cleaned.length <= 120) return cleaned;
    const dot = cleaned.lastIndexOf(".");
    const extension = dot > 0 ? cleaned.slice(dot) : "";
    return cleaned.slice(0, 120 - extension.length) + extension;
}

export type AttachmentCheck =
    | { ok: true; fileName: string; contentType: string }
    | { ok: false; reason: "EMPTY" | "TOO_LARGE" | "TYPE_NOT_ALLOWED"; fileName: string };

export function checkAttachment(name: unknown, byteLength: number): AttachmentCheck {
    const fileName = safeFileName(name);
    if (!byteLength) return { ok: false, reason: "EMPTY", fileName };
    if (byteLength > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "TOO_LARGE", fileName };
    const dot = fileName.lastIndexOf(".");
    const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
    const contentType = ALLOWED_TYPES[extension];
    if (!contentType) return { ok: false, reason: "TYPE_NOT_ALLOWED", fileName };
    return { ok: true, fileName, contentType };
}

// Size of a base64 payload once decoded, without decoding it.
export function base64DecodedLength(base64: string) {
    const trimmed = base64.replace(/\s/g, "");
    const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}
