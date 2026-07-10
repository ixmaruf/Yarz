/**
 * =====================================================================
 * YARZ Cloudflare Worker — GAS + Supabase dual routing
 * Date: 2026-06-20
 *
 * Replaces the old `cloudflare workers.txt` v17.5.
 * Key changes:
 *   1. SUPABASE_ENABLED env var — kill switch for new path
 *   2. Per-action map (ACTIONS_SUPABASE) — granular control
 *   3. Falls back to GAS if Supabase errors / disabled
 *   4. Cache-Control headers preserved
 *
 * Deployment:
 *   wrangler deploy worker-supabase.js --name yarz-api
 *   wrangler secret put SUPABASE_URL
 *   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
 *   wrangler secret put PURGE_SECRET   (already exists)
 *
 * Env vars (use `wrangler secret put NAME`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GAS_DEPLOYMENT_ID  (the script.google.com /exec/ path)
 *   PURGE_SECRET
 *   SUPABASE_ENABLED   (default "true" — Supabase is primary path)
 *   ACTIONS_SUPABASE   (JSON string of per-action overrides, optional)
 * =====================================================================
 */

// ----------------------- CONFIG (read from env in fetch handler) -----------------------
// Note: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PURGE_SECRET, TG_BOT_TOKEN, TG_WEBHOOK_SECRET
// are SECRETS (set via `wrangler secret put`). SUPABASE_ENABLED, TG_OWNER_ID, FRESHT_TTL, etc.
// are VARS (set in wrangler.toml [vars]). Both are accessible via the `env` param in fetch.

// ✅ FIX #14: Read TTL values from env (set via wrangler.toml [vars]).
// Falls back to safe defaults if env not provided.
function getTtls(env) {
  const fresh = parseInt(env.FRESHT_TTL || "") || 30 * 60;
  const swr   = parseInt(env.SWR_TTL   || "") || 5  * 60;
  const hard  = parseInt(env.HARD_TTL  || "") || 24 * 60 * 60;
  return { fresh, swr, hard };
}

// ✅ SERVER-SIDE BLOCK PAGE: Shown when request IP is in blocked_devices table
const BLOCK_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Access Restricted — YARZ</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{text-align:center;max-width:480px;padding:40px 24px}
.icon{width:80px;height:80px;border-radius:50%;background:rgba(239,68,68,0.12);
display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px}
h1{font-size:22px;font-weight:700;margin-bottom:12px;color:#ef4444}
p{font-size:14px;color:#999;line-height:1.6;margin-bottom:8px}
.code{font-family:monospace;font-size:12px;color:#666;margin-top:16px;
padding:10px 16px;background:rgba(255,255,255,0.04);border-radius:8px;display:inline-block}
hr{border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0}
small{font-size:11px;color:#555}
</style>
</head>
<body>
<div class="wrap">
<div class="icon">&#128683;</div>
<h1>Access Restricted</h1>
<p>Your access to this website has been permanently restricted.</p>
<p>If you believe this is an error, please contact support.</p>
<hr>
<p>If you are the site owner, this block was triggered server-side.</p>
<div class="code">IP: {{IP}}</div>
</div>
</body>
</html>`;

// Public actions (no admin auth, only API_KEY) -- safe to cache at edge
const PUBLIC_CACHEABLE = new Set([
  "products","product","categories","store_info","delivery_charges","fb_feed","health",
  "__fortress_public_blocklist"
]);

// Public POST actions -- passthrough (rate-limited)
const PUBLIC_POST = new Set([
  "place_order","subscribe_newsletter","subscribenewsletter","capi","fbcapi","ttapi","ttevents",
  "__fortress_save_fingerprint","resolve_model"
]);

// Admin actions -- require session token verified upstream
const ADMIN_ACTIONS = new Set([
  "adminlogin","admin_login","adminlogout","admin_logout","verify_auth",
  "saveproductfromform","saveproducteditfromform","updateproductstatus",
  "applystockchange","applybulkedit","recordsale","deleteproduct",
  "saveorderfromform","updatewebsiteorderstatus","updatemanualorderstatus",
  "deletewebsiteorder","deletemanualorder","archivecompletedorders",
  "saveadfromform","saveexpensefromform","savereturnfromform",
  "generatemonthlyreport","generateyearlyreport",
  "updatesettings","updatedeliverycharges","savegithubsettings","githubsyncnow",
  "getcurrentmonthsnapshot","getproductanalytics6m","getcustomerltv","snapshotmonth",
  "fullfactoryreset","clearfinancialsonly","clearinventoryonly",
  "steadfastcreate","steadfastbulk","steadfaststatus","steadfastbalance",
  "steadfastsavekeys","steadfastgetreturn","steadfastlistreturns",
  "steadfastlistpayments","steadfastgetpayment","steadfastlistpolicestations",
  "__fortress_lookup","__fortress_block","__fortress_unblock",
  "__fortress_clear_all","__fortress_log_event",
  "__fortress_get_fingerprints",
  "sheet_read","sheet_read_formatted",
  "migrate","diagnoses3xl","repairwebsiteordersstatus","repaircouponactivevalidation",
  "publish_to_cloudflare",
  "changeadminpassword","changeadminusername",
  "setadminpin","verifyadminpin","hasadminpin","changeadminpin"
]);

// ----------------------- SUPABASE ACTION MAP -----------------------
// Maps a GAS action (lowercase) to a Supabase REST query.
// Each entry can return either:
//   { kind: "view",   view: "view_name" }              -> SELECT * from view
//   { kind: "table",  table: "tbl", order: "col", filter: "?col=eq.val" }
//   { kind: "rpc",    fn: "function_name", args: {...} } -> call RPC
//   { kind: "passthrough" } -> always go to GAS
//
// Actions missing here always go to GAS (safe default).
const ACTIONS_SUPABASE = {
  // ---- Public reads (cached at edge) ----
  products:           { kind: "view", view: "website_sync_view" },
  product:            { kind: "table", table: "inventory", filter: "?product=eq.{name}", single: true },
  categories:         { kind: "passthrough" }, // uses SETTINGS in GAS
  store_info:         { kind: "passthrough" }, // aggregate over settings+delivery
  delivery_charges:   { kind: "table", table: "delivery_charges", filter: "?active=eq.true&order=sort_order" },
  fb_feed:            { kind: "passthrough" }, // CSV generation needs GAS logic
  health:             { kind: "passthrough" },

  // ---- Public reads (NOT cached -- PII) ----
  orders_by_phone:    { kind: "table", table: "website_orders", filter: "?cust_phone=eq.{phone}", order: "created_at.desc" },

  // ---- Public POSTs (not cached) ----
  place_order:        { kind: "passthrough" }, // complex, keep in GAS for now
  subscribe_newsletter: { kind: "table", table: "newsletter_subscribers", op: "insert" },
  subscribenewsletter:  { kind: "table", table: "newsletter_subscribers", op: "insert" },
  capi:               { kind: "passthrough" },
  ttapi:              { kind: "passthrough" },

  // ---- Fortress fingerprint save (public POST, no auth needed) ----
  __fortress_save_fingerprint: { kind: "rpc", fn: "fortress_save_fingerprint", args: {
    p_visitor_id: "$visitorId",
    p_composite_hash: "$compositeHash",
    p_ip_address: "$ip",
    p_user_agent: "$userAgent",
    p_device_name: "$deviceName",
    p_device_os: "$deviceOS",
    p_device_browser: "$deviceBrowser",
    p_device_screen: "$deviceScreen",
    p_canvas_hash: "$canvasHash",
    p_audio_hash: "$audioHash",
    p_webgl_vendor: "$webglVendor",
    p_webgl_renderer: "$webglRenderer",
    p_screen_resolution: "$screenResolution",
    p_color_depth: "$colorDepth",
    p_hardware_concurrency: "$hwCores",
    p_device_memory: "$deviceMemory",
    p_pixel_ratio: "$pixelRatio",
    p_timezone: "$timezone",
    p_timezone_offset: "$timezoneOffset",
    p_languages: "$language",
    p_fonts_count: "$fontsCount",
    p_touch_support: "$touchSupport",
    p_network_type: "$networkType",
    p_fingerprintjs_id: "$fpjsId",
    p_fingerprintjs_confidence: "$fpjsConfidence",
    p_ip_country: "$ipCountry",
    p_ip_city: "$ipCity",
    p_ip_region: "$ipRegion",
    p_ip_isp: "$ipIsp",
    p_is_vpn: "$isVpn",
    p_is_proxy: "$isProxy",
    p_is_datacenter: "$isDatacenter"
  }},

  // ---- Fortress get fingerprints (admin) ----
  __fortress_get_fingerprints: { kind: "rpc", fn: "fortress_get_fingerprints", args: {
    p_limit: "$limit", p_offset: "$offset"
  }},

  // ---- Admin reads ----
  sheet_read:         { kind: "table_or_view" }, // dynamic based on range
  sheet_read_formatted:{ kind: "passthrough" },
  verify_auth:        { kind: "passthrough" },

  // ---- Admin writes (most can be done via Supabase; some need GAS logic) ----
  saveproductfromform:    { kind: "table", table: "inventory", op: "insert" },
  saveproducteditfromform:{ kind: "table", table: "inventory", op: "update", key: "product" },
  updateproductstatus:    { kind: "table", table: "inventory", op: "update", key: "product" },
  applystockchange:       { kind: "rpc", fn: "atomic_adjust_stock", args: {
                                     p_product: "$product", p_size: "$size",
                                     p_delta: "$delta", p_kind: "$kind" } },
  applybulkedit:          { kind: "passthrough" },
  recordsale:             { kind: "passthrough" },
  deleteproduct:          { kind: "table", table: "inventory", op: "delete", key: "product" },

  saveorderfromform:      { kind: "rpc", fn: "create_manual_order", args: {
                                     p_order_id: "$order_id", p_cust_name: "$cust_name",
                                     p_cust_phone: "$cust_phone", p_cust_addr: "$cust_addr",
                                     p_deliv_dist: "$deliv_dist", p_deliv_zone: "$deliv_zone",
                                     p_product: "$product", p_size: "$size",
                                     p_qty: "$qty", p_price: "$price",
                                     p_delivery_charge: "$delivery_charge",
                                     p_total: "$total", p_payment: "$payment",
                                     p_status: "$status", p_courier: "$courier",
                                     p_notes: "$notes" } },
  updatewebsiteorderstatus:{ kind: "table", table: "website_orders", op: "update", key: "order_id" },
  updatemanualorderstatus:{ kind: "table", table: "orders", op: "update", key: "order_id" },
  deletewebsiteorder:     { kind: "rpc", fn: "delete_website_order", args: { p_order_id: "$orderId" } },
  deletemanualorder:       { kind: "table", table: "orders", op: "delete", key: "order_id" },
  archivecompletedorders:  { kind: "passthrough" },

  saveadfromform:      { kind: "table", table: "ad_tracker", op: "insert" },
  saveexpensefromform: { kind: "table", table: "expenses", op: "insert" },
  savereturnfromform:  { kind: "passthrough" },

  updatesettings:        { kind: "table", table: "settings", op: "upsert" },
  updatedeliverycharges: { kind: "table", table: "delivery_charges", op: "upsert" },
  savegithubsettings:    { kind: "table", table: "settings", op: "upsert" },
  githubsyncnow:         { kind: "passthrough" },

  // ---- Analytics (compute in DB is more efficient) ----
  generatemonthlyreport:   { kind: "rpc", fn: "generate_monthly_report", args: {
                                     p_year: "$year", p_month: "$month" } },
  generateyearlyreport:   { kind: "rpc", fn: "generate_yearly_report", args: { p_year: "$year" } },
  getcurrentmonthsnapshot: { kind: "passthrough" },
  getproductanalytics6m:   { kind: "passthrough" },
  getcustomerltv:          { kind: "view", view: "customer_ltv_view" },
  snapshotmonth:           { kind: "passthrough" },

  // ---- Cleanup (DANGER; double-auth via upstream + here we still verify session) ----
  fullfactoryreset:    { kind: "passthrough" },
  clearfinancialsonly: { kind: "passthrough" },
  clearinventoryonly:  { kind: "passthrough" },

  // ---- Courier (external HTTP — keep in GAS until Edge Function migrated) ----
  steadfastcreate:  { kind: "passthrough" },
  steadfastbulk:    { kind: "passthrough" },
  steadfaststatus:  { kind: "passthrough" },
  steadfastbalance: { kind: "passthrough" },
  steadfastsavekeys:{ kind: "passthrough" },

  // ---- Fortress (anti-fraud) ----
  __fortress_lookup:    { kind: "passthrough" },
  __fortress_block:     { kind: "passthrough" },
  __fortress_unblock:   { kind: "passthrough" },
  __fortress_clear_all: { kind: "passthrough" },
  __fortress_log_event: { kind: "passthrough" },

  // ---- Admin self-service (credential change) ----
  // ✅ v11.4: routed via Supabase RPCs. Worker is a passthrough shim that
  // forwards the POST body to the change_admin_password / change_admin_username
  // functions defined in supabase/rpc.sql. Body must include sessionToken,
  // currentPassword, newPassword (and newUsername for the username RPC).
  changeadminpassword: { kind: "rpc", fn: "change_admin_password", args: {
                                p_token: "$sessionToken",
                                p_current_password: "$currentPassword",
                                p_new_password: "$newPassword" } },
  changeadminusername: { kind: "rpc", fn: "change_admin_username", args: {
                                p_token: "$sessionToken",
                                p_new_username: "$newUsername" } },

  // ---- Admin PIN protection ----
  // v11.5: routes for setting, verifying, checking, and changing the admin PIN.
  // Body must include sessionToken and pin (and oldPin/newPin for change).
  setadminpin: { kind: "rpc", fn: "set_admin_pin", args: {
                         p_token: "$sessionToken",
                         p_pin: "$pin" } },
  verifyadminpin: { kind: "rpc", fn: "verify_admin_pin", args: {
                            p_token: "$sessionToken",
                            p_pin: "$pin" } },
  hasadminpin: { kind: "rpc", fn: "has_admin_pin", args: {
                         p_token: "$sessionToken" } },
  changeadminpin: { kind: "rpc", fn: "change_admin_pin", args: {
                            p_token: "$sessionToken",
                            p_old_pin: "$oldPin",
                            p_new_pin: "$newPin" } }
};
// ----------------------- HELPERS -----------------------
function safeUrl(u) {
  if (typeof u !== "string" || u.length === 0) return "";
  const t = u.trim();
  if (/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);/i.test(t)) return t;
  if (/^data:/i.test(t)) return "";
  if (/^(javascript|vbscript|file|blob|about):/i.test(t)) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/") || t.startsWith("./") || t.startsWith("../")) return t;
  return "";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token, X-Purge-Key, x-purge-secret",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }, corsHeaders())
  });
}

async function supabaseRequest(env, path, init) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured (URL or service_role key missing)");
  const fullUrl = url.replace(/\/+$/, "") + "/rest/v1/" + path;
  const defaultHeaders = {
    "apikey": key,
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json"
  };
  // Merge init headers with defaults (init headers override defaults)
  const mergedHeaders = Object.assign({}, defaultHeaders, (init && init.headers) || {});
  const mergedInit = Object.assign({}, init || {}, { headers: mergedHeaders });
  const res = await fetch(fullUrl, mergedInit);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Supabase " + res.status + ": " + txt.substring(0, 300));
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return await res.json();
  return await res.text();
}

// ----------------------- ACTION HANDLERS -----------------------
async function handleSupabase(env, action, payload, request) {
  const def = ACTIONS_SUPABASE[action];
  if (!def || def.kind === "passthrough") {
    // ✅ FIX #38: Steadfast handlers — not in ACTIONS_SUPABASE because they
    // call external Packzy API directly, not Supabase.
    if (action === "steadfastcreate")        return await steadfastCreateOrder(env, payload || {});
    if (action === "steadfastbulk")          return await steadfastBulkCreate(env, payload || {});
    if (action === "steadfaststatus")        return await steadfastStatus(env, payload || {});
    if (action === "steadfastbalance")       return await steadfastBalance(env);
    if (action === "steadfastcreatereturn") return await steadfastCreateReturn(env, payload || {});
    if (action === "steadfastgetreturn")     return await steadfastGetReturn(env, payload || {});
    if (action === "steadfastlistreturns")   return await steadfastListReturns(env);
    if (action === "steadfastlistpayments")  return await steadfastListPayments(env);
    if (action === "steadfastgetpayment")    return await steadfastGetPayment(env, payload || {});
    if (action === "steadfastlistpolicestations") return await steadfastPoliceStations(env);
    if (action === "steadfastsavekeys")      return await steadfastSaveKeys(env, payload || {});
    if (action === "steadfastlistkeys")      return await steadfastKeysList(env);
    // __fortress_lookup: return blocked devices + threats
    if (action === "__fortress_lookup") {
      try {
        const blocked = await supabaseRequest(env, "blocked_devices?order=created_at.desc&select=*&status=eq.active");
        return { ok: true, devices: blocked || [], threats: [] };
      } catch (e) {
        return { ok: true, devices: [], threats: [], error: e.message };
      }
    }
    // Resolve device model code → marketing name
    if (action === "resolve_model") {
      try {
        const code = (payload.model_code || payload.code || "").trim();
        const brand = (payload.brand || "").trim();
        if (!code) return { success: false, msg: "model_code required" };
        // Look up in Supabase
        const r = await supabaseRequest(env, "device_models?model_code=eq." + encodeURIComponent(code) + "&select=brand,marketing_name,gpu,released_year");
        if (r && r.length > 0) {
          return { success: true, name: r[0].marketing_name, brand: r[0].brand, gpu: r[0].gpu, year: r[0].released_year };
        }
        // Not found — save it as unknown for future resolution
        if (brand && code) {
          await supabaseRequest(env, "device_models", {
            method: "POST",
            body: JSON.stringify({ model_code: code, brand: brand, marketing_name: "", gpu: "", released_year: 0 }),
            headers: { "Prefer": "resolution=merge-duplicates" }
          }).catch(() => {});
        }
        return { success: true, name: "", brand: brand, known: false };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return null; // signal: fall back to GAS
  }

  try {
    switch (def.kind) {
      case "view": {
        const data = await supabaseRequest(env, def.view + "?select=*", { method: "GET" });
        // ✅ FIX #21: Map PascalCase view columns → lowercase for backward compat
        // The website_sync_view in Supabase has explicit column aliases:
        //   "Product", "Image1", "Regular", "Sale", "S_Left", "M_Left", "3XL_Left"...
        // But the customer site js/api.js + app.js expect:
        //   p.product, p.image1, p.regular, p.sale, p.stockS/M/L/XL/XXL/3XL...
        // IMPORTANT: do NOT spread original `...p` — that re-introduces PascalCase keys
        // which creates duplicate keys in JSON (invalid). Only emit the lowercase fields.
        const mapped = Array.isArray(data) ? data.map(p => {
          if (!p || typeof p !== 'object') return p;
          return {
            product: p.product ?? p.Product,
            // âœ… FIX #22: backward compat for app.js openProduct(name)
            // Customer site lookup: state.products.find(function (p) { return p.name === name; })
            // The view returns 'Product' (PascalCase) which we map to 'product' (lowercase).
            // But the customer site expects 'name' for the onclick parameter. Add both.
            name: p.product ?? p.Product,
            image1: p.image1 ?? p.Image1,
            image2: p.image2 ?? p.Image2,
            image3: p.image3 ?? p.Image3,
            image4: p.image4 ?? p.Image4,
            image5: p.image5 ?? p.Image5,
            image6: p.image6 ?? p.Image6,
            video_url: p.video_url ?? p.Video,
            description: p.description ?? p.Description,
            category: p.category ?? p.Category,
            fabric: p.fabric ?? p.Fabric,
            badge: p.badge ?? p.Badge,
            size_chart: p.size_chart ?? p.SizeChart,
            delivery_days: p.delivery_days ?? p.DeliveryDays,
            regular: p.regular ?? p.Regular,
            sale: p.sale ?? p.Sale,
            discPct: p.discPct ?? p['Disc%'],
            disc_type: p.disc_type ?? p.DiscType,
            dhaka_delivery: p.dhaka_delivery ?? p['Delivery(Dhaka)'],
            outside_delivery: p.outside_delivery ?? p['Delivery(Outside)'],
            stockS: p.stockS ?? p.S_Left,
            stockM: p.stockM ?? p.M_Left,
            stockL: p.stockL ?? p.L_Left,
            stockXL: p.stockXL ?? p.XL_Left,
            stockXXL: p.stockXXL ?? p.XXL_Left,
            stock3XL: p.stock3XL ?? p['3XL_Left'],
            status: p.status ?? p.Status,
            coupon_active: p.coupon_active ?? p.CouponActive,
            coupon_code: p.coupon_code ?? p.CouponCode,
            coupon_disc_percent: p.coupon_disc_percent ?? p.CouponDisc,
            // ✅ FIX #28: camelCase aliases for app.js (L3808 condition: product.couponActive/Code/Disc)
            couponActive: p.coupon_active ?? p.CouponActive,
            couponCode: p.coupon_code ?? p.CouponCode,
            couponDisc: p.coupon_disc_percent ?? p.CouponDisc,
            hidden_sizes: p.hidden_sizes ?? p.HiddenSizes ?? '',
            size_type: p.size_type ?? p.SizeType ?? '',
            accessory: p.accessory ?? p.Accessory ?? ''
          };
        }) : data;
        return { success: true, ok: true, data: mapped };
      }
      case "table": {
        if (request.method === "GET") {
          let path = def.table + "?select=*" + (def.filter || "");
          // replace {name} placeholders with actual payload values
          const m = def.filter && def.filter.match(/\{(\w+)\}/);
          if (m) {
            const v = payload[m[1]];
            if (v === undefined) throw new Error("Missing param: " + m[1]);
            path = path.replace("{" + m[1] + "}", encodeURIComponent(v));
          }
          let data = await supabaseRequest(env, path, { method: "GET" });
          if (def.single && Array.isArray(data)) data = data[0] || null;
          return { success: true, ok: true, data: data };
        }
        if (request.method === "POST" && def.op === "insert") {
          // Strip meta fields that don't exist in table schema
          const cleanPayload = Object.assign({}, payload);
          delete cleanPayload.action;
          delete cleanPayload.key;
          delete cleanPayload._t;
          const r = await supabaseRequest(env, def.table, { method: "POST", body: JSON.stringify(cleanPayload) });
          return { success: true, ok: true, data: r };
        }
        if (request.method === "POST" && (def.op === "update" || def.op === "delete")) {
          const keyVal = payload[def.key];
          if (!keyVal) return { success: false, ok: false, msg: "Missing key: " + def.key };
          const body = Object.assign({}, payload);
          delete body[def.key];
          // Strip meta fields that don't exist in table schema
          delete body.action;
          delete body.key;
          delete body._t;
          const r = await supabaseRequest(
            env,
            def.table + "?" + def.key + "=eq." + encodeURIComponent(keyVal),
            { method: def.op === "update" ? "PATCH" : "DELETE", body: JSON.stringify(body) }
          );
          return { success: true, ok: true, msg: "Updated", data: r };
        }
        if (def.op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          const r = await supabaseRequest(
            env,
            def.table + "?on_conflict=key",
            { method: "POST",
              headers: { "Prefer": "resolution=merge-duplicates" },
              body: JSON.stringify(rows) }
          );
          return { success: true, ok: true, data: r };
        }
        break;
      }
      case "rpc": {
        // Call Supabase RPC via PostgREST: POST /rest/v1/rpc/<fn>
        // Args may use $placeholder syntax to pull from payload
        const args = {};
        if (def.args) {
          for (const k in def.args) {
            const v = def.args[k];
            if (typeof v === "string" && v.charAt(0) === "$") {
              const key = v.slice(1);
              args[k] = payload[key];
            } else {
              args[k] = v;
            }
          }
        }
        const r = await supabaseRequest(env, "rpc/" + def.fn, {
          method: "POST",
          body: JSON.stringify(args)
        });
        return { success: true, ok: true, data: r };
      }
    }
  } catch (e) {
    console.error("[supabase]", action, e.message);
    return null; // signal: fall back to GAS
  }
  return null;
}

// ----------------------- CUSTOM HANDLERS -----------------------
// place_order: maps customer-site payload to create_manual_order RPC
// Handles single OR multiple cart items (creates one order per item)
async function placeOrderSupabase(env, body) {
  const orderData = body.order || body;
  // âœ… FIX #26: Normalize flat customer-site params (cust_phone) AND nested order{}
  if (!orderData || typeof orderData !== 'object') return null;
  // Accept all common phone field names
  if (!orderData.phone) orderData.phone = orderData.cust_phone || orderData.customerPhone || orderData.contactPhone || '';
  if (!orderData.customerName) orderData.customerName = orderData.cust_name || orderData.name || '';
  if (!orderData.address) orderData.address = orderData.cust_addr || '';
  if (!orderData.location) orderData.location = orderData.deliv_zone || orderData.city || '';
  // Phone is required to proceed
  if (!orderData.phone) return null;
  let items = orderData.cartItems || [];
  if (items.length === 0) {
    const singleProduct = orderData.product || orderData.p || '';
    if (singleProduct) {
      items = [{ product: singleProduct, name: singleProduct, size: orderData.size || orderData.s || '', qty: Number(orderData.qty || orderData.q) || 1, price: Number(orderData.price) || 0 }];
    }
  }
  if (items.length === 0) return null;
  const orderIds = [];
  const ts = Date.now();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const orderId = items.length === 1
      ? (orderData.orderId || ("WEB-" + ts + "-" + Math.floor(Math.random()*10000)))
      : (orderData.orderId + "-" + (i+1));
    const args = {
      p_order_id: orderId,
      p_cust_name: orderData.customerName || orderData.name || "",
      p_cust_phone: orderData.phone || "",
      p_cust_addr: orderData.address || "",
      p_deliv_zone: orderData.location || orderData.city || "",
      p_product: it.product || it.name || "",
      p_size: it.size || "",
      p_qty: it.qty || 1,
      p_price: (it.price || 0),
      p_delivery_charge: (orderData.deliveryCharge || 0),
      p_total: (orderData.total || 0),
      p_payment: orderData.payment || "Cash on Delivery",
      p_status: "Pending",
      p_notes: orderData.notes || "",
      p_user: "website"
    };
    // v18.10: Pass fortress anti-fraud data to RPC
    if (orderData.deviceId) args.p_device_id = orderData.deviceId;
    if (orderData.ip) args.p_ip = orderData.ip;
    if (orderData.country) args.p_country = orderData.country;
    if (orderData.asn) args.p_asn = orderData.asn;
    if (orderData.riskScore !== undefined) args.p_risk_score = orderData.riskScore;
    if (orderData.riskSignals) args.p_risk_signals = orderData.riskSignals;
    if (orderData.isFlagged !== undefined) args.p_flagged = orderData.isFlagged;
    if (orderData.flagReason) args.p_flag_reason = orderData.flagReason;
    // v1.0: Full device info JSON from device-detector.js
    if (orderData.deviceInfo) {
      args.p_device_info = JSON.stringify(orderData.deviceInfo);
    }
    try {
      const r = await supabaseRequest(env, "rpc/create_website_order", {
        method: "POST",
        body: JSON.stringify(args)
      });
      orderIds.push(orderId);
    } catch (e) {
      console.error("[place_order] item", i, "failed:", e.message);
      return null; // fall back to GAS for the whole batch
    }
  }
  return {
    success: true,
    ok: true,
    orderId: orderIds[0],
    orderIds: orderIds,
    timestamp: ts,
    bdTime: new Date(ts).toISOString().replace("T", " ").substring(0, 19),
    total: orderData.total || 0,
    qty: items.reduce((s, it) => s + (it.qty || 1), 0),
    status: "Pending"
  };
}

// store_info: aggregate settings + delivery_charges
// ✅ FIX #6: Build output explicitly — no Object.assign merge that creates
// both lowercase "currency" and Title Case "Currency" in the JSON response.
async function storeInfoSupabase(env) {
  // Keys that the explicit-mapped fields above already cover.
  // These are filtered out of the settings spread to avoid case-collision
  // duplicates in case-insensitive JSON consumers (e.g. PowerShell ConvertFrom-Json).
  const EXCLUDED_FROM_SPREAD = new Set(['currency','currency symbol','store name','store phone','store email','store address','link facebook','link instagram','link whatsapp','link messenger','link tiktok','link youtube','custom categories','custom fabrics','custom badges','github repo','github branch','github path']);

  try {
    const settingsRes = await supabaseRequest(env, "settings?is_secret=eq.false&select=key,value", { method: "GET" });
    const settings = {};
    for (const r of settingsRes) settings[r.key] = r.value;
    const dcRes = await supabaseRequest(env, "delivery_charges?active=eq.true&order=sort_order&select=id,name,charge,active", { method: "GET" });
    const result = {
      success: true,
      ok: true,
      data: {
        // Identity
        name: settings["Store Name"] || "",
        phone: settings["Store Phone"] || "",
        email: settings["Store Email"] || "",
        address: settings["Store Address"] || "",
        currency: settings["Currency Symbol"] || settings["Currency"] || "৳",
        // Social links (customer site uses snake_case lowercase)
        link_facebook: settings["Link Facebook"] || "",
        link_instagram: settings["Link Instagram"] || "",
        link_whatsapp: settings["Link WhatsApp"] || "",
        link_messenger: settings["Link Messenger"] || "",
        link_tiktok: settings["Link TikTok"] || "",
        link_youtube: settings["Link YouTube"] || "",
        // Custom taxonomies
        custom_categories: settings["Custom Categories"] || "",
        custom_fabrics: settings["Custom Fabrics"] || "",
        custom_badges: settings["Custom Badges"] || "",
        // GitHub
        github_repo: settings["GitHub Repo"] || "",
        github_branch: settings["GitHub Branch"] || "main",
        github_path: settings["GitHub Path"] || "data.json",
        // âœ… FIX #25: Banner fields â€” explicit lookups for customer-site compatibility
        // The customer site reads data.hero_banner_1 (with underscore) but the DB
        // stores "Hero Banner 1" (with space). Try all reasonable casings.
        hero_banner_1: settings["hero banner 1"] || settings["Hero Banner 1"] || "",
        hero_banner_2: settings["hero banner 2"] || settings["Hero Banner 2"] || "",
        hero_banner_3: settings["hero banner 3"] || settings["Hero Banner 3"] || "",
        hero_banner_4: settings["hero banner 4"] || settings["Hero Banner 4"] || "",
        hero_banner_5: settings["hero banner 5"] || settings["Hero Banner 5"] || "",
        banner_title_1: (settings["banner title 1"] || settings["Banner Title 1"] || "").trim(),
        banner_title_2: (settings["banner title 2"] || settings["Banner Title 2"] || "").trim(),
        banner_title_3: (settings["banner title 3"] || settings["Banner Title 3"] || "").trim(),
        banner_title_4: (settings["banner title 4"] || settings["Banner Title 4"] || "").trim(),
        banner_title_5: (settings["banner title 5"] || settings["Banner Title 5"] || "").trim(),
        banner_link_1: settings["banner link 1"] || settings["Banner Link 1"] || "",
        banner_link_2: settings["banner link 2"] || settings["Banner Link 2"] || "",
        banner_link_3: settings["banner link 3"] || settings["Banner Link 3"] || "",
        banner_link_4: settings["banner link 4"] || settings["Banner Link 4"] || "",
        banner_link_5: settings["banner link 5"] || settings["Banner Link 5"] || "",
        banner_text_color_1: settings["banner text color 1"] || settings["Banner Text Color 1"] || "",
        banner_text_color_2: settings["banner text color 2"] || settings["Banner Text Color 2"] || "",
        banner_text_color_3: settings["banner text color 3"] || settings["Banner Text Color 3"] || "",
        banner_text_color_4: settings["banner text color 4"] || settings["Banner Text Color 4"] || "",
        banner_text_color_5: settings["banner text color 5"] || settings["Banner Text Color 5"] || "",
        // Delivery zones
        delivery_charges: dcRes,
        // Spread all admin settings keys in LOWERCASE so JSON consumers
        // (PowerShell ConvertFrom-Json is case-insensitive) do NOT see duplicate
        // keys. Excludes keys we already explicitly mapped above.
        ...Object.fromEntries(
          Object.keys(settings)
            .filter(function(k) { return !EXCLUDED_FROM_SPREAD.has(k.toLowerCase()); })
            .map(function(k) { return [k.toLowerCase(), settings[k]]; })
        )
      }
    };

    // Apply sensible defaults for missing critical fields so the site never shows
    // a broken-looking empty hero when admin has not yet populated the Banners tab.
    if (!result.data.hero_banner_1) {
      result.data.hero_banner_1 = 'https://yarzclothing.xyz/images/og-banner.png';
    }

    return result;

  } catch (e) {
    console.error("[store_info] failed:", e.message);
    return null;
  }
}

// categories: read Custom Categories from settings, split by comma
async function categoriesSupabase(env) {
  try {
    const r = await supabaseRequest(env, "settings?key=eq.Custom Categories&select=value", { method: "GET" });
    if (!r || r.length === 0) return { success: true, ok: true, data: [] };
    const cats = (r[0].value || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    return { success: true, ok: true, data: cats };
  } catch (e) {
    console.error("[categories] failed:", e.message);
    return null;
  }
}

// current_month_snapshot: returns aggregated stats for the current month
// FIX #32: home dashboard "This Month" was always empty. Now returns counts + revenue.
async function currentMonthSnapshotSupabase(env) {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    // Use both website_orders and orders tables; sum what's there.
    const [web, man, txns, exps, ads] = await Promise.all([
      supabaseRequest(env, "website_orders?date=gte." + firstOfMonth + "&select=order_id,product,qty,price,total,status,cust_phone", { method: "GET" }).catch(() => []),
      supabaseRequest(env, "orders?date=gte." + firstOfMonth + "&select=order_id,product,qty,price,total,status,cust_phone", { method: "GET" }).catch(() => []),
      supabaseRequest(env, "transactions?date=gte." + firstOfMonth + "&select=revenue,cost,type", { method: "GET" }).catch(() => []),
      supabaseRequest(env, "expenses?date=gte." + firstOfMonth + "&select=amount", { method: "GET" }).catch(() => []),
      supabaseRequest(env, "ad_tracker?date=gte." + firstOfMonth + "&select=spend", { method: "GET" }).catch(() => [])
    ]);
    const wArr = Array.isArray(web) ? web : [];
    const mArr = Array.isArray(man) ? man : [];
    const all = wArr.concat(mArr);
    const tArr = Array.isArray(txns) ? txns : [];
    const eArr = Array.isArray(exps) ? exps : [];
    const aArr = Array.isArray(ads) ? ads : [];
    const sum = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const counts = {};
    for (const r of all) {
      const k = (r.product || "Unknown").trim() || "Unknown";
      counts[k] = (counts[k] || 0) + (Number(r.qty) || 1);
    }
    const topProducts = Object.keys(counts)
      .map(k => ({ product: k, qty: counts[k] }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    // Compute net profit from transactions (Sale + Return with negative values) minus expenses and ad spend
    const txRevenue = sum(tArr, "revenue");
    const txCost = sum(tArr, "cost");
    const totalExpenses = sum(eArr, "amount");
    const totalAdSpend = sum(aArr, "spend");
    const net_profit = txRevenue - txCost - totalExpenses - totalAdSpend;
    return {
      success: true,
      ok: true,
      data: {
        month_start: firstOfMonth,
        website_orders: wArr.length,
        manual_orders: mArr.length,
        total_orders: all.length,
        revenue_website: sum(wArr, "total"),
        revenue_manual: sum(mArr, "total"),
        revenue_total: sum(all, "total"),
        tx_revenue: txRevenue,
        tx_cost: txCost,
        total_expenses: totalExpenses,
        total_ad_spend: totalAdSpend,
        net_profit: net_profit,
        unique_customers_website: new Set(wArr.map(r => r.cust_phone).filter(Boolean)).size,
        unique_customers_manual: new Set(mArr.map(r => r.cust_phone).filter(Boolean)).size,
        top_products: topProducts
      }
    };
  } catch (e) {
    console.error("[currentMonthSnapshot] failed:", e.message);
    return { success: true, ok: true, data: { month_start: new Date().toISOString(), website_orders: 0, manual_orders: 0, total_orders: 0, revenue_total: 0, net_profit: 0, top_products: [], error: e.message } };
  }
}

async function productAnalytics6mSupabase(env) {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const from = sixMonthsAgo.toISOString();
    const data = await supabaseRequest(env, "transactions?date=gte." + from + "&type=eq.Sale&select=product,qty,revenue,cost,profit", { method: "GET" });
    const arr = Array.isArray(data) ? data : [];
    const prodMap = {};
    for (const r of arr) {
      const name = (r.product || "Unknown").trim() || "Unknown";
      if (!prodMap[name]) prodMap[name] = { product_name: name, revenue: 0, cost: 0, units_sold: 0 };
      prodMap[name].revenue += Number(r.revenue) || 0;
      prodMap[name].cost += Number(r.cost) || 0;
      prodMap[name].units_sold += Number(r.qty) || 0;
    }
    return { success: true, data: Object.values(prodMap) };
  } catch (e) {
    console.error("[productAnalytics6m] failed:", e.message);
    return { success: true, data: [] };
  }
}

function gasUpstream(env) {
  const id = env && env.GAS_DEPLOYMENT_ID;
  if (!id) throw new Error("GAS_DEPLOYMENT_ID not set; cannot route to legacy GAS fallback. Set it via `wrangler secret put GAS_DEPLOYMENT_ID` if you need GAS fallback.");
  return "https://script.google.com/macros/s/" + id + "/exec";
}

// GitHub Pages is the canonical static host for the customer site.
// When yarzclothing.xyz receives a non-API GET (no ?action= and no ?key=),
// proxy to GH Pages so visitors see the actual website instead of JSON.
const GH_PAGES_BASE = "https://ixmaruf.github.io/Yarz";
const GH_PAGES_HOST = "ixmaruf.github.io";

function isStaticRequest(url) {
  // No action AND no key AND not a worker-internal path -> assume browser wants static
  if (url.searchParams.has("action")) return false;
  if (url.searchParams.has("key")) return false;
  if (url.searchParams.has("__purge")) return false;
  const p = url.pathname;
  if (p.startsWith("/__")) return false;          // __env, __purge
  if (p === "/purge" || p === "/tg-webhook") return false;
  if (p.startsWith("/api/")) return false;
  return true;
}

async function fetchFromGitHubPages(request) {
  const url = new URL(request.url);
  const target = GH_PAGES_BASE + url.pathname + url.search;
  try {
    const ghResp = await fetch(target, {
      method: "GET",
      headers: { "User-Agent": "YARZ-Worker/1.0" },
      redirect: "follow"
    });
    if (!ghResp.ok) {
      // 404 fallback: try /index.html (for SPA-style deep links)
      if (ghResp.status === 404 && !pathHasExtension(url.pathname)) {
        const fallback = await fetch(GH_PAGES_BASE + "/index.html", {
          headers: { "User-Agent": "YARZ-Worker/1.0" }
        });
        if (fallback.ok) return new Response(fallback.body, fallback);
      }
      return new Response("Static asset not found: " + url.pathname, { status: ghResp.status });
    }
    // Pass through content, with permissive cache
    const respHeaders = new Headers(ghResp.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return new Response(ghResp.body, { status: ghResp.status, headers: respHeaders });
  } catch (e) {
    return new Response("Static proxy error: " + e.message, { status: 502 });
  }
}

function pathHasExtension(p) {
  return /\.[a-z0-9]{1,5}$/i.test(p);
}

// ----------------------- ROUTER -----------------------
async function routeToGas(request, body, env, ctx) {
  const upstream = gasUpstream(env);
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  if (request.method === "GET") {
    const url = new URL(request.url);
    init.method = "GET";
    init.body = undefined;
    // forward query string to GAS
    return fetch(upstream + url.search, init);
  }
  return fetch(upstream, init);
}

async function handle(request, env, ctx) {
  const { fresh: FRESH_TTL, swr: SWR_TTL, hard: HARD_TTL } = getTtls(env);
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Debug endpoint: /__env shows which secrets/vars are injected (safe; does NOT print secret values)
  const __url0 = new URL(request.url);
  if (__url0.pathname === "/__env") {
    return jsonResponse({
      has_url: !!env.SUPABASE_URL,
      url_prefix: env.SUPABASE_URL ? env.SUPABASE_URL.substring(0, 30) + "..." : null,
      has_key: !!env.SUPABASE_SERVICE_ROLE_KEY,
      key_len: env.SUPABASE_SERVICE_ROLE_KEY ? env.SUPABASE_SERVICE_ROLE_KEY.length : 0,
      supabase_enabled: env.SUPABASE_ENABLED,
      has_purge: !!env.PURGE_SECRET,
      has_tg_token: !!env.TG_BOT_TOKEN,
      has_tg_webhook: !!env.TG_WEBHOOK_SECRET,
      env_keys: Object.keys(env).sort()
    });
  }

  // Parse request
  let action = null;
  let body = {};
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();
  
  if (path === "/__customerltv") {
    action = "getcustomerltv";
  } else if (path === "/__productanalytics6m" || path === "/__productAnalytics6m") {
    action = "getproductanalytics6m";
  } else if (path === "/__currentmonthsnapshot") {
    action = "getcurrentmonthsnapshot";
  } else if (request.method === "GET") {
    action = (url.searchParams.get("action") || "products").toLowerCase();
    // FIX #39: Public GET table queries use URL placeholders (e.g. ?action=product&name=SHED).
    // Merge URL params into body so handleSupabase can replace {name} placeholders.
    try { for (const [k, v] of url.searchParams.entries()) { body[k] = v; } } catch(e) {}
  } else {
    const txt = await request.text();
    try { body = txt ? JSON.parse(txt) : {}; } catch(e) { body = {}; }
    // FIX #27: Customer site sends params in URL, not body. Merge URL params.
    try { for (const [k, v] of url.searchParams.entries()) { if (!(k in body) || body[k] === "" || body[k] == null) body[k] = v; } } catch(e) {}
    action = String(body.action || url.searchParams.get("action") || "").toLowerCase();
  }

  // Supabase enabled? Default true so production always uses Supabase unless explicitly disabled.
  const supabaseEnabled = env.SUPABASE_ENABLED !== "false";

  // __analytics (public GET) — visitor analytics: visits (all hits) + unique (by IP per day)
  // Only tracks visits from the main website (yarzclothing.xyz), NOT from admin panel
  // Supports both /__analytics path AND ?action=__analytics query param
  if (supabaseEnabled && (path === "/__analytics" || action === "__analytics") && request.method === "GET") {
    try {
      const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      
      // Check if request is from admin panel — if so, skip tracking (just return counts)
      const referer = (request.headers.get("referer") || "").toLowerCase();
      const origin = (request.headers.get("origin") || "").toLowerCase();
      const isAdmin = referer.includes("ixmaruf.github.io") || origin.includes("ixmaruf.github.io")
                    || referer.includes("yARZ-Pro") || referer.includes("yARZ-pro");
      
      if (!isAdmin) {
        // Real visitor from main site — track the visit
        await supabaseRequest(env, "rpc/track_visit", {
          method: "POST",
          body: JSON.stringify({ p_ip: clientIp, p_date: today })
        }).catch(() => {});
      }
      
      // Always return current counts (admin needs to read them)
      const todayRows = await supabaseRequest(env, `website_visitors?visit_date=eq.${today}&select=visit_count,visitor_ip`, { method: "GET" }).catch(() => []);
      const todayVisits = Array.isArray(todayRows) ? todayRows.reduce((s, r) => s + (r.visit_count || 0), 0) : 0;
      const todayUnique = Array.isArray(todayRows) ? todayRows.length : 0;
      
      const yestRows = await supabaseRequest(env, `website_visitors?visit_date=eq.${yesterday}&select=visit_count,visitor_ip`, { method: "GET" }).catch(() => []);
      const yestVisits = Array.isArray(yestRows) ? yestRows.reduce((s, r) => s + (r.visit_count || 0), 0) : 0;
      const yestUnique = Array.isArray(yestRows) ? yestRows.length : 0;
      
      const allRows = await supabaseRequest(env, `website_visitors?select=visit_count,visitor_ip`, { method: "GET" }).catch(() => []);
      const totalVisits = Array.isArray(allRows) ? allRows.reduce((s, r) => s + (r.visit_count || 0), 0) : 0;
      const uniqueIps = new Set();
      if (Array.isArray(allRows)) {
        for (const r of allRows) { if (r.visitor_ip) uniqueIps.add(r.visitor_ip); }
      }
      
      return jsonResponse({
        success: true,
        today: todayVisits,
        todayUnique: todayUnique,
        yesterday: yestVisits,
        yesterdayUnique: yestUnique,
        total: totalVisits,
        totalUnique: uniqueIps.size,
        last7: todayVisits,
        pending: 0
      });
    } catch (e) {
      console.error("[__analytics] error:", e.message);
      return jsonResponse({ success: false, error: e.message, today: 0, todayUnique: 0, yesterday: 0, yesterdayUnique: 0, total: 0, totalUnique: 0 });
    }
  }

  // health endpoint — no GAS needed
  if (supabaseEnabled && action === "health" && request.method === "GET") {
    return jsonResponse({ success: true, ok: true, status: "healthy", timestamp: new Date().toISOString(), supabase: true });
  }

  // place_order (public POST) -> Supabase create_manual_order RPC
  if (supabaseEnabled && action === "place_order" && request.method === "POST") {
    // v18.10: Inject IP & ASN from Cloudflare request headers for fortress tracking
    if (!body.ip) body.ip = request.headers.get("cf-connecting-ip") || "";
    if (!body.country) body.country = request.headers.get("cf-ipcountry") || "";
    if (!body.asn) body.asn = request.headers.get("cf-asn") || "";
    // Also inject into body.order so placeOrderSupabase can read them
    if (body.order) {
      if (!body.order.ip) body.order.ip = body.ip;
      if (!body.order.country) body.order.country = body.country;
      if (!body.order.asn) body.order.asn = body.asn;
      // v1.0: Pass device_info through to body.order
      if (!body.order.deviceInfo && body.deviceInfo) body.order.deviceInfo = body.deviceInfo;
    }
    // v1.0: Enrich with ip-api.com city/region (HTTP works server-side, no mixed content)
    try {
      const clientIp = body.ip || request.headers.get("cf-connecting-ip") || "";
      if (clientIp && !body.city) {
        const geoResp = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,proxy,hosting`, {
          method: "GET",
          headers: { "Accept": "application/json" },
          redirect: "follow"
        });
        if (geoResp.ok) {
          const geoData = await geoResp.json();
          if (geoData.status === "success") {
            body.city = geoData.city || "";
            body.region = geoData.regionName || "";
            body.lat = geoData.lat || 0;
            body.lng = geoData.lon || 0;
            body.isp = geoData.isp || "";
            body.isProxy = geoData.proxy || false;
            body.isHosting = geoData.hosting || false;
            // Merge into device_info if present
            if (body.deviceInfo || body.order && body.order.deviceInfo) {
              const di = body.deviceInfo || (body.order ? body.order.deviceInfo : null);
              if (di) {
                di.ipCity = geoData.city || "";
                di.ipRegion = geoData.regionName || "";
                di.ipLat = geoData.lat || 0;
                di.ipLng = geoData.lon || 0;
                di.ipIsp = geoData.isp || "";
                di.isVpn = geoData.proxy || false;
                di.isDatacenter = geoData.hosting || false;
                if (body.deviceInfo) body.deviceInfo = di;
                if (body.order && body.order.deviceInfo) body.order.deviceInfo = di;
              }
            }
            // Also inject into body.order for RPC
            if (body.order) {
              if (!body.order.city) body.order.city = geoData.city || "";
              if (!body.order.region) body.order.region = geoData.regionName || "";
              if (!body.order.lat) body.order.lat = geoData.lat || 0;
              if (!body.order.lng) body.order.lng = geoData.lon || 0;
            }
          }
        }
      }
    } catch (e) {
      console.warn("[place_order] ip-api.com enrichment failed:", e.message);
    }
    try {
      const r = await placeOrderSupabase(env, body);
      if (r) {
        ctx.waitUntil(purgeCacheForAction("products", caches.default));
        return jsonResponse(r);
      }
    } catch (e) {
      console.error("[place_order] unexpected error:", e.message);
    }
    return jsonResponse({ success: false, ok: false, msg: "Order could not be processed. Missing required fields (phone, product, or items)." }, 400);
  }

  // __fortress_public_blocklist (public GET) -> blocked_devices list for client-side fortress
  if (supabaseEnabled && action === "__fortress_public_blocklist" && request.method === "GET") {
    try {
      const data = await supabaseRequest(env, "blocked_devices?select=device_id,phones_seen,ips_seen&status=eq.active", { method: "GET" });
      const devices = [];
      if (Array.isArray(data)) {
        for (const row of data) {
          if (row.device_id) devices.push(row.device_id);
          if (row.phones_seen) {
            const phones = row.phones_seen.split(",").map(s => s.trim()).filter(Boolean);
            devices.push(...phones);
          }
          if (row.ips_seen) {
            const ips = row.ips_seen.split(",").map(s => s.trim()).filter(Boolean);
            devices.push(...ips);
          }
        }
      }
      return jsonResponse({ devices: [...new Set(devices)] });
    } catch (e) {
      return jsonResponse({ devices: [], error: e.message });
    }
  }

  // __fortress_block (admin POST) -> block a device in blocked_devices table
  if (supabaseEnabled && action === "__fortress_block" && request.method === "POST") {
    try {
      const deviceId = (body.device_id || body.deviceId || "").replace(/^"|"$/g, '');
      const reason = body.reason || body.block_reason || "manual";
      const blockedBy = body.blocked_by || body.blockedBy || "admin";
      const phonesSeen = body.phones_seen || body.phonesSeen || "";
      const ipsSeen = body.ips_seen || body.ipsSeen || body.ip || "";
      if (!deviceId) return jsonResponse({ success: false, msg: "device_id required" }, 400);
      const r = await supabaseRequest(env, "blocked_devices", {
        method: "POST",
        body: JSON.stringify({
          device_id: deviceId,
          block_reason: reason,
          blocked_by: blockedBy,
          block_type: "hard",
          status: "active",
          phones_seen: phonesSeen,
          ips_seen: ipsSeen
        }),
        headers: { "Prefer": "return=representation,resolution=merge-duplicates" }
      });
      return jsonResponse({ success: true, ok: true, data: r });
    } catch (e) {
      console.error("[__fortress_block] error:", e.message);
      return jsonResponse({ success: false, msg: e.message }, 500);
    }
  }

  // __fortress_unblock (admin POST) -> unblock a device
  if (supabaseEnabled && action === "__fortress_unblock" && request.method === "POST") {
    try {
      const deviceId = (body.device_id || body.deviceId || "").replace(/^"|"$/g, '');
      if (!deviceId) return jsonResponse({ success: false, msg: "device_id required" }, 400);
      await supabaseRequest(env, "blocked_devices?device_id=eq." + encodeURIComponent(deviceId), {
        method: "PATCH",
        body: JSON.stringify({ status: "inactive", updated_at: new Date().toISOString() })
      });
      return jsonResponse({ success: true, ok: true });
    } catch (e) {
      console.error("[__fortress_unblock] error:", e.message);
      return jsonResponse({ success: false, msg: e.message }, 500);
    }
  }

  // store_info (public GET) -> Supabase settings+delivery_charges
  if (supabaseEnabled && action === "store_info" && request.method === "GET") {
    const r = await storeInfoSupabase(env);
    if (r) {
      const resp = new Response(JSON.stringify(r), {
        headers: Object.assign({
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }, corsHeaders())
      });
      return resp;
    }
  }

  // categories (public GET) -> Supabase settings
  if (supabaseEnabled && action === "categories" && request.method === "GET") {
    const r = await categoriesSupabase(env);
    if (r) {
      const resp = new Response(JSON.stringify(r), {
        headers: Object.assign({
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=" + FRESH_TTL + ", stale-while-revalidate=" + SWR_TTL
        }, corsHeaders())
      });
      return resp;
    }
  }

  // __currentMonthSnapshot (admin GET) -> Supabase monthly stats
  // FIX #32: home dashboard "This Month" was always empty
  if (supabaseEnabled && (action === "__currentmonthsnapshot" || action === "__currentMonthSnapshot" || action === "getcurrentmonthsnapshot")) {
    const r = await currentMonthSnapshotSupabase(env);
    return jsonResponse(r);
  }
  // __productAnalytics6m (admin GET) -> Supabase product analytics from transactions
  if (supabaseEnabled && (action === "__productanalytics6m" || action === "__productAnalytics6m" || action === "getproductanalytics6m")) {
    const r = await productAnalytics6mSupabase(env);
    return jsonResponse(r);
  }
  // Health / pub-cacheable: try Supabase first if enabled
  if (supabaseEnabled && PUBLIC_CACHEABLE.has(action) && request.method === "GET") {
    const cache = caches.default;
    // ✅ FIX #14: Use normalized cache key (only the action path, not the full URL with key/ts)
    // This way multiple customer requests share the same cache entry.
    const cacheKey = new Request("https://yarzclothing.xyz/?action=" + action);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const r = await handleSupabase(env, action, body, request);
    if (r) {
      const resp = new Response(JSON.stringify(r), {
        headers: Object.assign({
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=" + FRESH_TTL + ", stale-while-revalidate=" + SWR_TTL
        }, corsHeaders())
      });
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }
    // fall through to GAS
  }

  // Admin writes: try Supabase
  if (supabaseEnabled && ADMIN_ACTIONS.has(action) && request.method === "POST") {
    const r = await handleSupabase(env, action, body, request);
    if (r) {
      // After successful admin write, purge the GET cache
      ctx.waitUntil(purgeCacheForAction(action, caches.default));
      return jsonResponse(r);
    }
    // null = passthrough to GAS
  }

  // Public POSTs (subscribe_newsletter etc.): try Supabase (no cache purge)
  if (supabaseEnabled && PUBLIC_POST.has(action) && request.method === "POST") {
    const r = await handleSupabase(env, action, body, request);
    if (r) {
      return jsonResponse(r);
    }
    // null = passthrough to GAS
  }

  // FIX #40: Public GET actions that are NOT edge-cacheable (PII / dynamic) but
  // exist in ACTIONS_SUPABASE should still route to Supabase, not GAS.
  if (supabaseEnabled && request.method === "GET" && ACTIONS_SUPABASE[action] && ACTIONS_SUPABASE[action].kind !== "passthrough" && !PUBLIC_CACHEABLE.has(action)) {
    const r = await handleSupabase(env, action, body, request);
    if (r) {
      return jsonResponse(r);
    }
  }

  // Default: GAS upstream (wrapped in try/catch — if GAS_DEPLOYMENT_ID is not set, return error)
  try {
    const gasResp = await routeToGas(request, body, env, ctx);
    const headers = new Headers(gasResp.headers);
    Object.entries(corsHeaders()).forEach(function(kv){ headers.set(kv[0], kv[1]); });
    return new Response(gasResp.body, { status: gasResp.status, headers: headers });
  } catch (e) {
    console.error("[handle] fallback routeToGas failed:", e.message);
    return jsonResponse({ success: false, ok: false, msg: "Action not available: " + (action || "unknown"), error: e.message }, 400);
  }
}

async function purgeCacheForAction(action, cache) {
  // ✅ FIX #14: Use the same normalized cache key as handle() (action-only URL)
  // so the deletion actually matches the cached entries.
  const endpoints = [];
  if (action.includes("product") || action.includes("stock") || action.includes("inventory")) {
    endpoints.push("?action=products", "?action=product", "?action=store_info");
  }
  if (action.includes("order") || action.includes("sale") || action.includes("transaction")) {
    endpoints.push("?action=products", "?action=store_info");
  }
  if (action.includes("setting") || action.includes("delivery")) {
    endpoints.push("?action=store_info", "?action=delivery_charges");
  }
  await Promise.all(endpoints.map(async function(q) {
    try { await cache.delete(new Request("https://yarzclothing.xyz/" + q)); } catch (e) {}
  }));
}

// ----------------------- WEBHOOK -----------------------
// ✅ FIX #13: Purge endpoint accepts both /purge and /__purge paths.
// Auth: optional. If env.PURGE_SECRET is set, header/param must match.
// If not set, any request is allowed (dev convenience).
async function handlePurgeWebhook(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/purge" && url.pathname !== "/__purge") return null;
  // ✅ FIX #13: Handle CORS preflight (OPTIONS) immediately
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  const expected = (env && env.PURGE_SECRET) || "";
  if (expected) {
    const provided = request.headers.get("x-purge-secret") || request.headers.get("x-purge-key") || url.searchParams.get("secret") || "";
    if (provided !== expected) {
      return new Response(JSON.stringify({ success: false, error: "Invalid purge secret" }), {
        status: 401,
        headers: corsHeaders({ "Content-Type": "application/json" })
      });
    }
  }
  // If no PURGE_SECRET configured at all → allow without auth (dev convenience)
  // Best-effort: delete known cache keys (Cloudflare Workers does NOT support cache.keys())
  const cache = caches.default;
  const purgeRequests = [
    new Request("https://yarzclothing.xyz/?action=products"),
    new Request("https://yarzclothing.xyz/?action=delivery_charges"),
    new Request("https://yarzclothing.xyz/?action=store_info"),
    new Request("https://yarzclothing.xyz/?action=categories")
  ];
  let purged = 0;
  await Promise.all(purgeRequests.map(async function(r) {
    try { if (await cache.delete(r)) purged++; } catch (e) {}
  }));
  return new Response(JSON.stringify({ success: true, purged: purged, note: "best-effort (known endpoints)" }), {
    status: 200,
    headers: corsHeaders({ "Content-Type": "application/json" })
  });
}

// ----------------------- TELEGRAM WEBHOOK -----------------------
async function tgApiCall(botToken, method, body) {
  return fetch("https://api.telegram.org/bot" + botToken + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Helper: list recent orders
async function listRecentOrders(env, since) {
  try {
    let hours = 24;
    const m = String(since || "24h").match(/^(\d+)h?$/);
    if (m) hours = parseInt(m[1], 10);
    const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const r = await supabaseRequest(env, "website_orders?created_at=gt." + sinceIso + "&order=created_at.desc&limit=10&select=order_id,created_at,cust_name,cust_phone,product,size,qty,price,total,status", { method: "GET" });
    if (!Array.isArray(r) || r.length === 0) return "📭 No orders in last " + hours + "h.";
    let lines = ["📦 <b>Last " + r.length + " orders (last " + hours + "h):</b>\n"];
    for (const o of r) {
      lines.push("• <code>" + o.order_id + "</code> — " + o.product + " " + o.size + " ×" + o.qty + " = ৳" + o.total + " (" + o.status + ")");
    }
    return lines.join("\n");
  } catch (e) {
    return "❌ Error: " + e.message;
  }
}

// Helper: get order stats
async function getOrderStats(env) {
  try {
    const r = await supabaseRequest(env, "website_orders?order=created_at.desc&limit=200&select=created_at,total,status", { method: "GET" });
    if (!Array.isArray(r) || r.length === 0) return "📊 No orders yet.";
    const today = new Date(); today.setHours(0,0,0,0);
    let totalOrders = r.length;
    let todayOrders = 0, todayRevenue = 0;
    let totalRevenue = 0, pending = 0, confirmed = 0, shipped = 0, delivered = 0, cancelled = 0;
    for (const o of r) {
      const t = parseFloat(o.total || 0);
      totalRevenue += t;
      if (o.status === "Pending") pending++;
      else if (o.status === "Confirmed") confirmed++;
      else if (o.status === "Shipped") shipped++;
      else if (o.status === "Delivered") delivered++;
      else if (o.status === "Cancelled") cancelled++;
      if (new Date(o.created_at) >= today) {
        todayOrders++;
        todayRevenue += t;
      }
    }
    return "📊 <b>YARZ Stats</b>\n\n" +
      "• Total orders: " + totalOrders + "\n" +
      "• Today: " + todayOrders + " orders, ৳" + todayRevenue.toFixed(2) + "\n" +
      "• Total revenue: ৳" + totalRevenue.toFixed(2) + "\n\n" +
      "• Pending: " + pending + " | Confirmed: " + confirmed + "\n" +
      "• Shipped: " + shipped + " | Delivered: " + delivered + "\n" +
      "• Cancelled: " + cancelled;
  } catch (e) {
    return "❌ Error: " + e.message;
  }
}

async function handleTelegramWebhook(request, env) {
  const TG_BOT_TOKEN = env && env.TG_BOT_TOKEN;
  const TG_OWNER_ID = String((env && env.TG_OWNER_ID) || "6409729183");
  if (!TG_BOT_TOKEN) return new Response("Bot token not configured", { status: 500 });

  let update;
  try {
    update = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle callback_query (button clicks: confirm/cancel/shipped/delivered)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = String(cb.data || "");
    const colon = data.indexOf(":");
    const action = colon > 0 ? data.substring(0, colon) : data;
    const orderId = colon > 0 ? data.substring(colon + 1) : "";

    // Security: verify user is the owner
    if (String(cb.from.id) !== TG_OWNER_ID) {
      await tgApiCall(TG_BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: cb.id, text: "⛔ অনুমতি নেই!", show_alert: true
      });
      return new Response("ok");
    }

    const statusMap = {
      "confirm": "Processing",
      "shipped": "Shipped",
      "delivered": "Delivered",
      "cancel":  "Cancelled"
    };
    const newStatus = statusMap[action];
    if (!newStatus) {
      await tgApiCall(TG_BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: cb.id, text: "❌ Unknown action", show_alert: true
      });
      return new Response("ok");
    }
    if (!orderId) {
      await tgApiCall(TG_BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: cb.id, text: "❌ Missing order id", show_alert: true
      });
      return new Response("ok");
    }

    try {
      const now = new Date().toISOString();
      // Update order status in Supabase directly (REST PATCH)
      await supabaseRequest(
        "website_orders?order_id=eq." + encodeURIComponent(orderId),
        {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            updated_at: now,
            activity: ((cb.message && cb.message.text) || "") + " | " + newStatus + " @ " + now
          })
        }
      );
      // Answer callback query
      await tgApiCall(TG_BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: newStatus + " — " + orderId,
        show_alert: true
      });
      // Edit the original message
      if (cb.message) {
        const editText = ((cb.message.text || "") + "\n\n<b>" + newStatus + "</b> — " + now)
          .substring(0, 4096);
        await tgApiCall(TG_BOT_TOKEN, "editMessageText", {
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          text: editText
        });
      }
    } catch (e) {
      await tgApiCall(TG_BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: cb.id, text: "❌ " + e.message, show_alert: true
      });
    }
    return new Response("ok");
  }

  // Handle message commands (e.g. /start, /orders) — minimal handler
  if (update.message && update.message.text) {
    const txt = update.message.text.trim();
    const fromId = String(update.message.from.id);
    // /start: respond to anyone (so they know bot is alive)
    if (txt === "/start" || txt === "/help") {
      await tgApiCall(TG_BOT_TOKEN, "sendMessage", {
        chat_id: update.message.chat.id,
        text: "🛒 <b>YARZ Orders Bot</b>\n\n" +
              "✅ Bot is online.\n\n" +
              "Order notifications will be sent here when customers place orders on yarzclothing.xyz.\n" +
              "You'll get buttons to confirm/cancel/ship/deliver each order.\n\n" +
              "Use /whoami to see your Telegram user ID.",
        parse_mode: "HTML"
      });
    } else if (txt === "/whoami") {
      await tgApiCall(TG_BOT_TOKEN, "sendMessage", {
        chat_id: update.message.chat.id,
        text: "👤 Your Telegram user ID: <code>" + fromId + "</code>\n\n" +
              "Owner-only commands work if this ID matches TG_OWNER_ID in the worker config.\n" +
              "Current TG_OWNER_ID: <code>" + TG_OWNER_ID + "</code>",
        parse_mode: "HTML"
      });
    } else if (fromId === TG_OWNER_ID) {
      // Owner-only commands: /orders, /stats
      if (txt === "/orders" || txt.startsWith("/orders ")) {
        const since = txt.length > 7 ? txt.substring(8) : "24h";
        const orders = await listRecentOrders(env, since);
        await tgApiCall(TG_BOT_TOKEN, "sendMessage", {
          chat_id: update.message.chat.id,
          text: orders,
          parse_mode: "HTML"
        });
      } else if (txt === "/stats") {
        const stats = await getOrderStats(env);
        await tgApiCall(TG_BOT_TOKEN, "sendMessage", {
          chat_id: update.message.chat.id,
          text: stats,
          parse_mode: "HTML"
        });
      }
    }
    return new Response("ok");
  }

  return new Response("ok");
}

// ----------------------- ENTRY -----------------------
// Modern fetch handler (wrangler 4.x: env passed as 2nd arg)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // ✅ FIX #26: Serve /favicon.ico from the worker. GitHub Pages only has
    // /favicon.svg, but most browsers still request /favicon.ico by default.
    // We serve the SVG content with the correct image/svg+xml mime type so
    // modern browsers display it. This fixes the 404 in the browser console.
    if (url.pathname === "/favicon.ico") {
      try {
        const svgResp = await fetch("https://ixmaruf.github.io/Yarz/favicon.svg");
        if (svgResp.ok) {
          const svgBody = await svgResp.text();
          return new Response(svgBody, {
            status: 200,
            headers: {
              "Content-Type": "image/svg+xml; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      } catch (e) { /* fall through to 404 */ }
      return new Response("Not Found", { status: 404 });
    }
    // Webhook endpoint (Cloudflare cache purge) — supports both /purge and /__purge
    if (url.pathname === "/purge" || url.pathname === "/__purge") {
      return handlePurgeWebhook(request, env, ctx);
    }
    // Telegram webhook
    if (url.pathname === "/tg-webhook") {
      return handleTelegramWebhook(request, env, ctx);
    }
    // AI Agent routes (/agent/webhook, /agent/send, /agent/settings, /agent/test, /agent/orders/new, /agent/forward)
    if (url.pathname.startsWith("/agent/")) {
      return handleAgentRoute(request, env, ctx);
    }
    // ✅ SERVER-SIDE IP BLOCKING: Check if request IP is blocked before serving anything
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
        // v18.11: Skip IP block for admin panel requests (Origin/Referer from GitHub Pages admin)
        const reqOrigin = (request.headers.get("origin") || request.headers.get("referer") || "").toLowerCase();
        const isAdminRequest = reqOrigin.includes("ixmaruf.github.io");
        if (clientIp && clientIp !== "unknown" && !isAdminRequest) {
          const blockedCheck = await supabaseRequest(env, "blocked_devices?select=device_id&status=eq.active&device_id=eq." + encodeURIComponent(clientIp), { method: "GET" });
          if (Array.isArray(blockedCheck) && blockedCheck.length > 0) {
            return new Response(BLOCK_PAGE_HTML.replace(/{{IP}}/g, clientIp), {
              status: 403,
              headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" }
            });
          }
        }
      } catch (e) { /* don't block page load on check failure */ }
    }

    if (request.method === "GET" && isStaticRequest(url)) {
      return await fetchFromGitHubPages(request);
    }
    return handle(request, env, ctx);
  }
};

// Image handler removed in v3.7.0 — was causing edge propagation issues
// (R2 custom domain now serves images directly).

// =====================================================================
// STEADFAST COURIER INTEGRATION (Packzy API v1)
// https://portal.packzy.com/api/v1
// Auth: env.STEADFAST_API_KEY + env.STEADFAST_SECRET_KEY (set via wrangler secret put)
// =====================================================================
async function steadfastRequest(env, path, method, body) {
  const apiKey = env.STEADFAST_API_KEY;
  const secretKey = env.STEADFAST_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return { success: false, ok: false, msg: "Steadfast API keys not configured. Run: wrangler secret put STEADFAST_API_KEY / STEADFAST_SECRET_KEY" };
  }
  const url = "https://portal.packzy.com/api/v1" + path;
  try {
    const init = { method: method || "GET", headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" } };
    if (body && (method || "GET").toUpperCase() !== "GET") init.body = typeof body === "string" ? body : JSON.stringify(body);
    const resp = await fetch(url, init);
    let data;
    try { data = await resp.json(); } catch (e) { data = { raw: await resp.text().catch(function(){ return ""; }) }; }
    return { success: resp.ok, ok: resp.ok, status: resp.status, data: data };
  } catch (e) {
    return { success: false, ok: false, msg: "Steadfast request failed: " + e.message };
  }
}

async function steadfastSaveConsignments(env, rows) {
  if (!rows || !rows.length) return;
  try { await supabaseRequest(env, "steadfast_consignments", { method: "POST", body: JSON.stringify(rows) }); }
  catch (e) { console.error("[steadfastSave] error:", e.message); }
}

async function steadfastCreateOrder(env, p) {
  const r = await steadfastRequest(env, "/create_order", "POST", p);
  if (r.data && r.data.consignment) {
    const c = r.data.consignment;
    await steadfastSaveConsignments(env, [{
      consignment_id: c.consignment_id, invoice: c.invoice, tracking_code: c.tracking_code,
      recipient_name: c.recipient_name || "", recipient_phone: c.recipient_phone || "",
      recipient_address: c.recipient_address || "", cod_amount: Number(c.cod_amount) || 0,
      status: c.status || "in_review", note: c.note || "",
      api_response: JSON.stringify(r.data),
      created_at: c.created_at || new Date().toISOString(),
      updated_at: c.updated_at || new Date().toISOString()
    }]);
  }
  return r;
}

async function steadfastBulkCreate(env, p) {
  const orders = (p && (p.orders || p.data)) || (Array.isArray(p) ? p : []);
  const r = await steadfastRequest(env, "/create_order/bulk-order", "POST", { data: JSON.stringify(orders) });
  if (Array.isArray(r.data)) {
    const rows = r.data.filter(function(c){ return c && c.consignment_id; }).map(function(c){
      return {
        consignment_id: c.consignment_id, invoice: c.invoice, tracking_code: c.tracking_code,
        recipient_name: c.recipient_name || "", recipient_phone: c.recipient_phone || "",
        recipient_address: c.recipient_address || "", cod_amount: Number(c.cod_amount) || 0,
        status: c.status || (c.consignment_id ? "success" : "error"),
        note: c.note || "", api_response: JSON.stringify(c),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
    });
    await steadfastSaveConsignments(env, rows);
  }
  return r;
}

async function steadfastStatus(env, p) {
  const t = String(p.type || "cid").toLowerCase();
  const v = p.value || p.id || p.invoice || p.trackingcode || p.trackingCode;
  if (!v) return { success: false, ok: false, msg: "Missing id/invoice/trackingcode" };
  let path;
  if (t === "invoice") path = "/status_by_invoice/" + encodeURIComponent(v);
  else if (t === "trackingcode" || t === "tracking_code") path = "/status_by_trackingcode/" + encodeURIComponent(v);
  else path = "/status_by_cid/" + encodeURIComponent(v);
  const r = await steadfastRequest(env, path, "GET");
  if (r.data && r.data.delivery_status) {
    try {
      const col = t === "invoice" ? "invoice" : (t.startsWith("tracking") ? "tracking_code" : "consignment_id");
      await supabaseRequest(env, "steadfast_consignments?" + col + "=eq." + encodeURIComponent(v), {
        method: "PATCH",
        body: JSON.stringify({ status: r.data.delivery_status, updated_at: new Date().toISOString() })
      });
    } catch (e) {}
  }
  return r;
}

async function steadfastBalance(env) {
  const r = await steadfastRequest(env, "/get_balance", "GET");
  if (r.data && typeof r.data.current_balance !== "undefined") {
    try {
      await supabaseRequest(env, "steadfast_balance_cache", {
        method: "POST",
        body: JSON.stringify({ balance: Number(r.data.current_balance) || 0, fetched_at: new Date().toISOString() })
      });
    } catch (e) {}
  }
  return r;
}

async function steadfastCreateReturn(env, p) {
  return await steadfastRequest(env, "/create_return_request", "POST", p);
}

async function steadfastListReturns(env) {
  return await steadfastRequest(env, "/get_return_requests", "GET");
}

async function steadfastGetReturn(env, p) {
  const id = p && (p.id || p.return_id);
  if (!id) return { success: false, ok: false, msg: "Missing return id" };
  return await steadfastRequest(env, "/get_return_request/" + encodeURIComponent(id), "GET");
}

async function steadfastListPayments(env) {
  return await steadfastRequest(env, "/payments", "GET");
}

async function steadfastGetPayment(env, p) {
  const id = p && (p.id || p.payment_id);
  if (!id) return { success: false, ok: false, msg: "Missing payment id" };
  return await steadfastRequest(env, "/payments/" + encodeURIComponent(id), "GET");
}

async function steadfastPoliceStations(env) {
  return await steadfastRequest(env, "/police_stations", "GET");
}

async function steadfastSaveKeys(env, p) {
  const r = await getWriteDb(); await ensureAuth();
  const rows = (p.keys || [{ api_key: p.apiKey, secret_key: p.secretKey }]).map(function(k){
    return { name: k.name || "default", api_key: k.api_key || k.apiKey || "", secret_key: k.secret_key || k.secretKey || "", updated_at: new Date().toISOString() };
  });
  const up = await r.from("steadfast_keys").upsert(rows, { onConflict: "name" });
  if (up.error) throw new Error(up.error.message);
  return ok({ msg: "Keys saved", count: rows.length });
}

async function steadfastKeysList(env) {
  const r = await supabaseRequest(env, "steadfast_keys?select=name,updated_at&order=updated_at.desc", { method: "GET" });
  return { success: true, ok: true, data: r };
}

/* ============ AI AGENT CORE ============ */
// Backend brain of the multi-platform AI Agent system.
// Manages AI model calls, platform webhooks, conversation memory,
// rate limiting, human handover, and Telegram notifications.

// ----------------------- DEFAULT SETTINGS -----------------------
/** @type {object} Default AI agent settings; overridden by ai_settings row in DB. */
const DEFAULT_AI_SETTINGS = {
  active_model: 'gemini',
  platforms: { messenger: true, instagram: false, whatsapp: false, tiktok: false },
  rate_limit_per_min: 10,
  handover_keywords: ['admin', 'owner', 'human', 'মালিক', 'এডমিন'],
  delivery: { narayanganj_in: 80, narayanganj_out: 125 },
  greeting: 'আসসালামু আলাইকুম! YARZ Clothing-এ স্বাগতম। কীভাবে সাহায্য করতে পারি?',
  max_history: 20,
  model_params: {
    gemini:   { model: 'gemini-2.5-flash', max_tokens: 1024, temperature: 0.7 },
    minimax:  { model: 'MiniMax',           max_tokens: 1024, temperature: 0.7 },
    kimi:     { model: 'moonshot-v1-8k',    max_tokens: 1024, temperature: 0.7 },
    deepseek: { model: 'deepseek-chat',     max_tokens: 1024, temperature: 0.7 },
    chatgpt:  { model: 'gpt-4o-mini',       max_tokens: 1024, temperature: 0.7 },
    claude:   { model: 'claude-3-5-sonnet-20241022', max_tokens: 1024, temperature: 0.7 }
  }
};

// ----------------------- IN-MEMORY STATE -----------------------
/** @type {Map<string, number[]>} sender_id -> recent message timestamps (ms). */
const rateLimitMap = new Map();
/** @type {Map<string, Array<{role: string, message: string, created_at: string}>>} sender_id -> last N messages. */
const memoryMap = new Map();

// ----------------------- SETTINGS LOADER -----------------------
/**
 * Load AI settings from DB (ai_settings table, single row keyed by id=1) with
 * fallback to DEFAULT_AI_SETTINGS. If DB is unavailable, returns defaults.
 * @param {object} env Worker env (used to call supabaseRequest).
 * @returns {Promise<object>} Merged settings object.
 */
async function loadSettings(env) {
  try {
    if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return DEFAULT_AI_SETTINGS;
    }
    const r = await supabaseRequest(env, "ai_settings?id=eq.1&select=*", { method: "GET" });
    if (Array.isArray(r) && r.length > 0 && r[0]) {
      const db = r[0];
      const merged = Object.assign({}, DEFAULT_AI_SETTINGS, db);
      merged.platforms = Object.assign({}, DEFAULT_AI_SETTINGS.platforms, db.platforms || {});
      merged.delivery  = Object.assign({}, DEFAULT_AI_SETTINGS.delivery,  db.delivery  || {});
      merged.handover_keywords = Array.isArray(db.handover_keywords) && db.handover_keywords.length > 0
        ? db.handover_keywords
        : DEFAULT_AI_SETTINGS.handover_keywords;
      merged.model_params = Object.assign({}, DEFAULT_AI_SETTINGS.model_params, db.model_params || {});
      return merged;
    }
  } catch (e) {
    console.error("[loadSettings] failed, using defaults:", e.message);
  }
  return DEFAULT_AI_SETTINGS;
}

/**
 * Persist AI settings back to DB (single-row upsert by id=1).
 * @param {object} env Worker env.
 * @param {object} settings Settings object to save.
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function saveSettings(env, settings) {
  try {
    const payload = Object.assign({ id: 1, updated_at: new Date().toISOString() }, settings || {});
    const r = await supabaseRequest(env, "ai_settings", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify([payload])
    });
    return { success: true, data: r };
  } catch (e) {
    console.error("[saveSettings] failed:", e.message);
    return { success: false, error: e.message };
  }
}

// ----------------------- RATE LIMITER -----------------------
/**
 * Check if sender has exceeded the per-minute message limit.
 * Increments the counter on allowed requests.
 * @param {string} senderId Platform-specific user id.
 * @param {number} maxPerMin Max messages allowed in a 60s window.
 * @returns {boolean} true if rate-limited (should drop message).
 */
function isRateLimited(senderId, maxPerMin) {
  if (!senderId || !maxPerMin || maxPerMin <= 0) return false;
  const now = Date.now();
  const cutoff = now - 60000;
  const arr = (rateLimitMap.get(senderId) || []).filter(function (t) { return t > cutoff; });
  if (arr.length >= maxPerMin) {
    rateLimitMap.set(senderId, arr);
    return true;
  }
  arr.push(now);
  rateLimitMap.set(senderId, arr);
  return false;
}

// ----------------------- HUMAN HANDOVER -----------------------
/**
 * Detect whether a customer message requests human handover.
 * Matches any keyword case-insensitively as a substring.
 * @param {string} message Customer text.
 * @param {string[]} keywords List of trigger words/phrases.
 * @returns {boolean} true if handover should be triggered.
 */
function detectHandover(message, keywords) {
  if (!message || !Array.isArray(keywords) || keywords.length === 0) return false;
  const lower = String(message).toLowerCase();
  for (let i = 0; i < keywords.length; i++) {
    if (lower.includes(String(keywords[i]).toLowerCase())) return true;
  }
  return false;
}

// ----------------------- CONVERSATION MEMORY -----------------------
/**
 * Get the last N messages for a sender. Tries Supabase ai_messages table
 * first; falls back to in-memory memoryMap.
 * @param {string} senderId
 * @param {object} env
 * @param {number} limit
 * @returns {Promise<Array<{role: string, message: string, created_at: string}>>}
 */
async function getRecentMessages(senderId, env, limit) {
  const max = limit || 20;
  if (!senderId) return [];
  // Try D1 first
  try {
    if (env && env.AI_DB) {
      const stmt = env.AI_DB.prepare("SELECT role, message, created_at FROM ai_messages WHERE sender_id = ? ORDER BY id DESC LIMIT ?").bind(senderId, max);
      const res = await stmt.all();
      if (res && res.results && Array.isArray(res.results) && res.results.length > 0) {
        return res.results.reverse().map(function (m) {
          return { role: m.role, message: m.message, created_at: m.created_at };
        });
      }
    }
  } catch (e) {
    console.error("[getRecentMessages] D1 fallback:", e.message);
  }
  // Try Supabase
  try {
    if (env && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const r = await supabaseRequest(env,
        "ai_messages?sender_id=eq." + encodeURIComponent(senderId) +
        "&order=created_at.desc&limit=" + max + "&select=role,message,created_at",
        { method: "GET" }
      );
      if (Array.isArray(r) && r.length > 0) {
        // Return in chronological order (oldest first)
        return r.reverse().map(function (m) {
          return { role: m.role, message: m.message, created_at: m.created_at };
        });
      }
    }
  } catch (e) {
    console.error("[getRecentMessages] DB fallback:", e.message);
  }
  // Fallback to memoryMap
  const arr = memoryMap.get(senderId) || [];
  return arr.slice(-max);
}

/**
 * Save a single chat message. Tries Supabase; also updates in-memory fallback.
 * @param {string} senderId
 * @param {string} platform One of: messenger, instagram, whatsapp, tiktok.
 * @param {string} role "user" or "assistant".
 * @param {string} message Text content.
 * @param {object} env
 * @returns {Promise<void>}
 */
async function saveMessage(senderId, platform, role, message, env) {
  if (!senderId || !role) return;
  const row = {
    sender_id: senderId,
    platform:  platform || "unknown",
    role:      role,
    message:   String(message || "").substring(0, 8000), // cap length
    created_at: new Date().toISOString()
  };
  // Try D1 first
  try {
    if (env && env.AI_DB) {
      await env.AI_DB.prepare("INSERT INTO ai_messages (sender_id, platform, role, message, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(row.sender_id, row.platform, row.role, row.message, row.created_at)
        .run();
    }
  } catch (e) {
    console.error("[saveMessage] D1 save failed:", e.message);
  }
  // Try Supabase
  try {
    if (env && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      await supabaseRequest(env, "ai_messages", {
        method: "POST",
        body: JSON.stringify(row)
      });
    }
  } catch (e) {
    console.error("[saveMessage] DB save failed:", e.message);
  }
  // Always update in-memory fallback (cap to last 40)
  const arr = memoryMap.get(senderId) || [];
  arr.push({ role: row.role, message: row.message, created_at: row.created_at });
  if (arr.length > 40) arr.splice(0, arr.length - 40);
  memoryMap.set(senderId, arr);
}

// ----------------------- SYSTEM PROMPT BUILDER -----------------------
/**
 * Build the system prompt that instructs the AI to behave as a human moderator.
 * @param {object} settings AI settings (delivery, model, etc.).
 * @param {string} [inventorySummary] Optional summary of in-stock products.
 * @returns {string} The system prompt text.
 */
function buildSystemPrompt(settings, inventorySummary) {
  const deliv = (settings && settings.delivery) || DEFAULT_AI_SETTINGS.delivery;
  const inv = inventorySummary || "YARZ Clothing-এর বর্তমানে বিভিন্ন সাইজের (S, M, L, XL, XXL, 3XL) প্রিমিয়াম পোশাক স্টকে আছে।";
  return [
    'তুমি হলে YARZ Clothing-এর "Support Admin" (সাপোর্ট এডমিন)।',
    'গুরুত্বপূর্ণ: কখনো বলবে না যে তুমি AI, রোবট, বা চ্যাটবট। তুমি একজন রক্ত-মাংসের মানুষ সাপোর্ট এডমিন হিসেবে কথা বলবে।',
    '',
    'ব্র্যান্ড পরিচিতি:',
    '- আমাদের কোনো ফিজিক্যাল দোকান বা শোরুম নেই। আমরা সম্পূর্ণ অনলাইন-ভিত্তিক ব্র্যান্ড এবং আমরা আমাদের নিজেদের প্রোডাক্ট প্রোডাকশন (তৈরি) করি।',
    '- আমাদের অফিসিয়াল ওয়েবসাইট: https://yarzclothing.xyz (yarzclothing.com নয়)।',
    '',
    'ওয়েবসাইট সাজেস্ট করা:',
    '- কাস্টমার যদি কোনো প্রোডাক্ট বা কালেকশন সম্পর্কে জানতে চায়, তবে তাকে সুন্দর করে বলবে: "আপনি আমাদের ওয়েবসাইটে (yarzclothing.xyz) সব প্রোডাক্ট দেখতে পাবেন। আপনার কোন সাইজটি দরকার, তা সরাসরি আমাদের ওয়েবসাইট থেকেই অর্ডার করতে পারবেন।"',
    '',
    'লিংক এবং ছবি (Context):',
    '- যদি কাস্টমার কোনো প্রোডাক্টের লিংক বা ছবি দেয়, সিস্টেম অটোমেটিকভাবে সেই লিংক বা ছবির ভেতরের তথ্য (যেমন: দাম, সাইজ, নাম) এক্সট্রাক্ট করে তোমাকে প্রম্পটে দিয়ে দেবে।',
    '- তুমি সেই দেওয়া তথ্য ব্যবহার করে একদম মানুষের মতো কাস্টমারকে প্রোডাক্টের দাম, সাইজ ও স্টক সম্পর্কে জানাবে এবং তাকে অর্ডার করতে বলবে। কখনো বলবে না যে তুমি লিংক ভিজিট করতে পারো না বা ছবি দেখতে পারো না। তুমি বলবে "হ্যাঁ, আমি ছবিটি/লিংকটি দেখেছি, এটির দাম..."',
    '',
    'ভাষা: প্রধানত বাংলায় কথা বলবে। প্রয়োজনে ইংরেজি বা বাংলা+ইংরেজি মিক্স ব্যবহার করতে পারো।',
    'টোন: উষ্ণ, পেশাদার, সংক্ষিপ্ত কিন্তু সহায়ক। অপ্রয়োজনীয় লম্বা মেসেজ লিখবে না। কাস্টমারের সাথে সুন্দর করে কথা বলে অর্ডার নেওয়ার চেষ্টা করবে।',
    '',
    'ইনভেন্টরি (স্টকে আছে):',
    inv,
    '',
    'অর্ডার নেওয়ার নিয়ম:',
    '1. যখন কেউ অর্ডার/কেনাকাটা করতে চাইবে, তখন নিচের ফরম্যাটে তথ্য চাইবে (বাংলায়):',
    '   Name:',
    '   Phone Number:',
    '   Full Address:',
    '   Product Size:',
    '   Quantity:',
    '2. কাস্টমার সব তথ্য দিলে নিচের ফরম্যাটে কনফার্মেশন দেবে:',
    '   Name: ...',
    '   Phone Number: ...',
    '   Full Address: ...',
    '   Product: ...',
    '   Size: ...',
    '   Quantity: ...',
    '   Price: ৳...',
    '   Delivery Charge: ৳' + deliv.narayanganj_in + ' (নারায়ণগঞ্জের ভিতরে) অথবা ৳' + deliv.narayanganj_out + ' (নারায়ণগঞ্জের বাইরে)',
    '   Total: ৳...',
    '3. ডেলিভারি চার্জ নির্ধারণ: ঠিকানায় "নারায়ণগঞ্জ" শব্দ থাকলে ভিতরে (৳' + deliv.narayanganj_in + '), না থাকলে বাইরে (৳' + deliv.narayanganj_out + ')।',
    '',
    'সাধারণ নিয়ম:',
    '- প্রোডাক্ট, সাইজ, দাম সম্পর্কে প্রশ্নের উত্তর দাও।',
    '- স্টক না থাকলে জানাও এবং কাছাকাছি বিকল্প সাজেস্ট করো।',
    '- দাম বা স্টক নিশ্চিত না হলে বলো "আমি একটু চেক করে জানাচ্ছি"।',
    '- কাস্টমার "এডমিন/মালিক/owner" বলে ডাকলে মেসেজ ফরওয়ার্ড করো (তুমি বলবে "আপনার মেসেজ মডারেটর টিমকে পাঠানো হয়েছে")।',
    '- কখনো নিজে AI বা চ্যাটবট বলে পরিচয় দিও না।',
    '- একই মেসেজ বারবার দিও না; সংক্ষেপে ও স্পষ্টভাবে উত্তর দাও।'
  ].join('\n');
}

// ----------------------- AI MODEL ADAPTERS -----------------------
/**
 * Normalize memory messages to OpenAI-style {role, content} array.
 * @param {Array<{role: string, message: string}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
function toOpenAIMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(function (m) {
    return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.message || "") };
  });
}

/**
 * Internal fetch wrapper for OpenAI-compatible chat APIs. Returns string reply or {error}.
 * @param {string} url API endpoint
 * @param {string} apiKey Bearer token
 * @param {string} model Model name to send
 * @param {Array<{role: string, content: string}>} oaMessages Normalized messages
 * @param {object} params {max_tokens, temperature}
 * @returns {Promise<string|{error: string}>}
 */
async function callOpenAICompat(url, apiKey, model, oaMessages, params) {
  if (!apiKey) return { error: "API key not configured" };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: oaMessages,
        max_tokens: (params && params.max_tokens) || 1024,
        temperature: (params && params.temperature != null) ? params.temperature : 0.7
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      const errMsg = (data && data.error && (data.error.message || data.error.code || data.error)) || data.message || ("HTTP " + resp.status);
      return { error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg) };
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return text ? String(text).trim() : { error: "Empty response" };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Call Google Gemini API (gemini-2.5-flash by default).
 * @param {Array<{role: string, message: string}>} messages
 * @param {string} systemPrompt
 * @param {string} apiKey
 * @param {object} params
 * @returns {Promise<string|{error: string}>}
 */
/**
 * Download a media file and return its base64 data + MIME type.
 * Used for sending images/audio to Gemini multimodal API.
 * @param {string} url The URL to download
 * @returns {Promise<{base64: string, mimeType: string}|null>}
 */
async function downloadMediaAsBase64(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("[downloadMedia] HTTP " + resp.status + " for " + url.substring(0, 100));
      return null;
    }
    const ct = resp.headers.get("content-type") || "application/octet-stream";
    const buf = await resp.arrayBuffer();
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    // Determine MIME type
    let mimeType = ct.split(";")[0].trim();
    if (!mimeType || mimeType === "application/octet-stream") {
      if (url.includes(".jpg") || url.includes(".jpeg")) mimeType = "image/jpeg";
      else if (url.includes(".png")) mimeType = "image/png";
      else if (url.includes(".webp")) mimeType = "image/webp";
      else if (url.includes(".mp4")) mimeType = "audio/mp4";
      else if (url.includes(".ogg")) mimeType = "audio/ogg";
      else if (url.includes(".wav")) mimeType = "audio/wav";
      else mimeType = "image/jpeg"; // fallback
    }
    console.log("[downloadMedia] OK mimeType=" + mimeType + " size=" + bytes.length);
    return { base64: base64, mimeType: mimeType };
  } catch (e) {
    console.error("[downloadMedia] ERROR: " + e.message);
    return null;
  }
}

async function callGemini(messages, systemPrompt, apiKey, params, mediaOpts) {
  if (!apiKey) return { error: "Gemini API key not configured" };
  try {
    const contents = (Array.isArray(messages) ? messages : []).map(function (m, idx) {
      const parts = [{ text: String(m.message || "") }];
      // For the LAST user message, attach media if provided
      if (idx === messages.length - 1 && m.role === "user" && mediaOpts) {
        if (mediaOpts.imageData) {
          parts.push({
            inline_data: {
              mime_type: mediaOpts.imageData.mimeType,
              data: mediaOpts.imageData.base64
            }
          });
        }
        if (mediaOpts.audioData) {
          parts.push({
            inline_data: {
              mime_type: mediaOpts.audioData.mimeType,
              data: mediaOpts.audioData.base64
            }
          });
        }
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: parts
      };
    });
    const body = {
      contents: contents,
      systemInstruction: { parts: [{ text: String(systemPrompt || "") }] },
      generationConfig: {
        maxOutputTokens: (params && params.max_tokens) || 1024,
        temperature: (params && params.temperature != null) ? params.temperature : 0.7
      }
    };
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      ((params && params.model) || "gemini-2.5-flash") +
      ":generateContent?key=" + encodeURIComponent(apiKey);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      const errMsg = (data && data.error && data.error.message) || ("HTTP " + resp.status);
      return { error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg) };
    }
    const text = data && data.candidates && data.candidates[0] &&
                 data.candidates[0].content && data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    return text ? String(text).trim() : { error: "Empty Gemini response" };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Call Anthropic Claude API (messages endpoint).
 * @param {Array<{role: string, content: string}>} oaMessages
 * @param {string} systemPrompt
 * @param {string} apiKey
 * @param {object} params
 * @returns {Promise<string|{error: string}>}
 */
async function callClaude(oaMessages, systemPrompt, apiKey, params) {
  if (!apiKey) return { error: "Claude API key not configured" };
  try {
    const msgs = (Array.isArray(oaMessages) ? oaMessages : []).map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") };
    });
    const body = {
      model: (params && params.model) || "claude-3-5-sonnet-20241022",
      max_tokens: (params && params.max_tokens) || 1024,
      system: String(systemPrompt || ""),
      messages: msgs,
      temperature: (params && params.temperature != null) ? params.temperature : 0.7
    };
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      const errMsg = (data && data.error && data.error.message) || ("HTTP " + resp.status);
      return { error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg) };
    }
    if (Array.isArray(data && data.content)) {
      const parts = data.content.filter(function (b) { return b && b.type === "text" && b.text; });
      const text = parts.map(function (b) { return b.text; }).join("\n");
      return text ? text.trim() : { error: "Empty Claude response" };
    }
    return { error: "Unexpected Claude response shape" };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Dispatcher: call the configured AI model with messages + system prompt.
 * @param {string} modelName One of: gemini, minimax, kimi, deepseek, chatgpt, claude.
 * @param {Array<{role: string, message: string}>} messages
 * @param {string} systemPrompt
 * @param {object} env Worker env (provides API keys).
 * @param {object} [params] Optional model_params override.
 * @returns {Promise<string|{error: string}>}
 */
async function callAIModel(modelName, messages, systemPrompt, env, params, mediaOpts) {
  const m = String(modelName || "").toLowerCase();
  const oa = toOpenAIMessages(messages);
  const mp = (params && params.model_params) || (DEFAULT_AI_SETTINGS.model_params[m]) || {};
  switch (m) {
    case "gemini":
      return await callGemini(messages, systemPrompt, env.GEMINI_API_KEY, mp, mediaOpts);
    case "claude":
      return await callClaude(oa, systemPrompt, env.CLAUDE_API_KEY, mp);
    case "minimax":
      return await callOpenAICompat("https://api.MiniMax.chat/v1/text/chatcompletion_v2", env.MINIMAX_API_KEY, mp.model, oa, mp);
    case "kimi":
      return await callOpenAICompat("https://api.moonshot.cn/v1/chat/completions", env.KIMI_API_KEY || env.MOONSHOT_API_KEY, mp.model, oa, mp);
    case "deepseek":
      return await callOpenAICompat("https://api.deepseek.com/v1/chat/completions", env.DEEPSEEK_API_KEY, mp.model, oa, mp);
    case "chatgpt":
      return await callOpenAICompat("https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY || env.CHATGPT_API_KEY, mp.model, oa, mp);
    default:
      return { error: "Unknown model: " + modelName };
  }
}

// ----------------------- TELEGRAM HELPER -----------------------
/**
 * Send a message to the configured Telegram chat (for handover / order notifications).
 * @param {object} env Worker env.
 * @param {string} text Plain or HTML text (max 4096 chars).
 * @param {object} [opts] Optional {parse_mode: 'HTML'|'Markdown', chat_id: override}.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function notifyTelegram(env, text, opts) {
  const token = env && env.TELEGRAM_BOT_TOKEN;
  const chatId = (opts && opts.chat_id) || (env && env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return { success: false, error: "Telegram not configured" };
  try {
    const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").substring(0, 4096),
        parse_mode: (opts && opts.parse_mode) || "HTML"
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || (data && data.ok === false)) {
      return { success: false, error: (data && data.description) || ("HTTP " + resp.status) };
    }
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Forward a handover message to Telegram.
 * @param {object} env
 * @param {{senderId: string, platform: string, message: string, customerName?: string}} info
 * @returns {Promise<void>}
 */
async function forwardToTelegram(env, info) {
  const customerName = info.customerName || "Unknown";
  const platform = info.platform || "unknown";
  const senderId = info.senderId || "";
  const text = [
    "🔔 <b>Human Handover Request</b>",
    "Platform: <code>" + platform + "</code>",
    "Customer: <code>" + customerName + "</code>",
    "Sender ID: <code>" + senderId + "</code>",
    "",
    "Message:",
    String(info.message || "").substring(0, 2000)
  ].join("\n");
  await notifyTelegram(env, text, { parse_mode: "HTML" });
}

// ----------------------- PLATFORM SENDERS -----------------------
/**
 * Send a Messenger reply via Meta Send API.
 * @param {object} env
 * @param {string} recipientId PSID
 * @param {string} text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendMessengerReply(env, recipientId, text) {
  const token = env.MESSENGER_PAGE_TOKEN;
  console.log("[sendMessengerReply] tokenPresent=" + !!token + " recipient=" + recipientId + " textLen=" + (text || "").length);
  if (!token) {
    console.error("[sendMessengerReply] MESSENGER_PAGE_TOKEN NOT SET");
    return { success: false, error: "Messenger token not configured" };
  }
  try {
    const resp = await fetch("https://graph.facebook.com/v18.0/me/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: String(text || "").substring(0, 2000) }
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    console.log("[sendMessengerReply] status=" + resp.status + " ok=" + resp.ok + " error=" + JSON.stringify(data && data.error));
    if (!resp.ok || (data && data.error)) {
      return { success: false, error: (data && data.error && (data.error.message || data.error.code)) || ("HTTP " + resp.status) };
    }
    return { success: true, data: data };
  } catch (e) {
    console.error("[sendMessengerReply] EXCEPTION: " + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Send an Instagram reply via Meta Send API (same graph endpoint as Messenger,
 * different access token and recipient.id semantics).
 * @param {object} env
 * @param {string} recipientId IGSID
 * @param {string} text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendInstagramReply(env, recipientId, text) {
  const token = env.INSTAGRAM_PAGE_TOKEN;
  if (!token) return { success: false, error: "Instagram token not configured" };
  try {
    const resp = await fetch("https://graph.facebook.com/v18.0/me/messages?access_token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: String(text || "").substring(0, 2000) }
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || (data && data.error)) {
      return { success: false, error: (data && data.error && (data.error.message || data.error.code)) || ("HTTP " + resp.status) };
    }
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Send a WhatsApp reply via Meta Cloud API.
 * @param {object} env
 * @param {string} recipientPhone E.164 phone (e.g. +8801...)
 * @param {string} text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendWhatsAppReply(env, recipientPhone, text) {
  const token = env.WHATSAPP_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { success: false, error: "WhatsApp not configured" };
  try {
    const resp = await fetch("https://graph.facebook.com/v18.0/" + encodeURIComponent(phoneId) + "/messages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientPhone,
        type: "text",
        text: { body: String(text || "").substring(0, 4000) }
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || (data && data.error)) {
      return { success: false, error: (data && data.error && (data.error.message || data.error.code)) || ("HTTP " + resp.status) };
    }
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Send a TikTok reply (TikTok Messaging API is closed-beta and may change).
 * @param {object} env
 * @param {string} recipientId Open ID / Conversation ID
 * @param {string} text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendTikTokReply(env, recipientId, text) {
  const token = env.TIKTOK_ACCESS_TOKEN;
  if (!token) return { success: false, error: "TikTok access token not configured" };
  try {
    const resp = await fetch("https://open.tiktokapis.com/v2/message/send/", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { conversation_id: recipientId },
        message: { type: "text", text: String(text || "").substring(0, 4000) }
      })
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || (data && data.error)) {
      const errMsg = data && (typeof data.error === "string" ? data.error : (data.error.message || data.error.code));
      return { success: false, error: errMsg || ("HTTP " + resp.status) };
    }
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ----------------------- URL / LINK CONTEXT HELPERS -----------------------
/**
 * Extract all URLs from a text string.
 * @param {string} text
 * @returns {string[]} Array of URLs found
 */
function extractUrls(text) {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  return (text.match(urlRegex) || []).map(function (u) { return u.replace(/[.,;:!?]+$/, ""); });
}

/**
 * Fetch product info from a yarzclothing.xyz product URL.
 * @param {string} productSlug The product slug from the URL
 * @returns {Promise<string|null>} Product summary or null
 */
async function fetchYarzProductInfo(productSlug) {
  if (!productSlug) return null;
  try {
    const apiUrl = "https://yarzclothing.xyz/?action=product&slug=" + encodeURIComponent(productSlug);
    const resp = await fetch(apiUrl, { headers: { "Accept": "application/json" } });
    if (!resp.ok) return null;
    const data = await resp.json().catch(function () { return null; });
    if (!data || !data.data) return null;
    const p = data.data;
    const parts = [];
    parts.push("📦 প্রোডাক্ট: " + (p.name || p.product || productSlug));
    if (p.price) parts.push("💰 দাম: ৳" + p.price);
    if (p.sale_price) parts.push("🏷️ সেল প্রাইস: ৳" + p.sale_price);
    if (p.sizes || p.available_sizes) parts.push("📏 সাইজ: " + (p.sizes || p.available_sizes));
    if (p.category) parts.push("📂 ক্যাটাগরি: " + p.category);
    if (p.description) parts.push("📝 বিবরণ: " + String(p.description).substring(0, 300));
    if (p.stock_status) parts.push("📊 স্টক: " + p.stock_status);
    if (p.status) parts.push("স্ট্যাটাস: " + p.status);
    return parts.join("\n");
  } catch (e) {
    console.error("[fetchYarzProduct] ERROR: " + e.message);
    return null;
  }
}

/**
 * Fetch a summary/title from any external URL.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchExternalLinkSummary(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "YARZ-Agent/1.0", "Accept": "text/html" },
      redirect: "follow"
    });
    if (!resp.ok) return "🔗 লিংক: " + url + " (ওপেন করা যায়নি)";
    const html = await resp.text();
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const desc = descMatch ? descMatch[1].trim() : "";
    if (title || desc) {
      return "🔗 লিংক: " + url + "\n📄 টাইটেল: " + (title || "N/A") + (desc ? "\n📝 বিবরণ: " + desc.substring(0, 200) : "");
    }
    return "🔗 লিংক: " + url;
  } catch (e) {
    console.error("[fetchExternal] ERROR: " + e.message);
    return "🔗 লিংক: " + url;
  }
}

/**
 * Detect and fetch context for any URLs found in a customer message.
 * Supports yarzclothing.xyz product links and general external URLs.
 * @param {string} text Customer message text
 * @returns {Promise<string>} Context string to append to message
 */
async function fetchLinkContext(text) {
  const urls = extractUrls(text);
  if (urls.length === 0) return "";
  const contextParts = [];
  for (const url of urls.slice(0, 3)) { // Max 3 links to avoid timeout
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === "yarzclothing.xyz" || urlObj.hostname === "www.yarzclothing.xyz") {
        // Check for product slug in query params or path
        const productSlug = urlObj.searchParams.get("product") || urlObj.searchParams.get("slug") || "";
        if (productSlug) {
          const info = await fetchYarzProductInfo(productSlug);
          if (info) {
            contextParts.push(info);
            continue;
          }
        }
        // If no specific product, try to get products list context
        contextParts.push("🔗 কাস্টমার YARZ ওয়েবসাইটের একটি লিংক পাঠিয়েছে: " + url);
      } else {
        // External URL - fetch title/description
        const summary = await fetchExternalLinkSummary(url);
        if (summary) contextParts.push(summary);
      }
    } catch (e) {
      contextParts.push("🔗 লিংক: " + url);
    }
  }
  return contextParts.length > 0 ? "\n\n--- কাস্টমারের পাঠানো লিংকের তথ্য ---\n" + contextParts.join("\n\n") : "";
}

// ----------------------- MAIN AGENT HANDLER -----------------------
/**
 * Main agent dispatcher. Takes a normalized message envelope, applies rate-limit
 * / handover / platform-toggle checks, calls the AI model, persists memory,
 * and returns a structured reply.
 * @param {object} env
 * @param {{senderId: string, platform: string, message: string, imageUrl?: string, audioUrl?: string, customerName?: string}} input
 * @returns {Promise<{reply: string|null, reason?: string, error?: string}>}
 */
async function handleAgentMessage(env, input) {
  const senderId = input && input.senderId;
  const platform = String((input && input.platform) || "").toLowerCase();
  const message = String((input && input.message) || "").trim();
  if (!senderId || !platform || !message) {
    return { reply: null, reason: "invalid_input" };
  }
  let settings;
  try {
    settings = await loadSettings(env);
  } catch (e) {
    return { reply: null, reason: "settings_error", error: e.message };
  }
  // Platform toggle
  if (!settings.platforms || !settings.platforms[platform]) {
    return { reply: null, reason: "platform_off" };
  }
  // Rate limit
  if (isRateLimited(senderId, settings.rate_limit_per_min || 10)) {
    return { reply: null, reason: "rate_limited" };
  }
  // Human handover
  if (detectHandover(message, settings.handover_keywords)) {
    try {
      await forwardToTelegram(env, {
        senderId: senderId,
        platform: platform,
        message: message,
        customerName: (input && input.customerName) || ""
      });
    } catch (e) {
      console.error("[handover] forward failed:", e.message);
    }
    const handoverReply = "আপনার মেসেজ আমাদের মডারেটরের কাছে পাঠানো হয়েছে। শিঘ্রই উত্তর দেওয়া হবে।";
    await saveMessage(senderId, platform, "user", message, env);
    await saveMessage(senderId, platform, "assistant", handoverReply, env);
    return { reply: handoverReply, reason: "handover" };
  }

  // --- Fetch link context from URLs in customer message ---
  let enrichedMessage = message;
  try {
    const linkCtx = await fetchLinkContext(message);
    if (linkCtx) {
      enrichedMessage = message + linkCtx;
      console.log("[Agent] Link context added: " + linkCtx.substring(0, 200));
    }
  } catch (e) {
    console.error("[Agent] Link fetch failed: " + e.message);
  }

  // --- Download media for multimodal AI ---
  let mediaOpts = null;
  const imageUrl = input && input.imageUrl;
  const audioUrl = input && input.audioUrl;
  if (imageUrl || audioUrl) {
    mediaOpts = {};
    if (imageUrl) {
      console.log("[Agent] Downloading image: " + imageUrl.substring(0, 100));
      mediaOpts.imageData = await downloadMediaAsBase64(imageUrl);
    }
    if (audioUrl) {
      console.log("[Agent] Downloading audio: " + audioUrl.substring(0, 100));
      mediaOpts.audioData = await downloadMediaAsBase64(audioUrl);
    }
    // If no media could be downloaded, set to null
    if (!mediaOpts.imageData && !mediaOpts.audioData) mediaOpts = null;
  }

  // Load history
  let history = [];
  try {
    history = await getRecentMessages(senderId, env, settings.max_history || 20);
  } catch (e) {
    console.error("[history] load failed:", e.message);
  }
  const messages = history.concat([{ role: "user", message: enrichedMessage }]);
  // Call AI (pass media for multimodal models)
  const sys = buildSystemPrompt(settings);
  const aiResp = await callAIModel(settings.active_model, messages, sys, env, null, mediaOpts);
  if (!aiResp || typeof aiResp !== "string") {
    const err = (aiResp && aiResp.error) || "Unknown AI error";
    return { reply: null, reason: "ai_error", error: err };
  }
  // Persist
  await saveMessage(senderId, platform, "user", message, env);
  await saveMessage(senderId, platform, "assistant", aiResp, env);
  return { reply: aiResp };
}

// ----------------------- PLATFORM WEBHOOK HANDLERS -----------------------
/**
 * Handle Meta Messenger webhook (POST). Expected payload: standard Meta webhook
 * envelope with entry[].messaging[] containing sender.id and message.text.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleMessengerWebhook(request, env) {
  // Facebook webhook verification (GET request)
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = (env && env.META_VERIFY_TOKEN) || "";
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  let payload;
  try { payload = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const entries = (payload && payload.entry) || [];
  const results = [];
  console.log("[MessengerWebhook] entries=" + entries.length + " body=" + JSON.stringify(payload).substring(0, 500));
  for (const entry of entries) {
    const events = entry.messaging || [];
    for (const ev of events) {
      const senderId = ev.sender && ev.sender.id;
      const msg = ev.message;
      console.log("[MessengerWebhook] senderId=" + senderId + " msgExists=" + !!msg + " msgKeys=" + (msg ? Object.keys(msg).join(",") : "none"));
      if (!senderId || !msg) continue;

      // --- Parse all attachment types (image, audio/voice, video, file) ---
      let imageUrl = "";
      let audioUrl = "";
      let attachmentType = "";
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          const type = (att.type || "").toLowerCase();
          const url = (att.payload && att.payload.url) || "";
          if (type === "image" && url && !imageUrl) {
            imageUrl = url;
            attachmentType = "image";
          } else if ((type === "audio" || type === "voice") && url && !audioUrl) {
            audioUrl = url;
            attachmentType = attachmentType || "audio";
          } else if (type === "video" && url && !imageUrl) {
            // Treat video thumbnail as image context
            imageUrl = url;
            attachmentType = attachmentType || "video";
          }
        }
      }

      // Build the text message for the AI
      let text = msg.text || "";
      if (!text && imageUrl) text = "[কাস্টমার একটি ছবি পাঠিয়েছে। ছবিটি দেখে উত্তর দিন।]";
      if (!text && audioUrl) text = "[কাস্টমার একটি ভয়েস মেসেজ পাঠিয়েছে। শুনে উত্তর দিন।]";
      if (!text) text = "[কাস্টমার একটি অ্যাটাচমেন্ট পাঠিয়েছে]";

      console.log("[MessengerWebhook] text=" + text.substring(0, 200) + " imageUrl=" + (imageUrl ? "yes" : "no") + " audioUrl=" + (audioUrl ? "yes" : "no"));

      const r = await handleAgentMessage(env, {
        senderId: senderId,
        platform: "messenger",
        message: text,
        imageUrl: imageUrl || undefined,
        audioUrl: audioUrl || undefined,
        customerName: ""
      });
      console.log("[MessengerWebhook] agentReply=" + (r.reply || "").substring(0, 200) + " reason=" + r.reason + " err=" + r.error);
      if (r && r.reply) {
        const sendResult = await sendMessengerReply(env, senderId, r.reply);
        console.log("[MessengerWebhook] sendResult=" + JSON.stringify(sendResult));
      }
      results.push({ sender_id: senderId, reply: r.reply, reason: r.reason || null });
    }
  }
  return jsonResponse({ success: true, data: results });
}

/**
 * Handle Instagram webhook (POST). Same envelope shape as Messenger.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleInstagramWebhook(request, env) {
  // Instagram webhook verification (GET request)
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = (env && env.META_VERIFY_TOKEN) || "";
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  let payload;
  try { payload = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const entries = (payload && payload.entry) || [];
  const results = [];
  for (const entry of entries) {
    const events = entry.messaging || [];
    for (const ev of events) {
      const senderId = ev.sender && ev.sender.id;
      const msg = ev.message;
      if (!senderId || !msg) continue;
      const text = msg.text || "";
      const r = await handleAgentMessage(env, {
        senderId: senderId,
        platform: "instagram",
        message: text,
        customerName: ""
      });
      if (r && r.reply) {
        await sendInstagramReply(env, senderId, r.reply);
      }
      results.push({ sender_id: senderId, reply: r.reply, reason: r.reason || null });
    }
  }
  return jsonResponse({ success: true, data: results });
}

/**
 * Handle WhatsApp Cloud API webhook (POST). Payload shape:
 *   entry[0].changes[0].value.messages[] with from + text.body.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleWhatsAppWebhook(request, env) {
  // WhatsApp webhook verification (GET request)
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = (env && env.META_VERIFY_TOKEN) || "";
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  let payload;
  try { payload = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const changes = (((payload || {}).entry || [])[0] || {}).changes || [];
  const results = [];
  for (const ch of changes) {
    const value = ch.value || {};
    const messages = value.messages || [];
    const contactName = (((value.contacts || [])[0] || {}).profile || {}).name || "";
    for (const m of messages) {
      const senderId = m.from; // phone number
      const text = (m.text && m.text.body) || "";
      if (!senderId || !text) continue;
      const r = await handleAgentMessage(env, {
        senderId: senderId,
        platform: "whatsapp",
        message: text,
        customerName: contactName
      });
      if (r && r.reply) {
        await sendWhatsAppReply(env, senderId, r.reply);
      }
      results.push({ sender_id: senderId, reply: r.reply, reason: r.reason || null });
    }
  }
  return jsonResponse({ success: true, data: results });
}

/**
 * Handle TikTok Messaging webhook (POST). Envelope shape is best-effort and
 * may evolve as the TikTok Messaging API exits closed beta.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleTikTokWebhook(request, env) {
  // TikTok webhook verification (GET request)
  if (request.method === "GET") {
    const url = new URL(request.url);
    const challenge = url.searchParams.get("challenge");
    if (challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  let payload;
  try { payload = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const events = (payload && (payload.events || payload.messages)) || [];
  const results = [];
  for (const ev of events) {
    const senderId = (ev.sender && (ev.sender.open_id || ev.sender.id)) || ev.conversation_id;
    const msg = ev.message || ev;
    const text = (msg && (msg.text || (msg.content && msg.content.text))) || "";
    if (!senderId || !text) continue;
    const r = await handleAgentMessage(env, {
      senderId: senderId,
      platform: "tiktok",
      message: text,
      customerName: (ev.sender && ev.sender.display_name) || ""
    });
    if (r && r.reply) {
      await sendTikTokReply(env, senderId, r.reply);
    }
    results.push({ sender_id: senderId, reply: r.reply, reason: r.reason || null });
  }
  return jsonResponse({ success: true, data: results });
}

// ----------------------- AGENT ORDER / FORWARD HANDLERS -----------------------
/**
 * Save a new order to Supabase (website_orders table) and notify Telegram.
 * @param {object} env
 * @param {object} order {order_id?, sender_id, platform, cust_name, cust_phone, cust_addr, deliv_zone, product, size, qty, price, delivery_charge, total?}
 * @returns {Promise<{success: boolean, orderId?: string, error?: string}>}
 */
async function createAgentOrder(env, order) {
  const orderId = (order && order.order_id) || ("AGT-" + Date.now() + "-" + Math.floor(Math.random() * 10000));
  const row = {
    order_id: orderId,
    cust_name: (order && order.cust_name) || "",
    cust_phone: (order && order.cust_phone) || "",
    cust_addr: (order && order.cust_addr) || "",
    product: (order && order.product) || "",
    size: (order && order.size) || "",
    qty: Number(order && order.qty) || 1,
    price: Number(order && order.price) || 0,
    delivery_charge: Number(order && order.delivery_charge) || 0,
    total: Number(order && order.total) ||
           ((Number(order && order.price) || 0) * (Number(order && order.qty) || 1) + (Number(order && order.delivery_charge) || 0)),
    status: "Pending",
    payment: (order && order.payment) || "Cash on Delivery",
    notes: (order && order.notes) || ("AI Agent order from " + ((order && order.platform) || "unknown")),
    created_at: new Date().toISOString(),
    sender_id: (order && order.sender_id) || "",
    platform: (order && order.platform) || "",
    deliv_zone: (order && order.deliv_zone) || ""
  };
  try {
    await supabaseRequest(env, "website_orders", { method: "POST", body: JSON.stringify(row) });
  } catch (e) {
    console.error("[createAgentOrder] DB insert failed:", e.message);
    return { success: false, error: e.message };
  }
  // Telegram notification
  const tgText = [
    "🛒 <b>New AI Agent Order</b>",
    "Order: <code>" + orderId + "</code>",
    "Customer: " + row.cust_name + " (" + row.cust_phone + ")",
    "Product: " + row.product + " / Size " + row.size + " ×" + row.qty,
    "Total: ৳" + row.total + " (Delivery ৳" + row.delivery_charge + ")",
    "Address: " + row.cust_addr,
    "Platform: <code>" + row.platform + "</code>"
  ].join("\n");
  await notifyTelegram(env, tgText, { parse_mode: "HTML" });
  return { success: true, orderId: orderId };
}

// ----------------------- AGENT ROUTE DISPATCHERS -----------------------
/**
 * Generic agent webhook that auto-detects platform from payload and routes
 * the message through the agent pipeline. Sends the reply back via the
 * corresponding platform Send API.
 * Body shape: { platform, sender_id, message, customer_name? }
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentWebhook(request, env) {
  let body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const platform = String(body.platform || "").toLowerCase();
  const senderId = body.sender_id || body.senderId;
  const message = body.message || body.text || "";
  const customerName = body.customer_name || body.customerName || "";
  const r = await handleAgentMessage(env, {
    senderId: senderId,
    platform: platform,
    message: message,
    customerName: customerName
  });
  if (r && r.reply) {
    if (platform === "messenger")      await sendMessengerReply(env, senderId, r.reply);
    else if (platform === "instagram") await sendInstagramReply(env, senderId, r.reply);
    else if (platform === "whatsapp")  await sendWhatsAppReply(env, senderId, r.reply);
    else if (platform === "tiktok")    await sendTikTokReply(env, senderId, r.reply);
  }
  return jsonResponse({ success: true, data: r });
}

/**
 * Manually push a message to a customer (used by Telegram bot when a human
 * moderator replies to a handover thread). Body: { platform, recipient, text }
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentSend(request, env) {
  let body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const platform = String(body.platform || "").toLowerCase();
  const recipient = body.recipient || body.sender_id;
  const text = body.text || body.message || "";
  if (!platform || !recipient || !text) {
    return jsonResponse({ success: false, error: "Missing platform/recipient/text" }, 400);
  }
  let r;
  if (platform === "messenger")      r = await sendMessengerReply(env, recipient, text);
  else if (platform === "instagram") r = await sendInstagramReply(env, recipient, text);
  else if (platform === "whatsapp")  r = await sendWhatsAppReply(env, recipient, text);
  else if (platform === "tiktok")    r = await sendTikTokReply(env, recipient, text);
  else return jsonResponse({ success: false, error: "Unknown platform: " + platform }, 400);
  // Persist as assistant message
  await saveMessage(recipient, platform, "assistant", text, env);
  return jsonResponse({ success: !!(r && r.success), data: r });
}

/**
 * GET  -> return current AI settings (DB row merged with defaults).
 * POST -> upsert new settings (replaces ai_settings row id=1).
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentSettings(request, env) {
  if (request.method === "GET") {
    const settings = await loadSettings(env);
    return jsonResponse({ success: true, data: settings });
  }
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
    }
    const r = await saveSettings(env, body || {});
    return jsonResponse(r, r.success ? 200 : 500);
  }
  return jsonResponse({ success: false, error: "Method not allowed" }, 405);
}

/**
 * Admin-panel test chat. Body: { message, model? }
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentTest(request, env) {
  let body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  const message = body.message || body.text || "";
  const modelOverride = body.model || "";
  if (!message) return jsonResponse({ success: false, error: "Missing message" }, 400);
  const settings = await loadSettings(env);
  const model = modelOverride || settings.active_model || "gemini";
  const sys = buildSystemPrompt(settings);
  const aiResp = await callAIModel(model, [{ role: "user", message: message }], sys, env);
  return jsonResponse({
    success: !!(aiResp && typeof aiResp === "string"),
    data: { reply: aiResp, model: model }
  });
}

/**
 * AI-confirmed order placement. Body: order fields (cust_phone, product required).
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentOrderNew(request, env) {
  let body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  if (!body.cust_phone || !body.product) {
    return jsonResponse({ success: false, error: "cust_phone and product are required" }, 400);
  }
  const r = await createAgentOrder(env, body);
  return jsonResponse(r, r.success ? 200 : 500);
}

/**
 * Manually forward a message to Telegram. Body: { sender_id, platform, message, customer_name? }
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
async function handleAgentForward(request, env) {
  let body;
  try { body = await request.json(); } catch (e) {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
  }
  await forwardToTelegram(env, {
    senderId: body.sender_id || "",
    platform: body.platform || "manual",
    message: body.message || body.text || "",
    customerName: body.customer_name || ""
  });
  return jsonResponse({ success: true });
}

/**
 * Single dispatcher for all /agent/* paths. Splits the path, picks the right
 * handler, and returns its Response. Registered in the fetch entry handler.
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @returns {Promise<Response>}
 */
async function handleAgentRoute(request, env, ctx) {
  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/agent\/?/, "").toLowerCase();
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  // Per-platform webhook aliases: /agent/webhook/messenger etc.
  let handler;
  if (sub === "webhook" || sub === "") {
    handler = handleAgentWebhook;
  } else if (sub === "webhook/messenger" || sub === "messenger") {
    handler = handleMessengerWebhook;
  } else if (sub === "webhook/instagram" || sub === "instagram") {
    handler = handleInstagramWebhook;
  } else if (sub === "webhook/whatsapp" || sub === "whatsapp") {
    handler = handleWhatsAppWebhook;
  } else if (sub === "webhook/tiktok" || sub === "tiktok") {
    handler = handleTikTokWebhook;
  } else if (sub === "send") {
    handler = handleAgentSend;
  } else if (sub === "settings") {
    handler = handleAgentSettings;
  } else if (sub === "test") {
    handler = handleAgentTest;
  } else if (sub === "models") {
    handler = async function(req, env) {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + env.GEMINI_API_KEY);
      return new Response(await resp.text(), { headers: { "content-type": "application/json" } });
    };
  } else if (sub === "orders/new") {
    handler = handleAgentOrderNew;
  } else if (sub === "forward") {
    handler = handleAgentForward;
  } else {
    return jsonResponse({ success: false, error: "Unknown agent route: /agent/" + sub }, 404);
  }
  try {
    return await handler(request, env, ctx);
  } catch (e) {
    console.error("[agent/" + sub + "]", e.message);
    return jsonResponse({ success: false, error: e.message }, 500);
  }
}