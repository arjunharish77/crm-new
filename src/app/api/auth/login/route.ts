import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getActivePlatformAdminByUserId, getLoginUserByEmail } from "@/lib/repositories/auth-admin-postgres";
import { signAuthToken } from "@/lib/server/auth";
import { badRequest, tooManyRequests, unauthorized } from "@/lib/server/http";
import { checkRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";

function shouldExposeAuthDebug() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";
}

function authDebugResponse(details: Record<string, unknown>) {
  return NextResponse.json(
    {
      message: "Invalid credentials",
      debug: details,
    },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return badRequest("Email and password are required");
  }

  const ip = clientIpFromRequest(request);
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit({ key: `login:ip:${ip}`, limit: 20, windowSeconds: 15 * 60 }),
    checkRateLimit({ key: `login:email:${email}`, limit: 5, windowSeconds: 15 * 60 }),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.resetSeconds, emailLimit.resetSeconds);
    return tooManyRequests("Too many login attempts. Please try again later.", retryAfter);
  }

  const user = await getLoginUserByEmail(email);

  if (!user) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "user_lookup",
      error: null,
      foundUser: !!user,
      email,
    });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "user_lookup",
        error: null,
        foundUser: !!user,
        email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  if (!user.password) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "missing_password",
      userId: user.id,
      email: user.email,
    });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "missing_password",
        userId: user.id,
        email: user.email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "password_compare",
      userId: user.id,
      email: user.email,
    });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "password_compare",
        userId: user.id,
        email: user.email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  const platformAdmin = await getActivePlatformAdminByUserId(user.id);

  const accessToken = await signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    roleId: user.roleId,
    isPlatformAdmin: !!platformAdmin,
    platformAdminId: platformAdmin?.id ?? null,
  });

  const response = NextResponse.json({
    access_token: accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: !!platformAdmin,
      platformAdminId: platformAdmin?.id ?? null,
    },
  });

  response.cookies.set("token", accessToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
