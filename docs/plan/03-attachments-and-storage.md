# PART 03 — Attachments & File Storage (platform — unblocks 6 modules)

**Goal:** a single upload/storage pipeline reused everywhere the SRS expects files. Today there
is **no `FileField`/upload endpoint anywhere** — attachments are placeholder JSON URL lists.
**Depends on:** Parts 01–02.
**SRS refs:** FR-JOB-1, FR-SVC-1, FR-TASK-3, FR-CHAT-4, FR-TKT-1, FR-PROF-6. **Reference:** GAP §2.1, Phase 10.
**Flags:** `uploads.max_file_mb` (exists), add `uploads.allowed_mime` , `uploads.enabled`.
**Effort:** L

## Steps
1. [ ] Add `django-storages[boto3]` + an S3-compatible bucket (MinIO for dev via compose; S3 in prod). Wire `DEFAULT_FILE_STORAGE` per environment; keep local FS for tests.
2. [ ] New app `apps/attachments/`: `Attachment` model — `owner (FK user)`, `file`, `original_name`, `content_type`, `size`, `kind` (image/video/doc/archive/audio), generic relation OR explicit nullable FKs to the host rows, `created_at`. Soft-delete aware.
3. [ ] Upload endpoint: `POST /uploads` (multipart **or** presigned-PUT issue + `POST /uploads/complete`). Validate MIME + size against settings; reject with Arabic `{code:"file_too_large"|"file_type_blocked", message_ar}`. Scope every download/read to owner or a party of the host entity.
4. [ ] Replace the placeholder JSON URL lists with real attachment references on: **jobs** (FR-JOB-1), **proposals** (FR-JOB-5), **services + service images** (FR-SVC-1), **submissions** (FR-TASK-3), **chat messages** (FR-CHAT-4: image/video/PDF/Word/Excel/RAR-ZIP + recorded audio), **tickets** (FR-TKT-1).
5. [ ] Serializers expose attachment metadata (name, size, type, url) and accept attachment IDs on create. Enforce per-context limits (e.g. max N files, allowed kinds).
6. [ ] Frontend: a reusable `<FileUpload>` component (drag/drop, progress, type/size pre-check, RTL) wired into the job/proposal/service/submission/ticket/chat composers. (Chat audio recording can land in Part 09.)
7. [ ] OpenAPI: document multipart/presigned contract; regenerate.

## Tests to add
- `tests/integration/test_uploads_api.py` — ✅ upload→attach→download round-trip; ⛔ over-size + blocked-MIME rejected with Arabic error; 🔐 non-owner/non-party download → 403/404; 🪐 orphan cleanup; flag OFF disables uploads.
- Extend each host suite (`test_jobs_api`, `test_gigs_api`, `test_contracts_api`, `test_chat_api`, `test_tickets_api`) with an attachment-attach case.
- Frontend `components/__tests__/FileUpload.test.tsx` — type/size guard, progress, error envelope, RTL copy.

## Exit criteria
- [ ] Upload→attach→download works for all six host types; type/size enforced server-side with Arabic errors; downloads scoped to authorized users.
- [ ] No remaining placeholder JSON URL attachment fields; OpenAPI updated.
- [ ] New tests green; coverage gate holds.
