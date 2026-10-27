-- Voice bot plan wave D (2026-10-27): each bot's knowledge (decision 5). A source is a written
-- Q&A, an uploaded document, a web page or a set of catalogue programs; its text is split into
-- passages, each with a vector (multilingual-e5-small, 384 numbers) made by the bot service.
-- A bot's knowledge is small, so the bot service searches it in memory: no pgvector needed.

create table if not exists "VoiceBotKnowledgeSource" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "botId" text not null references "VoiceBot"("id") on delete cascade,
  "kind" text not null check ("kind" in ('QA', 'DOCUMENT', 'WEBSITE', 'CATALOG')),
  "title" text not null,
  "status" text not null default 'PROCESSING' check ("status" in ('PROCESSING', 'READY', 'FAILED')),
  "error" text,
  -- Q&A
  "question" text,
  "answer" text,
  -- Web page
  "url" text,
  -- Document (the file is kept in private storage)
  "fileKey" text,
  "fileName" text,
  "fileType" text,
  "fileSize" integer,
  -- Catalogue programs, kept in step with the catalogue
  "programIds" jsonb not null default '[]'::jsonb,
  -- Website and document text tidied into facts by Claude (decision 30)
  "tidyWithClaude" boolean not null default false,
  -- The text the passages come from, after reading (and tidying)
  "content" text,
  "contentHash" text,
  "chunkCount" integer not null default 0,
  "refreshedAt" timestamptz,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "VoiceBotKnowledgeSource_bot" on "VoiceBotKnowledgeSource" ("tenantId", "botId", "createdAt");

create table if not exists "VoiceBotKnowledgeChunk" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "botId" text not null references "VoiceBot"("id") on delete cascade,
  "sourceId" text not null references "VoiceBotKnowledgeSource"("id") on delete cascade,
  "position" integer not null,
  "text" text not null,
  "language" text,
  "embedding" real[] not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists "VoiceBotKnowledgeChunk_bot" on "VoiceBotKnowledgeChunk" ("tenantId", "botId");
create index if not exists "VoiceBotKnowledgeChunk_source" on "VoiceBotKnowledgeChunk" ("sourceId", "position");

alter table "VoiceBotKnowledgeSource" enable row level security;
alter table "VoiceBotKnowledgeChunk" enable row level security;
drop policy if exists tenant_scope on "VoiceBotKnowledgeSource";
create policy tenant_scope on "VoiceBotKnowledgeSource" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceBotKnowledgeChunk";
create policy tenant_scope on "VoiceBotKnowledgeChunk" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
