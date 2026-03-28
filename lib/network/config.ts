const DEFAULT_TIMPHOO_API_BASE_URL = "https://api.timphoo.com";

export function getTimphooApiBaseUrl() {
  return (
    process.env.TIMPHOO_API_BASE_URL ??
    process.env.NEXT_PUBLIC_TIMPHOO_API_BASE_URL ??
    DEFAULT_TIMPHOO_API_BASE_URL
  );
}
