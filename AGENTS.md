# Architecture rules
- Keep specialty invariants in pure domain rules and enforce them in the transactional service, not only the UI, so alternate clients cannot bypass safeguards.
- Composite birth and surgery operations must use one transaction and a durable idempotency key, so retries cannot create partial or duplicate clinical records.
- A specialty episode completion is not a global discharge; require physician authorization and a separate cashier check after all active care is completed.
- Use shared per-patient and per-resource advisory locks before checking and mutating workflow state, so concurrent writes use one consistent serialization boundary.
