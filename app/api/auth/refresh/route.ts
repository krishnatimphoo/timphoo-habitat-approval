import { NextRequest } from "next/server";
import { proxyJsonRequest } from "@/lib/network/server-proxy";

export async function POST(request: NextRequest) {
  return proxyJsonRequest(request, {
    path: "/api/auth/refresh",
    forwardAuthorization: true,
    forwardHeaders: ["x-refresh-token", "x-device-id"]
  });
}

export async function GET(request: NextRequest) {
  return proxyJsonRequest(request, {
    path: "/api/auth/refresh",
    forwardAuthorization: true,
    forwardHeaders: ["x-refresh-token", "x-device-id"]
  });
}
