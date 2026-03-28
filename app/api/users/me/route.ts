import { NextRequest } from "next/server";
import { proxyJsonRequest } from "@/lib/network/server-proxy";

export async function GET(request: NextRequest) {
  return proxyJsonRequest(request, {
    path: "/api/users/me",
    forwardAuthorization: true
  });
}
