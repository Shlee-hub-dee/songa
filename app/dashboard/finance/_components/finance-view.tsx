'use client';

import { useState } from 'react';
import { ReimbursementQueue, type OfficerGroup } from './reimbursement-queue';
import { OfficerStatementPanel } from './officer-statement-panel';

// Thin client wrapper that owns the "which officer's statement is open"
// state and threads it from the reimbursement queue (officer name clicks)
// to the statement side panel.
export function FinanceView({ groups }: { groups: OfficerGroup[] }) {
  const [statementOfficerId, setStatementOfficerId] = useState<string | null>(null);

  return (
    <>
      <ReimbursementQueue groups={groups} onViewStatement={setStatementOfficerId} />
      <OfficerStatementPanel
        officerId={statementOfficerId}
        onClose={() => setStatementOfficerId(null)}
      />
    </>
  );
}
