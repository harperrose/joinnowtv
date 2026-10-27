/** Sync logs stay limited to ids, actions, and outcomes. Profile fields are not logged. */
export function logSync(entry: { recordId?: string; action?: string; outcome: string }): void {
  console.log(JSON.stringify(entry));
}
