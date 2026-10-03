import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualCrmPushButton } from "@/components/manual-crm-push-button";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "CMS Lead Detail",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

type LeadDetail = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  course_id: string | null;
  course_preference: string | null;
  preferences_completed_at: string | null;
  university_id: string | null;
  source_path: string | null;
  source_page_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  compare_course_ids: string[];
  recommender_answers: Record<string, unknown>;
  consent_accepted: boolean;
  email_otp_verified: boolean;
  phone_otp_verified: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  crm_sync_status: string;
  crm_record_id: string | null;
  last_crm_sync_attempt_at: string | null;
  last_crm_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type LeadEvent = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="admin-detail-field">
      <dt>{label}</dt>
      <dd>{value || "Not provided"}</dd>
    </div>
  );
}

export default async function AdminLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const leadResult = await query<LeadDetail>(
    `select *
     from lead_capture
     where id = $1
     limit 1`,
    [id],
  );

  const lead = leadResult.rows[0];
  if (!lead) notFound();

  const events = await query<LeadEvent>(
    `select id, event_type, metadata, created_at
     from lead_event
     where lead_capture_id = $1
     order by created_at desc, id desc
     limit 50`,
    [id],
  );

  return (
    <section className="admin-shell lead-detail-page">
      <div className="container">
        <div className="admin-page-head">
          <div>
            <span className="eyebrow">CMS</span>
            <h1>{lead.name}</h1>
            <p>Enquiry details · all timestamps shown in India time</p>
          </div>
          <Link href="/admin/leads" className="btn ghost">Back to inbox</Link>
        </div>

        <div className="admin-detail-grid">
          <section className="card admin-detail-card">
            <h2>Lead profile</h2>
            <dl className="admin-detail-fields">
              <Field label="Email" value={lead.email} />
              <Field label="Phone" value={lead.phone} />
              <Field label="City" value={lead.city} />
              <Field label="Course" value={lead.course_preference || lead.course_id || "Not selected yet"} />
              <Field label="Preferences" value={lead.preferences_completed_at ? "Completed" : "Incomplete"} />
              <Field label="University" value={lead.university_id || "No university preference"} />
              <Field label="Consent" value={lead.consent_accepted ? "Accepted" : "Missing"} />
              <Field label="Created" value={formatDate(lead.created_at)} />
              <Field label="Updated" value={formatDate(lead.updated_at)} />
            </dl>
          </section>

          <section className="card admin-detail-card">
            <h2>Verification</h2>
            <dl className="admin-detail-fields">
              <Field label="Email OTP" value={<span className={lead.email_otp_verified ? "admin-status good" : "admin-status"}>{lead.email_otp_verified ? "Verified" : "Pending"}</span>} />
              <Field label="Email verified at" value={formatDate(lead.email_verified_at)} />
              <Field label="Phone OTP" value={<span className={lead.phone_otp_verified ? "admin-status good" : "admin-status"}>{lead.phone_otp_verified ? "Verified" : "Pending"}</span>} />
              <Field label="Phone verified at" value={formatDate(lead.phone_verified_at)} />
            </dl>
          </section>

          <section className="card admin-detail-card">
            <h2>Source & UTM</h2>
            <dl className="admin-detail-fields">
              <Field label="Source path" value={lead.source_path} />
              <Field label="Page type" value={lead.source_page_type} />
              <Field label="UTM source" value={lead.utm_source} />
              <Field label="UTM medium" value={lead.utm_medium} />
              <Field label="UTM campaign" value={lead.utm_campaign} />
              <Field label="UTM term" value={lead.utm_term} />
              <Field label="UTM content" value={lead.utm_content} />
            </dl>
          </section>

          <section className="card admin-detail-card">
            <h2>CRM handoff</h2>
            <dl className="admin-detail-fields">
              <Field label="Status" value={<span className="admin-status">{lead.crm_sync_status}</span>} />
              <Field label="CRM record" value={lead.crm_record_id} />
              <Field label="Last attempt" value={formatDate(lead.last_crm_sync_attempt_at)} />
              <Field label="Last error" value={lead.last_crm_sync_error} />
            </dl>
            <ManualCrmPushButton leadId={lead.id} />
          </section>
        </div>

        <div className="admin-detail-grid" style={{ marginTop: 18 }}>
          <section className="card admin-detail-card">
            <h2>Compare & recommender context</h2>
            <p>Selections captured from comparison and course-matching tools.</p>
            <details><summary>View captured selections</summary><pre className="admin-json">{JSON.stringify({
              compareCourseIds: lead.compare_course_ids,
              recommenderAnswers: lead.recommender_answers,
            }, null, 2)}</pre></details>
          </section>

          <section className="card admin-detail-card">
            <h2>Activity timeline</h2>
            <p>Latest {events.rows.length} events, newest first (up to 50).</p>
            <div className="admin-timeline">
              {events.rows.map((event) => (
                <div key={event.id}>
                  <strong>{event.event_type.replaceAll("_", " ")}</strong>
                  <span>{formatDate(event.created_at)}</span>
                  <details><summary>View event details</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details>
                </div>
              ))}
              {!events.rows.length ? <p>No lead events yet.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
