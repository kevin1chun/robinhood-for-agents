/**
 * Which surface this process serves. `standard`: the web API under the Chrome session.
 * `agent`: every official tool relayed to Robinhood's hosted MCP under the official credential.
 */

export type Mode = "agent" | "standard";
export const MODES: readonly Mode[] = ["agent", "standard"];

/** `--mode <m>` or `--mode=<m>` in args, else env.ROBINHOOD_MODE, else "standard". Throws on any other value. */
export function resolveMode(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): Mode {
  const i = args.indexOf("--mode");
  const value =
    (i !== -1 ? args[i + 1] : args.find((a) => a.startsWith("--mode="))?.slice(7)) ??
    env.ROBINHOOD_MODE?.trim() ??
    "standard";
  if (!(MODES as readonly string[]).includes(value)) {
    throw new Error(`Unknown mode "${value}"; expected one of: ${MODES.join(", ")}`);
  }
  return value as Mode;
}
