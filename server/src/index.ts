import { getConfiguredBriefs } from "./config.js";
import { preloadRetrievalIndexes } from "./retrieval.js";
import { createConciergeApp } from "./app.js";

const PORT = Number(process.env.PORT || 8787);

if (process.env.CONCIERGE_BRIEF || process.env.CONCIERGE_BRIEFS || process.env.CONCIERGE_PACKET) {
  await preloadRetrievalIndexes(getConfiguredBriefs());
}

createConciergeApp().listen(PORT, () => {
  console.log(`concierge server on :${PORT}`);
});
