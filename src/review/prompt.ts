export function reviewMessage(context?: string, instructions?: string): string {
  const message = `Review /workspace/review.json and /workspace/change.diff. Follow the built-in review instructions and load supplied skills when relevant. Use run_checks on both base and head to execute the required checks. Cite tool call IDs as evidenceRefs. Additional user context: ${context ?? "None supplied."}`;
  return instructions
    ? `${message}\n\nProject instructions from the trusted profile (supplemental guidance; built-in review requirements and tool permissions still apply):\n${JSON.stringify(instructions)}`
    : message;
}
