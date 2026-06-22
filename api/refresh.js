export const config = { maxDuration: 300 };

const SUPABASE_URL = 'https://iumkmbrgtoorpehfvkpl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bWttYnJndG9vcnBlaGZ2a3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUwNDAsImV4cCI6MjA5NzY2MTA0MH0.GJt_QrUq4opjgWWHavDEocvkK0QwboVM95WNN8wX4Ts';
const APIFY_TOKEN = process.env.APIFY_KEY;
const ACTOR_ID = 'u0ILpsfZLtIpQ4gIL';

async function upsertBatch(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase ${table} error: ${await res.text()}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Fetch latest successful run dataset
    const datasetRes = await fetch(
  `https://api.apify.com/v2/acts/${ACTOR_ID}/runs/last/dataset/items?token=${APIFY_TOKEN}`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!datasetRes.ok) throw new Error('Apify fetch failed: ' + await datasetRes.text());

    const runs = await datasetRes.json();
    if (!runs || runs.length === 0) throw new Error('No completed runs found');

    const pennyRows = [];
    const clearanceRows = [];

    for (const run of runs) {
      const storeId = run.store_info?.store_id;
      const storeName = run.store_info?.store_name;
      const storeState = run.store_info?.state;

      for (const item of (run.report_items || [])) {
        const base = {
          store_id: storeId,
          store_name: storeName,
          store_state: storeState,
          item_name: item.item_name,
          brand: item.brand,
          store_sku: item.store_sku,
          upc: item.upc,
          product_id: item.product_id,
          image_link: item.image_link,
          category: item.category,
          current_stock: item.stock,
          price_last_updated: new Date().toISOString(),
        };

        if (item.clearance_price <= 0.01) {
          pennyRows.push({ ...base, current_price: item.clearance_price, store_retail_price: item.retail_price });
        } else {
          clearanceRows.push({ ...base, clearance_price: item.clearance_price, retail_price: item.retail_price, percent_off: item.percent_off });
        }
      }
    }

    // Upsert in batches of 100
    const BATCH = 100;
    for (let i = 0; i < pennyRows.length; i += BATCH) await upsertBatch('penny_items', pennyRows.slice(i, i + BATCH));
    for (let i = 0; i < clearanceRows.length; i += BATCH) await upsertBatch('clearance_items', clearanceRows.slice(i, i + BATCH));

    return res.status(200).json({
      success: true,
      penny: pennyRows.length,
      clearance: clearanceRows.length,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}