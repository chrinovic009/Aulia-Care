# Architecture rules
- Keep specialty invariants in pure domain rules and enforce them in the transactional service, not only the UI, so alternate clients cannot bypass safeguards.
- Composite birth and surgery operations must use one transaction and a durable idempotency key, so retries cannot create partial or duplicate clinical records.
- A specialty episode completion is not a global discharge; require physician authorization and a separate cashier check after all active care is completed.
- Use shared per-patient and per-resource advisory locks before checking and mutating workflow state, so concurrent writes use one consistent serialization boundary.
- Keep reusable consultation display controls in their own module without moving clinical state or persistence, so presentation refactors preserve workflow behavior.
- Keep on-premise operations checks outside the web app and accept only disposable local targets for load tests, so production patient records are never load-test fixtures.
- Delete plaintext backup staging on both success and failure and verify encrypted checksums before restore, so backup artifacts do not silently expose records.

- Consultation signatures use only the structured attested path; check all persisted exam occurrences under the patient workflow lock, so generic updates and empty browser lists cannot bypass sign-off.
- Serialize prescription safety and allergy writes with the patient workflow lock; re-read encounter state inside order transactions and use version/status predicates for archival, so signed records and concurrent treatment checks remain protected.
- Specialist JSON is validated server-side against the physician template; enforce structural and explicitly labelled numeric constraints without inventing clinical mandatory assessment policies.
- Save recovery copies only for open consultation editors and restore the canonical persisted complaint, so page visibility changes cannot replace a closed editor with empty state.

- Medical director authority is an active separate UserRole grant, rechecked server-side; keep the clinical primary profession unchanged so administrative privileges do not impersonate clinicians.
- Referral requests are separate clinic-scoped records linking author and recipient encounters; never rewrite the source signed note, and complete an opinion only after the recipient signs their own encounter.
- Signatures fail closed without an explicitly director-approved specialty policy; apply its required fields to the submitted clinical content and audit every policy revision without pretending synthetic tests are medical approval.

- Core owns tenant identity, request context, time and global journey projection; keep specialty/staffing decisions in their domain modules, so infrastructure does not pretend to authorize clinical care.
- Classify every RoleSlug exhaustively; additional grants never become primary staff professions, so new privileges cannot silently expand account creation.
- Use requireTransition for mandatory state changes and projectStatus only for best-effort queues; publish persisted status, so valid inpatient payments are not confused with clinical progress.
- Prisma's transaction adapter is pinned to 5.22.0 and guards transaction descriptors; require model/raw, batch/interactive, rollback and RLS regressions before upgrading, so extensions cannot detach operations from their transaction.
- Request workflow updates require the Core marker under the patient lock; exempt only server-owned initialization and explicit maintenance, so accidental direct writes fail in PostgreSQL.
