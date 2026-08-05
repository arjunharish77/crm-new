import { indexNowConfig } from "@/lib/seo-config";

export function GET() {
  const config = indexNowConfig();
  if (!config.enabled || !config.key) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(config.key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
