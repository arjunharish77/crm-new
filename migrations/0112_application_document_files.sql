alter table "ApplicationDocument"
  add column "fileObjectId" text references "FileObject"(id),
  add column "uploadedById" text references "User"(id),
  add column "uploadRequestKey" text,
  add column "reviewVersion" integer not null default 0;
create unique index "ApplicationDocument_upload_request_key" on "ApplicationDocument" ("tenantId","applicationId","uploadedById","uploadRequestKey") where "uploadRequestKey" is not null;
