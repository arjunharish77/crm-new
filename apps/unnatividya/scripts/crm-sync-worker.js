const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

const enabled = process.env.UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED === "true";
const repeatMs = Math.max(Number(process.env.UNNATIVIDYA_CRM_SYNC_INTERVAL_MS || 60000), 5000);
const batchSize = Math.min(Math.max(Number(process.env.UNNATIVIDYA_CRM_SYNC_BATCH_SIZE || 25), 1), 250);
const connectionString =
  process.env.UNNATIVIDYA_DATABASE_URL ||
  "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";

function renderTemplate(value, tokens) {
  if (typeof value === "string") {
    return Object.entries(tokens).reduce((output, [token, replacement]) => output.split(token).join(String(replacement || "")), value);
  }
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, tokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, tokens)]));
  }
  return value;
}

async function getConfig(client) {
  const result = await client.query(
    `select *
     from crm_sync_config
     order by created_at
     limit 1`,
  );
  return result.rows[0];
}

async function getLeadContext(client, leadId) {
  const result = await client.query(
    `select l.id, l.name, l.email, l.phone, l.city, l.source_path, l.source_page_type,
            l.utm_source, l.utm_medium, l.utm_campaign, l.utm_term, l.utm_content,
            l.email_otp_verified, l.phone_otp_verified, l.consent_accepted,
            c.id as course_id, c.name as course_name, c.short_name as course_short_name,
            c.level as course_level, c.stream as course_stream, c.fee_inr as course_fee_inr,
            u.id as university_id, u.name as university_name, u.short_name as university_short_name
     from lead_capture l
     left join course c on c.id = l.course_id
     left join university u on u.id = coalesce(l.university_id, c.university_id)
     where l.id = $1
     limit 1`,
    [leadId],
  );
  return result.rows[0];
}

function tokenValues(row) {
  return {
    "{{lead.id}}": row.id,
    "{{lead.name}}": row.name,
    "{{lead.email}}": row.email,
    "{{lead.phone}}": row.phone,
    "{{lead.city}}": row.city,
    "{{lead.sourcePath}}": row.source_path,
    "{{lead.sourcePageType}}": row.source_page_type,
    "{{lead.utmSource}}": row.utm_source,
    "{{lead.utmMedium}}": row.utm_medium,
    "{{lead.utmCampaign}}": row.utm_campaign,
    "{{lead.utmTerm}}": row.utm_term,
    "{{lead.utmContent}}": row.utm_content,
    "{{lead.emailVerified}}": row.email_otp_verified,
    "{{lead.phoneVerified}}": row.phone_otp_verified,
    "{{course.id}}": row.course_id,
    "{{course.name}}": row.course_name,
    "{{course.shortName}}": row.course_short_name,
    "{{course.level}}": row.course_level,
    "{{course.stream}}": row.course_stream,
    "{{course.feeInr}}": row.course_fee_inr,
    "{{university.id}}": row.university_id,
    "{{university.name}}": row.university_name,
    "{{university.shortName}}": row.university_short_name,
  };
}

async function processAttempt(client, config, attempt) {
  if (!config.is_enabled) throw new Error("CRM sync is disabled");
  if (config.push_only_after_email_otp && !attempt.email_otp_verified) throw new Error("Lead email OTP is not verified");
  if (config.push_only_after_consent && !attempt.consent_accepted) throw new Error("Lead consent is missing");
  if (!config.api_base_url || !config.endpoint_path) throw new Error("CRM endpoint is not configured");

  const mappingResult = await client.query(
    `select version, request_body_template
     from crm_sync_mapping
     where is_active = true
     order by version desc
     limit 1`,
  );
  const template = mappingResult.rows[0]?.request_body_template || {
    name: "{{lead.name}}",
    email: "{{lead.email}}",
    phone: "{{lead.phone}}",
  };
  const lead = await getLeadContext(client, attempt.lead_capture_id);
  if (!lead) throw new Error("Lead not found");

  const payload = renderTemplate(template, tokenValues(lead));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms || 15000);

  try {
    const response = await fetch(`${config.api_base_url}${config.endpoint_path}`, {
      method: config.http_method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers_template || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = await response.text();
    const ok = (config.success_status_codes || [200, 201]).includes(response.status);
    if (!ok) throw new Error(`CRM API returned ${response.status}: ${responseText.slice(0, 500)}`);
    await client.query(
      `update crm_sync_attempt
       set status = 'SUCCESS', response_status = $1, redacted_response_body = $2, completed_at = now(), attempt_count = attempt_count + 1
       where id = $3`,
      [response.status, { body: responseText.slice(0, 1000) }, attempt.id],
    );
    await client.query(
      `update lead_capture
       set crm_sync_status = 'SUCCESS', last_crm_sync_error = null, last_crm_sync_attempt_at = now(), updated_at = now()
       where id = $1`,
      [attempt.lead_capture_id],
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function processBatch() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const config = await getConfig(client);
    const attempts = await client.query(
      `select a.id, a.lead_capture_id, l.email_otp_verified, l.consent_accepted
       from crm_sync_attempt a
       join lead_capture l on l.id = a.lead_capture_id
       where a.status = 'QUEUED'
       order by a.created_at
       limit $1`,
      [batchSize],
    );

    for (const attempt of attempts.rows) {
      await client.query("update crm_sync_attempt set status = 'PROCESSING', attempt_count = attempt_count + 1 where id = $1", [attempt.id]);
      try {
        await processAttempt(client, config, attempt);
        console.log(`Processed ${attempt.id}`);
      } catch (error) {
        await client.query(
          `update crm_sync_attempt
           set status = 'FAILED', error_message = $1, completed_at = now()
           where id = $2`,
          [error.message || "CRM sync failed", attempt.id],
        );
        await client.query(
          `update lead_capture
           set crm_sync_status = 'FAILED', last_crm_sync_error = $1, last_crm_sync_attempt_at = now(), updated_at = now()
           where id = $2`,
          [error.message || "CRM sync failed", attempt.lead_capture_id],
        );
        console.error(`Failed ${attempt.id}: ${error.message || error}`);
      }
    }
    return attempts.rowCount || 0;
  } finally {
    await client.end();
  }
}

async function main() {
  if (!enabled) {
    console.log("UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED is not true. Worker exited without processing.");
    return;
  }

  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });

  console.log(`Unnati Vidya CRM sync worker started. interval=${repeatMs}ms batchSize=${batchSize}`);
  while (!stopping) {
    try {
      const processed = await processBatch();
      if (processed) console.log(`CRM sync batch complete. processed=${processed}`);
    } catch (error) {
      console.error(`CRM sync batch failed: ${error.message || error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, repeatMs));
  }
  console.log("Unnati Vidya CRM sync worker stopped.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
