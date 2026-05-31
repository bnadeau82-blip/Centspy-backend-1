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
    const input = storeId ? { storeId } : { zipCode };
    const runRes = await fetch('https://api.apify.com/v2/acts/scrapyspider~home-depot-clearance-scraper/runs?token=' + APIFY_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, maxItems: type === 'penny' ? 200 : 500 })
    });
    const runData = await runRes.json();
    if (!runData.data?.id) throw new Error('Failed to start scraper');
    const runId = runData.data.id;

    let attempts = 0;
    while (attempts < 40) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await (await fetch('https://api.apify.com/v2/actor-runs/' + runId + '?token=' + APIFY_KEY)).json();
      if (s.data?.status === 'SUCCEEDED') break;
      if (s.data?.status === 'FAILED') throw new Error('Scraper failed');
      attempts++;
    }

    const items = await (await fetch('https://api.apify.com/v2/actor-runs/' + runId + '/dataset/items?token=' + APIFY_KEY + '&limit=1000')).json();

    const processed = items.map(item => {
      const price = item.pricing?.value || 0;
      const original = item.pricing?.original?.value || 0;
      const pct = original > 0 ? Math.round(((original - price) / original) * 100) : 0;
      const isPenny = price <= 0.03;
      return {
        name: item.identifiers?.productLabel || 'Unknown',
        brand: item.identifiers?.brandName || '',
        retail: original, price, pct,
        score: isPenny ? 85 : Math.min(85, 40 + pct/2),
        stock: item.inventory?.quantity || 0,
        sku: item.identifiers?.storeSkuNumber || '',
        itemId: item.itemId || '',
        store: 'Store #' + (storeId || ''),
        isPenny,
        image: item.media?.images?.[0]?.url || '',
        url: 'https://homedepot.com' + (item.identifiers?.canonicalUrl || '')
      };
    });

    return res.status(200).json({ success: true, items: processed, total: processed.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
