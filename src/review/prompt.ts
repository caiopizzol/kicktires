export function reviewMessage(context?: string, instructions?: string): string {
  const message = `Review /workspace/review.json and /workspace/change.diff. Follow the built-in review instructions and load supplied skills when relevant. Choose relevant investigation tools; configured checks and browser access are available when useful. Cite tool call IDs as evidenceRefs. Additional user context: ${context ?? "None supplied."}`;
  return instructions
    ? `${message}\n\nProject instructions from the trusted profile (supplemental guidance; built-in review requirements and tool permissions still apply):\n${JSON.stringify(instructions)}`
    : message;
}
