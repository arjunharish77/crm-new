"""Feature extraction covering every table connected to a Lead or Opportunity (see the
"Complete data audit" in the implementation plan). Mirrors the aggregation style already
used in src/lib/server/self-learning-scoring.ts (counts, rates, recency) but pulls from
every related table, not just Lead/Opportunity/Activity/Task, and adds mean-pooled text
embeddings for the free-text sources.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.db import query
from app.embeddings import EMBEDDING_DIM, mean_pool_by_record

# Fixed outcome enum from src/components/views/smart-view-fields.ts's activityOutcomeOptions()
# -- a closed set defined by the app itself, not a per-tenant custom field, so it's safe to
# hardcode (unlike ActivityType/custom fields, which are tenant-defined and discovered dynamically).
ACTIVITY_OUTCOMES = ["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER", "NOT_INTERESTED"]


def _group_by(rows: list[dict], key: str) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        value = row.get(key)
        if not value:
            continue
        grouped.setdefault(value, []).append(row)
    return grouped


def _days_between(value, now: datetime) -> float | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return max(0.0, (now - value).total_seconds() / 86400)


class TenantData:
    """Fetches every tenant-scoped, non-per-record reference table once (roles, teams,
    stages, custom field schema, etc.) so per-record feature building doesn't re-query them."""

    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.stages = {row["id"]: row for row in query(
            'select id, name, "isWon", "isClosed", "opportunityTypeId" from "StageDefinition" where "tenantId" = %s',
            (tenant_id,),
        )}
        self.opportunity_types = {row["id"]: row for row in query(
            'select id, name from "OpportunityType" where "tenantId" = %s', (tenant_id,),
        )}
        self.activity_types = {row["id"]: row for row in query(
            'select id, name from "ActivityType" where "tenantId" = %s', (tenant_id,),
        )}
        self.users = {row["id"]: row for row in query(
            'select id, "roleId", "managerId", "teamId", status from "User" where "tenantId" = %s', (tenant_id,),
        )}
        self.teams = {row["id"]: row for row in query(
            'select id, name, department from "Team" where "tenantId" = %s', (tenant_id,),
        )}
        team_members = query('select "teamId", "userId" from "TeamMember" where "tenantId" = %s', (tenant_id,))
        self.team_by_user: dict[str, str] = {row["userId"]: row["teamId"] for row in team_members}
        sales_group_members = query('select "groupId", "userId" from "SalesGroupMember" where "tenantId" = %s', (tenant_id,))
        self.sales_group_by_user: dict[str, str] = {row["userId"]: row["groupId"] for row in sales_group_members}
        self.sales_groups = {row["id"]: row for row in query(
            'select id, name from "SalesGroup" where "tenantId" = %s', (tenant_id,),
        )}
        self.field_definitions = query(
            'select id, "objectId", key, label, type from "FieldDefinition" '
            'where "tenantId" = %s and "isCustom" = true and "deletedAt" is null',
            (tenant_id,),
        )
        self.assignment_rules = {row["id"]: row for row in query(
            'select id, name from "AssignmentRule" where "tenantId" = %s', (tenant_id,),
        )}

    def is_won_stage(self, stage_id: str | None) -> bool:
        stage = self.stages.get(stage_id) if stage_id else None
        return bool(stage and stage.get("isWon"))

    def is_closed_stage(self, stage_id: str | None) -> bool:
        stage = self.stages.get(stage_id) if stage_id else None
        return bool(stage and stage.get("isClosed"))

    def owner_context(self, owner_id: str | None) -> dict[str, Any]:
        if not owner_id or owner_id not in self.users:
            return {"ownerRoleId": None, "ownerTeamName": None, "ownerSalesGroupName": None}
        team_id = self.team_by_user.get(owner_id)
        group_id = self.sales_group_by_user.get(owner_id)
        return {
            "ownerRoleId": self.users[owner_id].get("roleId"),
            "ownerTeamName": self.teams.get(team_id, {}).get("name") if team_id else None,
            "ownerSalesGroupName": self.sales_groups.get(group_id, {}).get("name") if group_id else None,
        }


def _fetch_by_ids(table: str, id_column: str, ids: list[str], tenant_id: str, columns: str) -> list[dict]:
    if not ids:
        return []
    return query(
        f'select {columns} from "{table}" where "tenantId" = %s and "{id_column}" = any(%s)',
        (tenant_id, ids),
    )


def _fetch_polymorphic(table: str, entity_type: str, ids: list[str], tenant_id: str, columns: str) -> list[dict]:
    if not ids:
        return []
    return query(
        f'select {columns} from "{table}" where "tenantId" = %s and "entityType" = %s and "entityId" = any(%s)',
        (tenant_id, entity_type, ids),
    )


def _fetch_record_score_history(record_type: str, ids: list[str], tenant_id: str) -> list[dict]:
    if not ids:
        return []
    return query(
        'select "recordId", "changeReason" from "RecordScoreHistory" '
        'where "tenantId" = %s and "recordType" = %s and "recordId" = any(%s)',
        (tenant_id, record_type, ids),
    )


def _custom_field_matrix(tenant_data: TenantData, object_name: str, record_ids: list[str], tenant_id: str) -> pd.DataFrame:
    """One column per tenant-defined custom field (dynamically discovered, never hardcoded),
    for the given object (lead/opportunity)."""
    fields = [f for f in tenant_data.field_definitions]
    if not fields or not record_ids:
        return pd.DataFrame({"recordId": record_ids})

    values = query(
        'select "recordId", "fieldDefinitionId", "valueString", "valueNumber", "valueBoolean", "valueDate" '
        'from "CustomFieldValue" where "tenantId" = %s and "recordId" = any(%s)',
        (tenant_id, record_ids),
    )
    by_record = _group_by(values, "recordId")
    field_by_id = {f["id"]: f for f in fields}

    rows = []
    for record_id in record_ids:
        row: dict[str, Any] = {"recordId": record_id}
        for value in by_record.get(record_id, []):
            field = field_by_id.get(value["fieldDefinitionId"])
            if not field:
                continue
            column = f"custom_{field['key']}"
            row[column] = (
                value.get("valueNumber")
                if value.get("valueNumber") is not None
                else value.get("valueBoolean")
                if value.get("valueBoolean") is not None
                else value.get("valueString")
                if value.get("valueString") is not None
                else value.get("valueDate")
            )
        rows.append(row)
    return pd.DataFrame(rows)


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "unknown"


def _activity_type_matrix(tenant_data: TenantData, activities_by_record: dict[str, list[dict]], record_ids: list[str]) -> pd.DataFrame:
    """One count column per tenant-defined ActivityType (Call/Email/Meeting/etc), dynamically
    discovered like custom fields -- so which channels a record was actually engaged through is
    a real feature, not silently dropped after being fetched for the text-embedding pass."""
    type_names = sorted({info["name"] for info in tenant_data.activity_types.values()})
    if not type_names or not record_ids:
        return pd.DataFrame({"recordId": record_ids})

    column_by_name = {name: f"activityType_{_slugify(name)}Count" for name in type_names}
    rows = []
    for record_id in record_ids:
        counts = {column: 0 for column in column_by_name.values()}
        for activity in activities_by_record.get(record_id, []):
            type_info = tenant_data.activity_types.get(activity.get("typeId"))
            if type_info:
                counts[column_by_name[type_info["name"]]] += 1
        counts["recordId"] = record_id
        rows.append(counts)
    return pd.DataFrame(rows)


def _activity_outcome_and_sla_counts(activities: list[dict]) -> dict[str, int]:
    """Turns Activity.outcome (fixed enum) and Activity.slaStatus into real counts instead of
    fetching them alongside .notes for text embedding and then silently discarding them."""
    counts = {f"outcome{o.title().replace('_', '')}Count": 0 for o in ACTIVITY_OUTCOMES}
    sla_breached = 0
    for activity in activities:
        outcome = str(activity.get("outcome") or "").upper()
        if outcome in ACTIVITY_OUTCOMES:
            counts[f"outcome{outcome.title().replace('_', '')}Count"] += 1
        if str(activity.get("slaStatus") or "").upper() == "BREACHED":
            sla_breached += 1
    counts["slaBreachedActivityCount"] = sla_breached
    return counts


def _add_embedding_columns(df: pd.DataFrame, prefix: str, embeddings_by_record: dict[str, np.ndarray]) -> pd.DataFrame:
    matrix = np.stack([embeddings_by_record.get(rid, np.zeros(EMBEDDING_DIM, dtype=np.float32)) for rid in df["recordId"]])
    embedding_df = pd.DataFrame(matrix, columns=[f"emb_{prefix}_{i}" for i in range(EMBEDDING_DIM)], index=df.index)
    return pd.concat([df, embedding_df], axis=1)


def extract_lead_features(tenant_id: str, lookback_days: int) -> pd.DataFrame:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=lookback_days)

    leads = query(
        'select id, name, email, phone, company, status, source, score, "ownerId", "createdAt", "updatedAt" '
        'from "Lead" where "tenantId" = %s and "createdAt" >= %s',
        (tenant_id, since),
    )
    if not leads:
        return pd.DataFrame()
    lead_ids = [lead["id"] for lead in leads]
    tenant_data = TenantData(tenant_id)

    opportunities = _fetch_by_ids("Opportunity", "leadId", lead_ids, tenant_id, '"leadId", id, "stageId"')
    opportunities_by_lead = _group_by(opportunities, "leadId")

    activities = _fetch_by_ids("Activity", "leadId", lead_ids, tenant_id,
                                '"leadId", "typeId", outcome, notes, "completedAt", "createdAt", "slaStatus"')
    activities_by_lead = _group_by(activities, "leadId")

    tasks = _fetch_by_ids("Task", "leadId", lead_ids, tenant_id, '"leadId", status, "dueAt", "completedAt"')
    tasks_by_lead = _group_by(tasks, "leadId")

    notes = _fetch_polymorphic("Note", "LEAD", lead_ids, tenant_id, '"entityId", content, "isPinned", "createdAt"')
    notes_by_lead = _group_by(notes, "entityId")

    email_logs = _fetch_polymorphic("EmailLog", "LEAD", lead_ids, tenant_id,
                                     '"entityId", direction, subject, body, "openedAt", "clickedAt", "createdAt"')
    emails_by_lead = _group_by(email_logs, "entityId")

    comm_outbox = _fetch_polymorphic("CommunicationOutbox", "LEAD", lead_ids, tenant_id,
                                      '"entityId", channel, status, body, "createdAt"')
    comm_by_lead = _group_by(comm_outbox, "entityId")

    delivery_events = _fetch_polymorphic("CommunicationDeliveryEvent", "LEAD", lead_ids, tenant_id,
                                          '"entityId", "eventType", "occurredAt"')
    delivery_by_lead = _group_by(delivery_events, "entityId")

    assignment_logs = _fetch_polymorphic("AssignmentLog", "LEAD", lead_ids, tenant_id,
                                          '"entityId", "ruleId", "assignedAt"')
    assignments_by_lead = _group_by(assignment_logs, "entityId")

    form_submissions = _fetch_by_ids("FormSubmission", "leadId", lead_ids, tenant_id, '"leadId", status, "createdAt"')
    forms_by_lead = _group_by(form_submissions, "leadId")

    lead_list_members = _fetch_by_ids("LeadListMember", "leadId", lead_ids, tenant_id, '"leadId"')
    lists_by_lead = _group_by(lead_list_members, "leadId")

    audit_logs = _fetch_polymorphic("AuditLog", "LEAD", lead_ids, tenant_id, '"entityId", action, "createdAt"')
    audit_by_lead = _group_by(audit_logs, "entityId")

    # Prior scoring history -- a legitimate "how much has this record's outlook changed"
    # signal (volatility/attention), not the current score itself, so it doesn't leak the
    # very thing we're predicting.
    score_history = _fetch_record_score_history("LEAD", lead_ids, tenant_id)
    score_history_by_lead = _group_by(score_history, "recordId")

    telephony = query(
        'select "leadId"::text as "leadId", direction, duration, status from "TelephonyCallLog" '
        'where "tenantId" = %s and "leadId" = any(%s::uuid[])',
        (tenant_id, lead_ids),
    ) if lead_ids else []
    telephony_by_lead = _group_by(telephony, "leadId")

    custom_fields_df = _custom_field_matrix(tenant_data, "lead", lead_ids, tenant_id)
    activity_type_df = _activity_type_matrix(tenant_data, activities_by_lead, lead_ids)

    note_texts = {lid: [n["content"] for n in notes_by_lead.get(lid, [])] for lid in lead_ids}
    email_texts = {lid: [f"{e.get('subject') or ''} {e.get('body') or ''}" for e in emails_by_lead.get(lid, [])] for lid in lead_ids}
    activity_texts = {lid: [a["notes"] for a in activities_by_lead.get(lid, []) if a.get("notes")] for lid in lead_ids}
    comm_texts = {lid: [c["body"] for c in comm_by_lead.get(lid, []) if c.get("body")] for lid in lead_ids}

    note_embeddings = mean_pool_by_record(note_texts, lead_ids)
    email_embeddings = mean_pool_by_record(email_texts, lead_ids)
    activity_embeddings = mean_pool_by_record(activity_texts, lead_ids)
    comm_embeddings = mean_pool_by_record(comm_texts, lead_ids)

    rows = []
    for lead in leads:
        lid = lead["id"]
        lead_opportunities = opportunities_by_lead.get(lid, [])
        lead_activities = activities_by_lead.get(lid, [])
        lead_tasks = tasks_by_lead.get(lid, [])
        lead_notes = notes_by_lead.get(lid, [])
        lead_emails = emails_by_lead.get(lid, [])
        lead_comm = comm_by_lead.get(lid, [])
        lead_delivery = delivery_by_lead.get(lid, [])
        lead_assignments = assignments_by_lead.get(lid, [])
        lead_forms = forms_by_lead.get(lid, [])
        lead_lists = lists_by_lead.get(lid, [])
        lead_audit = audit_by_lead.get(lid, [])
        lead_score_history = score_history_by_lead.get(lid, [])
        lead_calls = telephony_by_lead.get(lid, [])

        completed_tasks = [t for t in lead_tasks if str(t.get("status")).upper() == "COMPLETED"]
        overdue_tasks = [t for t in lead_tasks if str(t.get("status")).upper() not in ("COMPLETED", "CANCELLED")
                          and t.get("dueAt") and t["dueAt"] < now]
        completed_activities = [a for a in lead_activities if a.get("completedAt")]
        last_activity_at = max((a["completedAt"] or a["createdAt"] for a in lead_activities), default=None)
        first_activity_at = min((a["createdAt"] for a in lead_activities), default=None)
        opened_emails = [e for e in lead_emails if e.get("openedAt")]
        answered_calls = [c for c in lead_calls if str(c.get("status", "")).lower() == "completed"]
        outcome_and_sla = _activity_outcome_and_sla_counts(lead_activities)

        owner_context = tenant_data.owner_context(lead.get("ownerId"))

        row = {
            "recordId": lid,
            "label": 1 if lead_opportunities else 0,
            # Definitional/categorical -- left as pandas "category" dtype downstream so
            # HistGradientBoostingClassifier can split on them natively.
            "source": lead.get("source") or "UNKNOWN",
            "status": lead.get("status") or "UNKNOWN",
            "ownerRoleId": owner_context["ownerRoleId"] or "UNKNOWN",
            "ownerTeamName": owner_context["ownerTeamName"] or "UNKNOWN",
            "ownerSalesGroupName": owner_context["ownerSalesGroupName"] or "UNKNOWN",
            # Base record signals.
            "hasEmail": bool(lead.get("email")),
            "hasPhone": bool(lead.get("phone")),
            "hasCompany": bool(lead.get("company")),
            "createdAgeDays": _days_between(lead["createdAt"], now),
            # Activity engagement.
            "activityCount": len(lead_activities),
            "completedActivityCount": len(completed_activities),
            "lastActivityAgeDays": _days_between(last_activity_at, now),
            "firstResponseMinutes": (
                max(0.0, (first_activity_at - lead["createdAt"]).total_seconds() / 60)
                if first_activity_at and lead.get("createdAt") else None
            ),
            **outcome_and_sla,
            # Tasks.
            "taskCount": len(lead_tasks),
            "completedTaskCount": len(completed_tasks),
            "overdueTaskCount": len(overdue_tasks),
            # Notes.
            "noteCount": len(lead_notes),
            "pinnedNoteCount": sum(1 for n in lead_notes if n.get("isPinned")),
            # Email engagement.
            "emailCount": len(lead_emails),
            "emailOpenRate": (len(opened_emails) / len(lead_emails)) if lead_emails else 0.0,
            # WhatsApp/SMS/Email outbox + delivery.
            "outboundCommCount": len(lead_comm),
            "deliveryEventCount": len(lead_delivery),
            # Telephony.
            "callCount": len(lead_calls),
            "answeredCallRate": (len(answered_calls) / len(lead_calls)) if lead_calls else 0.0,
            "avgCallDurationSeconds": (
                sum(c.get("duration") or 0 for c in lead_calls) / len(lead_calls) if lead_calls else 0.0
            ),
            # Forms/lists/provenance.
            "formSubmissionCount": len(lead_forms),
            "leadListMembershipCount": len(lead_lists),
            "wasAssignedByRule": bool(lead_assignments and lead_assignments[-1].get("ruleId")),
            "auditEventCount": len(lead_audit),
            "scoreChangeCount": len(lead_score_history),
        }
        rows.append(row)

    df = pd.DataFrame(rows)
    df = df.merge(custom_fields_df, on="recordId", how="left")
    df = df.merge(activity_type_df, on="recordId", how="left")
    df = _add_embedding_columns(df, "note", note_embeddings)
    df = _add_embedding_columns(df, "email", email_embeddings)
    df = _add_embedding_columns(df, "activity", activity_embeddings)
    df = _add_embedding_columns(df, "comm", comm_embeddings)
    return df


def extract_opportunity_features(tenant_id: str, lookback_days: int) -> pd.DataFrame:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=lookback_days)

    opportunities = query(
        'select id, "leadId", "stageId", "opportunityTypeId", title, amount, priority, "ownerId", "createdAt", "updatedAt" '
        'from "Opportunity" where "tenantId" = %s and "createdAt" >= %s',
        (tenant_id, since),
    )
    if not opportunities:
        return pd.DataFrame()
    opp_ids = [opp["id"] for opp in opportunities]
    tenant_data = TenantData(tenant_id)

    activities = _fetch_by_ids("Activity", "opportunityId", opp_ids, tenant_id,
                                '"opportunityId", "typeId", outcome, notes, "completedAt", "createdAt", "slaStatus"')
    activities_by_opp = _group_by(activities, "opportunityId")

    tasks = _fetch_by_ids("Task", "opportunityId", opp_ids, tenant_id, '"opportunityId", status, "dueAt"')
    tasks_by_opp = _group_by(tasks, "opportunityId")

    stage_history = _fetch_by_ids("OpportunityStageHistory", "opportunityId", opp_ids, tenant_id,
                                   '"opportunityId", "fromStageId", "toStageId", "changedAt"')
    history_by_opp = _group_by(stage_history, "opportunityId")

    commission_ledger = _fetch_by_ids("CommissionLedger", "opportunityId", opp_ids, tenant_id,
                                       '"opportunityId", "entryType", "commissionAmount"')
    commission_by_opp = _group_by(commission_ledger, "opportunityId")

    notes = _fetch_polymorphic("Note", "OPPORTUNITY", opp_ids, tenant_id, '"entityId", content, "isPinned"')
    notes_by_opp = _group_by(notes, "entityId")

    email_logs = _fetch_polymorphic("EmailLog", "OPPORTUNITY", opp_ids, tenant_id,
                                     '"entityId", subject, body, "openedAt"')
    emails_by_opp = _group_by(email_logs, "entityId")

    comm_outbox = _fetch_polymorphic("CommunicationOutbox", "OPPORTUNITY", opp_ids, tenant_id, '"entityId", body')
    comm_by_opp = _group_by(comm_outbox, "entityId")

    delivery_events = _fetch_polymorphic("CommunicationDeliveryEvent", "OPPORTUNITY", opp_ids, tenant_id,
                                          '"entityId", "eventType"')
    delivery_by_opp = _group_by(delivery_events, "entityId")

    assignment_logs = _fetch_polymorphic("AssignmentLog", "OPPORTUNITY", opp_ids, tenant_id, '"entityId", "ruleId"')
    assignments_by_opp = _group_by(assignment_logs, "entityId")

    audit_logs = _fetch_polymorphic("AuditLog", "OPPORTUNITY", opp_ids, tenant_id, '"entityId", action')
    audit_by_opp = _group_by(audit_logs, "entityId")

    score_history = _fetch_record_score_history("OPPORTUNITY", opp_ids, tenant_id)
    score_history_by_opp = _group_by(score_history, "recordId")

    telephony = query(
        'select "opportunityId"::text as "opportunityId", status, duration from "TelephonyCallLog" '
        'where "tenantId" = %s and "opportunityId" = any(%s::uuid[])',
        (tenant_id, opp_ids),
    ) if opp_ids else []
    telephony_by_opp = _group_by(telephony, "opportunityId")

    custom_fields_df = _custom_field_matrix(tenant_data, "opportunity", opp_ids, tenant_id)
    activity_type_df = _activity_type_matrix(tenant_data, activities_by_opp, opp_ids)

    note_texts = {oid: [n["content"] for n in notes_by_opp.get(oid, [])] for oid in opp_ids}
    email_texts = {oid: [f"{e.get('subject') or ''} {e.get('body') or ''}" for e in emails_by_opp.get(oid, [])] for oid in opp_ids}
    activity_texts = {oid: [a["notes"] for a in activities_by_opp.get(oid, []) if a.get("notes")] for oid in opp_ids}
    comm_texts = {oid: [c["body"] for c in comm_by_opp.get(oid, []) if c.get("body")] for oid in opp_ids}

    note_embeddings = mean_pool_by_record(note_texts, opp_ids)
    email_embeddings = mean_pool_by_record(email_texts, opp_ids)
    activity_embeddings = mean_pool_by_record(activity_texts, opp_ids)
    comm_embeddings = mean_pool_by_record(comm_texts, opp_ids)

    rows = []
    for opp in opportunities:
        oid = opp["id"]
        opp_activities = activities_by_opp.get(oid, [])
        opp_tasks = tasks_by_opp.get(oid, [])
        opp_history = history_by_opp.get(oid, [])
        opp_commission = commission_by_opp.get(oid, [])
        opp_notes = notes_by_opp.get(oid, [])
        opp_emails = emails_by_opp.get(oid, [])
        opp_comm = comm_by_opp.get(oid, [])
        opp_delivery = delivery_by_opp.get(oid, [])
        opp_assignments = assignments_by_opp.get(oid, [])
        opp_audit = audit_by_opp.get(oid, [])
        opp_score_history = score_history_by_opp.get(oid, [])
        opp_calls = telephony_by_opp.get(oid, [])

        completed_tasks = [t for t in opp_tasks if str(t.get("status")).upper() == "COMPLETED"]
        overdue_tasks = [t for t in opp_tasks if str(t.get("status")).upper() not in ("COMPLETED", "CANCELLED")
                          and t.get("dueAt") and t["dueAt"] < now]
        last_activity_at = max((a["completedAt"] or a["createdAt"] for a in opp_activities), default=None)
        opened_emails = [e for e in opp_emails if e.get("openedAt")]
        answered_calls = [c for c in opp_calls if str(c.get("status", "")).lower() == "completed"]
        outcome_and_sla = _activity_outcome_and_sla_counts(opp_activities)
        stage = tenant_data.stages.get(opp.get("stageId"), {})
        opp_type = tenant_data.opportunity_types.get(opp.get("opportunityTypeId"), {})
        owner_context = tenant_data.owner_context(opp.get("ownerId"))

        row = {
            "recordId": oid,
            "label": 1 if tenant_data.is_won_stage(opp.get("stageId")) else 0,
            "stageName": stage.get("name") or "UNKNOWN",
            "opportunityTypeName": opp_type.get("name") or "UNKNOWN",
            "priority": opp.get("priority") or "MEDIUM",
            "ownerRoleId": owner_context["ownerRoleId"] or "UNKNOWN",
            "ownerTeamName": owner_context["ownerTeamName"] or "UNKNOWN",
            "ownerSalesGroupName": owner_context["ownerSalesGroupName"] or "UNKNOWN",
            "hasAmount": bool(opp.get("amount") and float(opp["amount"]) > 0),
            "amount": float(opp["amount"]) if opp.get("amount") else 0.0,
            "createdAgeDays": _days_between(opp["createdAt"], now),
            "stageChangeCount": len(opp_history),
            "isPartnerSourced": len(opp_commission) > 0,
            "activityCount": len(opp_activities),
            "lastActivityAgeDays": _days_between(last_activity_at, now),
            **outcome_and_sla,
            "taskCount": len(opp_tasks),
            "completedTaskCount": len(completed_tasks),
            "overdueTaskCount": len(overdue_tasks),
            "noteCount": len(opp_notes),
            "pinnedNoteCount": sum(1 for n in opp_notes if n.get("isPinned")),
            "emailCount": len(opp_emails),
            "emailOpenRate": (len(opened_emails) / len(opp_emails)) if opp_emails else 0.0,
            "outboundCommCount": len(opp_comm),
            "deliveryEventCount": len(opp_delivery),
            "wasAssignedByRule": bool(opp_assignments and opp_assignments[-1].get("ruleId")),
            "auditEventCount": len(opp_audit),
            "scoreChangeCount": len(opp_score_history),
            "callCount": len(opp_calls),
            "answeredCallRate": (len(answered_calls) / len(opp_calls)) if opp_calls else 0.0,
            "avgCallDurationSeconds": (
                sum(c.get("duration") or 0 for c in opp_calls) / len(opp_calls) if opp_calls else 0.0
            ),
        }
        rows.append(row)

    df = pd.DataFrame(rows)
    df = df.merge(custom_fields_df, on="recordId", how="left")
    df = df.merge(activity_type_df, on="recordId", how="left")
    df = _add_embedding_columns(df, "note", note_embeddings)
    df = _add_embedding_columns(df, "email", email_embeddings)
    df = _add_embedding_columns(df, "activity", activity_embeddings)
    df = _add_embedding_columns(df, "comm", comm_embeddings)
    return df
