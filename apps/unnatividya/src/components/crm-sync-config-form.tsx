"use client";

import { useState } from "react";

type Config = {
  isEnabled: boolean;
  autoPushEnabled: boolean;
  manualPushEnabled: boolean;
  apiBaseUrl: string;
  endpointPath: string;
  httpMethod: "POST" | "PUT" | "PATCH";
  authType: "NONE" | "API_KEY" | "BEARER";
  headersTemplate: Record<string, string>;
  successStatusCodes: number[];
  timeoutMs: number;
  pushOnlyAfterEmailOtp: boolean;
  pushOnlyAfterConsent: boolean;
};

export function CrmSyncConfigForm({ initialConfig }: { initialConfig: Config }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [headersText, setHeadersText] = useState(JSON.stringify(initialConfig.headersTemplate || {}, null, 2));

  async function save(formData: FormData) {
    setStatus("saving");
    setMessage("");

    let headersTemplate: Record<string, string>;
    try {
      headersTemplate = JSON.parse(headersText || "{}") as Record<string, string>;
    } catch {
      setStatus("error");
      setMessage("Headers must be valid JSON.");
      return;
    }

    const payload = {
      isEnabled: formData.get("isEnabled") === "on",
      autoPushEnabled: formData.get("autoPushEnabled") === "on",
      manualPushEnabled: formData.get("manualPushEnabled") === "on",
      apiBaseUrl: String(formData.get("apiBaseUrl") || ""),
      endpointPath: String(formData.get("endpointPath") || ""),
      httpMethod: String(formData.get("httpMethod") || "POST"),
      authType: String(formData.get("authType") || "NONE"),
      headersTemplate,
      successStatusCodes: String(formData.get("successStatusCodes") || "200,201")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter(Boolean),
      timeoutMs: Number(formData.get("timeoutMs") || 15000),
      pushOnlyAfterEmailOtp: formData.get("pushOnlyAfterEmailOtp") === "on",
      pushOnlyAfterConsent: formData.get("pushOnlyAfterConsent") === "on",
    };

    const response = await fetch("/api/admin/crm-sync/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus("error");
      setMessage(error?.error || "Could not save settings.");
      return;
    }

    setStatus("saved");
    setMessage("CRM sync settings saved.");
  }

  return (
    <form action={save} className="admin-form-grid">
      <label className="admin-check">
        <input name="isEnabled" type="checkbox" defaultChecked={initialConfig.isEnabled} />
        Enable external API sync
      </label>
      <label className="admin-check">
        <input name="manualPushEnabled" type="checkbox" defaultChecked={initialConfig.manualPushEnabled} />
        Allow manual lead push
      </label>
      <label className="admin-check">
        <input name="autoPushEnabled" type="checkbox" defaultChecked={initialConfig.autoPushEnabled} />
        Auto-push verified leads
      </label>
      <label className="admin-check">
        <input name="pushOnlyAfterEmailOtp" type="checkbox" defaultChecked={initialConfig.pushOnlyAfterEmailOtp} />
        Push only after email OTP
      </label>
      <label className="admin-check">
        <input name="pushOnlyAfterConsent" type="checkbox" defaultChecked={initialConfig.pushOnlyAfterConsent} />
        Push only after consent
      </label>

      <div className="field">
        <label htmlFor="apiBaseUrl">API base URL</label>
        <input id="apiBaseUrl" name="apiBaseUrl" defaultValue={initialConfig.apiBaseUrl} placeholder="https://api.example.com" />
      </div>
      <div className="field">
        <label htmlFor="endpointPath">Endpoint path</label>
        <input id="endpointPath" name="endpointPath" defaultValue={initialConfig.endpointPath} placeholder="/leads" />
      </div>
      <div className="field">
        <label htmlFor="httpMethod">HTTP method</label>
        <select id="httpMethod" name="httpMethod" defaultValue={initialConfig.httpMethod}>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="authType">Auth type</label>
        <select id="authType" name="authType" defaultValue={initialConfig.authType}>
          <option value="NONE">None</option>
          <option value="API_KEY">API key header</option>
          <option value="BEARER">Bearer token</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="successStatusCodes">Success HTTP codes</label>
        <input id="successStatusCodes" name="successStatusCodes" defaultValue={initialConfig.successStatusCodes.join(",")} />
      </div>
      <div className="field">
        <label htmlFor="timeoutMs">Timeout ms</label>
        <input id="timeoutMs" name="timeoutMs" type="number" defaultValue={initialConfig.timeoutMs} />
      </div>
      <div className="field admin-span-2">
        <label htmlFor="headersTemplate">Headers JSON</label>
        <textarea id="headersTemplate" value={headersText} onChange={(event) => setHeadersText(event.target.value)} rows={5} />
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save sync settings"}
      </button>
      {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
    </form>
  );
}
