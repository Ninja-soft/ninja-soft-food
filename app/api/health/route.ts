import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ninja-food",
    env: process.env.APP_ENV ?? "unknown",
  });
}
