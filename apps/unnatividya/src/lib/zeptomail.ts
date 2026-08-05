type SendOtpEmailInput = {
  toEmail: string;
  toName: string;
  otp: string;
  purpose: "lead" | "admin";
};

export async function sendOtpEmail(input: SendOtpEmailInput) {
  const apiUrl = process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email";
  const apiKey = process.env.ZEPTOMAIL_API_KEY;
  const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL || "info@unnatividya.com";
  const fromName = process.env.ZEPTOMAIL_FROM_NAME || "Unnati Vidya";

  if (!apiKey) {
    return { ok: false, status: 0, body: { message: "ZeptoMail API key is not configured" } };
  }

  const subject =
    input.purpose === "admin"
      ? "Your Unnati Vidya admin login code"
      : "Your Unnati Vidya verification code";
  const htmlbody = `<div style="font-family:Arial,sans-serif;color:#363634">
    <p>Your OTP is <b style="font-size:22px">${input.otp}</b>.</p>
    <p>This code is valid for 10 minutes.</p>
  </div>`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      from: {
        address: fromEmail,
        name: fromName,
      },
      to: [
        {
          email_address: {
            address: input.toEmail,
            name: input.toName || "Learner",
          },
        },
      ],
      subject,
      htmlbody,
    }),
  });

  let body: unknown = {};
  try {
    body = await response.json();
  } catch {
    body = { message: await response.text() };
  }

  return { ok: response.ok, status: response.status, body };
}
