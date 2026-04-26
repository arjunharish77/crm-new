export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? "";
  const script = `
(function(){
  var tenantId = ${JSON.stringify(tenantId)};
  if(!tenantId) return;
  var params = new URLSearchParams(window.location.search);
  var payload = {
    tenantId: tenantId,
    leadId: params.get("leadId"),
    email: params.get("email"),
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign")
  };
  if(!payload.leadId && !payload.email) return;
  fetch(${JSON.stringify(origin + "/api/tracking/page-visit")}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(function(){});
})();`;

  return new Response(script, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
