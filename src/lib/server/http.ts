import { NextResponse } from "next/server";

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ message }, { status: 401 });
}

export function badRequest(message = "Bad request") {
  return NextResponse.json({ message }, { status: 400 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ message }, { status: 403 });
}

function getErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    return error;
  }

  return { message: "Unknown error" };
}

export function serverError(message = "Internal server error", error?: unknown) {
  const body =
    process.env.NODE_ENV === "development" && error !== undefined
      ? { message, error: getErrorDetail(error) }
      : { message };

  return NextResponse.json(body, { status: 500 });
}
