const path = require("path");
const { Client } = require("pg");
const { pbkdf2Sync, randomBytes, createHash } = require("crypto");
const dotenv = require("dotenv");

// Resolved relative to this file, not the caller's cwd -- see create-admin.js for why.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const connectionString =
  process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || "dev-secret-change-me";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2$210000$${salt}$${hash}`;
}

function hashOtp(otp) {
  return createHash("sha256").update(`${otp}:${secret}`).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0];
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const email = `smoke-admin-${Date.now()}@unnatividya.test`;
  const password = "SmokeTestPassword123!";
  let userId;

  try {
    const created = await client.query(
      `insert into cms_user (name, email, password_hash, role, two_factor_enabled)
       values ('Smoke Admin', $1, $2, 'ADMIN', true)
       returning id`,
      [email, hashPassword(password)],
    );
    userId = created.rows[0].id;

    // Wrong password must be rejected.
    const badLogin = await fetch(`${BASE_URL}/api/admin/login/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    assert(badLogin.status === 401, `Wrong password should be rejected, got ${badLogin.status}`);

    // Correct password must require OTP (two_factor_enabled defaults to true).
    const login = await fetch(`${BASE_URL}/api/admin/login/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert(login.status === 200, `Correct password should be accepted, got ${login.status}`);
    const loginBody = await login.json();
    assert(loginBody.requiresOtp === true, "Login should require OTP for a two_factor_enabled admin");

    const otpRow = await client.query(
      `select id from otp_request
       where cms_user_id = $1 and purpose = 'ADMIN_2FA' and verified_at is null
       order by created_at desc limit 1`,
      [userId],
    );
    assert(otpRow.rows.length === 1, "Login request should create a pending OTP row");
    const otpRequestId = otpRow.rows[0].id;

    // Overwrite the hash to a known value -- this stands in for "reading the email,"
    // since ZeptoMail isn't configured with a real key in this environment. Everything
    // downstream still exercises the real /verify route, not a reimplementation of it.
    const knownOtp = "1234";
    await client.query("update otp_request set otp_hash = $1 where id = $2", [hashOtp(knownOtp), otpRequestId]);

    // Wrong OTP must be rejected and must increment attempts.
    const badOtp = await fetch(`${BASE_URL}/api/admin/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: "0000" }),
    });
    assert(badOtp.status === 400, `Wrong OTP should be rejected, got ${badOtp.status}`);
    const attemptsRow = await client.query("select attempts from otp_request where id = $1", [otpRequestId]);
    assert(attemptsRow.rows[0].attempts === 1, "Wrong OTP attempt should increment attempts");

    // Correct OTP must succeed and set a session cookie.
    const verify = await fetch(`${BASE_URL}/api/admin/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: knownOtp }),
    });
    assert(verify.status === 200, `Correct OTP should be accepted, got ${verify.status}`);
    const sessionCookie = cookieFrom(verify);
    assert(Boolean(sessionCookie), "Verify should set a uv_admin_session cookie");
    assert(sessionCookie.startsWith("uv_admin_session="), "Cookie should be the admin session cookie");

    // The session cookie must actually grant access to a gated /admin page.
    const authed = await fetch(`${BASE_URL}/admin`, {
      headers: { Cookie: sessionCookie },
      redirect: "manual",
    });
    assert(authed.status === 200, `Authenticated /admin request should succeed, got ${authed.status}`);

    // Without the cookie, /admin must redirect to /admin/login (the gate is real).
    const anon = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
    assert(anon.status >= 300 && anon.status < 400, `Anonymous /admin request should redirect, got ${anon.status}`);
    assert((anon.headers.get("location") || "").includes("/admin/login"), "Anonymous /admin should redirect to /admin/login");

    console.log(`Admin login smoke passed (password check, OTP request+verify, session gate) for ${email}.`);
  } finally {
    if (userId) {
      await client.query("delete from cms_audit_log where user_id = $1", [userId]);
      await client.query("delete from cms_user where id = $1", [userId]);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
