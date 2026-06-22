export const config = { maxDuration: 300 };

const SUPABASE_URL = 'https://iumkmbrgtoorpehfvkpl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bWttYnJndG9vcnBlaGZ2a3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwODUwNDAsImV4cCI6MjA5NzY2MTA0MH0.GJt_QrUq4opjgWWHavDEocvkK0QwboVM95WNN8wX4Ts';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { storeId, zipCode, type } = req.body || {};

  try {
    let query = `${SUPABASE_URL}/rest/v1/penny_items?current_price=lte.0.03&order=score.desc&limit=500`;

    if (storeId) {
      query += `&store_id=eq.${storeId}`;
    } else if (zipCode) {
      // For zip code searches return all OK stores for now
      query += `&store_state=eq.OK`;
    }

    const response = await fetch(query, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Supabase error: ' + err);
    }

    const items = await response.json();

    const processed = items.map(item => ({
      name: item.item_name || 'Unknown',
      brand: item.brand || '',
      price: item.current_price,
      retail: item.store_retail_price || item.previous_price || 0,
      pct: item.store_retail_price ? Math.round(((item.store_retail_price - item.current_price) / item.store_retail_price) * 100) : 0,
      dollarOff: item.store_retail_price ? Math.round((item.store_retail_price - item.current_price) * 100) / 100 : 0,
      isPenny: item.current_price <= 0.03,
      isClearanceItem: true,
      stock: item.current_stock || 0,
      inStock: (item.current_stock || 0) > 0,
      aisle: item.location || null,
      bay: null,
      sku: item.store_sku || '',
      upc: item.upc || '',
      itemId: item.item_id || '',
      store: item.store_name || 'Store #' + item.store_id,
      image: item.image_link || '',
      url: item.product_link || '',
      score: item.score || 0,
      category: item.category || '',
      lastUpdated: item.price_last_updated || item.current_update || '',
    }));

    return res.status(200).json({ success: true, items: processed, total: processed.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}