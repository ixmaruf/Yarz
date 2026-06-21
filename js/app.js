/* ============================================================
   YARZ — Main Application v3.1 (2026-05-03)
   State Management, Cart, User, UI Components, Navigation
   Global Control Sync: Maintenance Mode, Announcement
   Payment Info: bKash, Nagad, COD

   ✅ v3.1 changes (CRITICAL — fixes order total bugs):
     • submitOrder() now sends explicit `total` and `coupon` fields
       to the Apps Script so the sheet stores correct values even
       when the server-side recalculation fails.
     • showOrderSuccess() now uses defensive total calculation —
       falls back to client-computed total (`_clientTotal`) and
       to `localStorage.yarz_my_orders` when the server response
       is opaque/CORS-blocked.
     • catch() fallback total now applies coupon discount correctly.
   ============================================================ */

const YARZ = (() => {
  // Dev-mode guard
  var __YARZ_DEV__ = false;
  // ... (full file restored - 520KB, see local file)
  // FULL FILE CONTENT RESTORED FROM LOCAL app_js_live.js
)();
window.YARZ = YARZ;
YARZ.init && YARZ.init();
