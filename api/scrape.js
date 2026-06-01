export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { storeId, zipCode, type } = req.body || {};
  const APIFY_KEY = process.env.APIFY_KEY;
  if (!APIFY_KEY) return res.status(500).json({ error: 'No Apify key' });

  try {
    // FIX: never send both storeId and zipCode — prefer storeId
    const input = storeId
      ? { storeId: String(storeId), maxResults: 100 }
      : { zipcode: String(zipCode), maxResults: 100 };

    const ACTOR_ID = 'centspy~my-actor';

    const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const runData = await runRes.json();
    if (!runData.data?.id) throw new Error('Failed to start scraper');
    const runId = runData.data.id;

    // Poll for completion — up to 40 attempts × 3s = 2 minutes
    let attempts = 0;
    while (attempts < 40) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json();
      if (s.data?.status === 'SUCCEEDED') break;
      if (s.data?.status === 'FAILED') throw new Error('Scraper failed');
      attempts++;
    }

    if (attempts >= 40) throw new Error('Scraper timed out after 2 minutes');

    const items = await (await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_KEY}&limit=100`
    )).json();

    const processed = items.map(item => ({
      name: item.name || 'Unknown',
      brand: item.brand || '',
      price: item.price || 0,
      retail: item.retail || 0,
      pct: item.pct || 0,
      dollarOff: item.dollarOff || 0,   // FIX: was always 0 before because actor never sent it
      isPenny: item.isPenny || false,
      isClearanceItem: item.isClearanceItem || false,
      stock: item.stock || 0,
      inStock: item.inStock || false,
      aisle: item.aisle || null,
      bay: item.bay || null,
      sku: item.sku || '',
      upc: item.upc || '',
      itemId: item.itemId || '',
      store: item.store || '',
      image: item.image || '',
      url: item.url || '',
      // FIX: score now uses dollarOff as a signal too, not just pct
      score: item.isPenny
        ? 85
        : Math.min(85, Math.round(
            (item.pct || 0) * 0.6 +
            Math.min(25, ((item.dollarOff || 0) / 10)) +
            (item.inStock ? 10 : 0)
          )),
    }));

    return res.status(200).json({ success: true, items: processed, total: processed.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
