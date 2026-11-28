/**
 * Test double for the PostgreSQL transaction probe of PatientWorkflowService:
 * remembers the transaction-local marker set by $executeRaw and returns it from
 * $queryRaw, as an open transaction would. Pass `inTransaction: false` to
 * simulate a non-transactional client. Also provides an inert pathway journal.
 */
export function fakeTransaction(options: { inTransaction?: boolean; events?: unknown[] } = {}) {
  let marker: unknown = null;
  return {
    $executeRaw: async (query?: { values?: unknown[]; strings?: readonly string[] }) => {
      if (query?.strings?.join('').includes('workflow_tx_probe')) marker = query.values?.[0];
      return 0;
    },
    $queryRaw: async () => [{ probe: options.inTransaction === false ? null : marker }],
    careEvent: { create: async (args: unknown) => { options.events?.push(args); return {}; } },
  };
}
