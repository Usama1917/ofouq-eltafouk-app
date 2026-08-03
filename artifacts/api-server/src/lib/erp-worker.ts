import { isErpConfigured } from "./erp";
import { pollErpOrderStatus, runErpOutbox, syncErpStock } from "./erp-sync";
import { logger } from "./logger";

// Background upkeep for the ERPNext link. Three independent loops:
//
//  • OUTBOX — retries orders that haven't reached the ERP. This is what makes an
//    ERP outage a delay instead of a lost order: checkout always succeeds, and
//    whatever couldn't be pushed at the time is pushed here later.
//
//  • STATUS — pulls shipment progress. This is the PRIMARY status path, not a
//    fallback: the ERP writes waybills and COD collection with raw db.set_value
//    calls that fire no document event, so Frappe emits no webhook for them.
//
//  • STOCK — refreshes the cached stock of ERP-linked books, so the store shows
//    what the warehouse actually holds without the owner typing numbers.
//
// All are best-effort and never throw into the event loop: a failing cycle logs
// and the next one tries again.

const OUTBOX_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes
const STATUS_INTERVAL_MS = 3 * 60 * 1000; // every 3 minutes (ERP suggested 2–5)
const STOCK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

export function startErpWorker(): void {
  if (!isErpConfigured()) {
    logger.info("ERP integration not configured — worker idle");
    return;
  }

  const outbox = setInterval(() => {
    void runErpOutbox()
      .then((r) => {
        if (r.processed > 0) logger.info({ processed: r.processed }, "ERP outbox pass");
      })
      .catch((err) => logger.warn({ err }, "ERP outbox pass failed"));
  }, OUTBOX_INTERVAL_MS);

  const status = setInterval(() => {
    void pollErpOrderStatus()
      .then((r) => {
        if (r.applied > 0) logger.info(r, "ERP status poll applied updates");
      })
      .catch((err) => logger.warn({ err }, "ERP status poll failed"));
  }, STATUS_INTERVAL_MS);

  const stock = setInterval(() => {
    void syncErpStock()
      .then((r) => {
        if (r.updated > 0 || r.skipped > 0) logger.info(r, "ERP stock sync");
      })
      .catch((err) => logger.warn({ err }, "ERP stock sync failed"));
  }, STOCK_INTERVAL_MS);

  // unref: these timers must never hold the process open during a shutdown drain.
  outbox.unref();
  status.unref();
  stock.unref();

  logger.info("ERP worker started (outbox 2m · status 3m · stock 10m)");
}
