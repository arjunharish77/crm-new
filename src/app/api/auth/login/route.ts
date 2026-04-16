import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { signAuthToken } from "@/lib/server/auth";
import { badRequest, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return badRequest("Email and password are required");
  }

  const supabase = createSupabaseAdminClient();
  const { data: user, error } = await supabase
    .from("User")
    .select("id,email,name,password,tenantId,roleId")
    .eq("email", email)
    .maybeSingle();

  if (error || !user) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          message: "Invalid credentials",
          debug: {
            stage: "user_lookup",
            error: error?.message ?? null,
            foundUser: !!user,
            email,
          },
        },
        { status: 401 }
      );
    }

    return unauthorized("Invalid credentials");
  }

  if (!user.password) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          message: "Invalid credentials",
          debug: {
            stage: "missing_password",
            userId: user.id,
            email: user.email,
          },
        },
        { status: 401 }
      );
    }

    return unauthorized("Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          message: "Invalid credentials",
          debug: {
            stage: "password_compare",
            userId: user.id,
            email: user.email,
          },
        },
        { status: 401 }
      );
    }

    return unauthorized("Invalid credentials");
  }

  const { data: platformAdmin } = await supabase
    .from("PlatformAdmin")
    .select("id,isActive")
    .eq("userId", user.id)
    .eq("isActive", true)
    .maybeSingle();

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
