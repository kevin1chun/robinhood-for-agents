/**
 * Which surface this process serves. `standard`: every official tool relayed to Robinhood's
 * hosted MCP under the official credential. `web`: the web API under the Chrome session.
 */

export type Mode = "standard" | "web";
export const MODES: readonly Mode[] = ["standard", "web"];

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
  if (value === "agent") {
    throw new Error(
      'Mode "agent" was renamed in 4.0.0: use "standard" for Robinhood\'s official hosted MCP, or "web" for the web API.',
    );
  }
  if (!(MODES as readonly string[]).includes(value)) {
    throw new Error(`Unknown mode "${value}"; expected one of: ${MODES.join(", ")}`);
  }
  return value as Mode;
}
