import nodemailer, { type Transporter } from "nodemailer";
import { appBaseUrlString } from "@/lib/app-url";

// Account emails sent by the platform itself, not by a workspace (decision 16, 2026-10-02:
// platform SMTP). Used for password-reset links. Configured once per deployment:
//
//   SYSTEM_SMTP_HOST      smtp.example.com
//   SYSTEM_SMTP_PORT      587 (or 465 with SYSTEM_SMTP_SECURE=true)
//   SYSTEM_SMTP_SECURE    "true" for implicit TLS (port 465); otherwise STARTTLS is required
//   SYSTEM_SMTP_USER      account name
//   SYSTEM_SMTP_PASSWORD  account password
//   SYSTEM_EMAIL_FROM     "Unnatify <no-reply@example.com>"
//   APP_URL               https://crm.example.com (for links in the email)
//
// Until host and from address are set, nothing is sent and the "Forgot password?" link stays
// hidden. Credentials are never logged.

export type SystemEmail = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | null = null;
let testTransporter: Transporter | null = null;

export function isSystemEmailConfigured() {
    return !!testTransporter || !!(process.env.SYSTEM_SMTP_HOST && process.env.SYSTEM_EMAIL_FROM);
}

export function appBaseUrl() {
    return appBaseUrlString();
}

// The logo at the top of system emails (public/brand/logo-email.png, 600×148 shown at 150×37).
// Email clients don't show SVG, and they load the image from APP_URL.
export function emailLogoHtml() {
    return `<p><img src="${appBaseUrl()}/brand/logo-email.png" width="150" height="37" alt="Unnatify" style="display:block;border:0;outline:none"></p>`;
}

function getTransporter(): Transporter {
    if (testTransporter) return testTransporter;
    if (!transporter) {
        const port = Number(process.env.SYSTEM_SMTP_PORT || 587);
        const secure = process.env.SYSTEM_SMTP_SECURE === "true";
        transporter = nodemailer.createTransport({
            host: process.env.SYSTEM_SMTP_HOST,
            port,
            secure,
            // Without implicit TLS, insist on STARTTLS: a reset link must not travel in clear text.
            requireTLS: !secure,
            auth: process.env.SYSTEM_SMTP_USER ? { user: process.env.SYSTEM_SMTP_USER, pass: process.env.SYSTEM_SMTP_PASSWORD ?? "" } : undefined,
            // The message is built from our own text only; no attachments, files or URLs are read.
            disableFileAccess: true,
            disableUrlAccess: true,
        });
    }
    return transporter;
}

export async function sendSystemEmail(message: SystemEmail) {
    if (!isSystemEmailConfigured()) throw new Error("SYSTEM_EMAIL_NOT_CONFIGURED");
    await getTransporter().sendMail({
        from: testTransporter ? "Test <test@example.invalid>" : process.env.SYSTEM_EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
    });
}

// For scripts/forgot-password-smoke.ts: capture messages instead of sending them.
export function setSystemEmailTransportForTests(transport: Transporter | null) {
    testTransporter = transport;
}
