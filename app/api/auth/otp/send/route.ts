import { NextRequest } from "next/server";
import { proxyJsonRequest } from "@/lib/network/server-proxy";

export async function POST(request: NextRequest) {
  return proxyJsonRequest(request, {
    path: "/api/auth/otp/send"
  });
}
