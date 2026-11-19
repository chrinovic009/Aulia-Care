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
