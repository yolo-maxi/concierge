// Run through systemd with the existing EnvironmentFile. Never copy its credentials.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageBudget } from "../server/src/budget.js";
import { operationsAlertSender } from "../server/src/operationsAlert.js";

const directory = mkdtempSync(join(tmpdir(), "concierge-alert-check-"));
let acknowledged = 0;
const deliver = operationsAlertSender(process.env, true);
const options = { path: join(directory, "usage.sqlite"), requests: 5, volume: 10000, periodMs: 86400000,
  send: async (alert: Parameters<typeof deliver>[0]) => { await deliver(alert); acknowledged++; } };
try {
  const budget = new UsageBudget(options);
  for (let i = 0; i < 5; i++) await budget.reserve(100);
  budget.close();
  const restarted = new UsageBudget(options);
  try { await restarted.reserve(100); throw new Error("Budget did not refuse"); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "budget_exhausted") throw error; }
  restarted.close();
  if (acknowledged !== 2) throw new Error("Unexpected alert count");
  console.log(JSON.stringify({ check: "operations_alert", acknowledged, restartDeduplication: true, providerCalls: 0 }));
} catch {
  console.error("Operations alert check failed. No provider call was made."); process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
