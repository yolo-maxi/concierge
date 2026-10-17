import { getConfiguredBriefs } from "./config.js";
import { preloadRetrievalIndexes } from "./retrieval.js";
import { createConciergeApp } from "./app.js";

import { budgetFromEnv } from "./budget.js";
import { operationsAlertSender } from "./operationsAlert.js";

const budget = budgetFromEnv(process.env, operationsAlertSender(process.env));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.CONCIERGE_HOST || "127.0.0.1";

if (process.env.CONCIERGE_BRIEF || process.env.CONCIERGE_BRIEFS || process.env.CONCIERGE_PACKET) {
  await preloadRetrievalIndexes(getConfiguredBriefs());
}

createConciergeApp({ budget }).listen(PORT, HOST, () => {
  console.log(`concierge server on ${HOST}:${PORT}`);
});
