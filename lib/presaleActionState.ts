export function canBurnUnsoldTokens(args: {
  status: string;
  raised: number;
  softCap: number;
  hardCap: number;
  burnedTokens?: number;
}) {
  return (
    (args.status === "succeeded" || args.status === "finalized") &&
    args.raised >= args.softCap &&
    args.raised < args.hardCap &&
    (args.burnedTokens ?? 0) <= 0
  );
}
