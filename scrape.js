export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { storeId, zipCode, type } = req.body || req.query;
  const APIFY_KEY = process.env.APIFY_KEY;

  if (!APIFY_KEY) {
    return res.status(500).json({ error: 'Apify key not configured' });
  }

  try {
    // Start the scraper run
    const input = storeId ? { storeId } : { zipCode };
    const maxItems = type === 'penny' ? 200 : 500;

    const runRes = await fetch(
      'https://api.apify.com/v2/acts/scrapyspider~home-depot-clearance-scraper/runs?token=' + APIFY_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, maxItems })
      }
    );
    const runData = await runRes.json();
    if (!runData.data?.id) throw new Error('Failed to start scraper');

    const runId = runData.data.id;

    // Poll for completion (max 2 minutes)
    let attempts = 0;
    while (attempts < 40) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(
        'https://api.apify.com/v2/actor-runs/' + runId + '?token=' + APIFY_KEY
      );
      const statusData = await statusRes.json();
      if (statusData.data?.status === 'SUCCEEDED') break;
      if (statusData.data?.status === 'FAILED') throw new Error('Scraper failed');
      attempts++;
    }

    // Get results
    const dataRes = await fetch(
      'https://api.apify.com/v2/actor-runs/' + runId + '/dataset/items?token=' + APIFY_KEY + '&limit=1000'
    );
    const items = await dataRes.json();

    // Process items
    const processed = items.map(item => {
      const price = item.pricing?.value || item.price?.value || 0;
      const original = item.pricing?.original?.value || item.wasPrice?.value || 0;
      const pct = original > 0 ? Math.round(((original - price) / original) * 100) : 0;
      const isPenny = price <= 0.03;
      const score = isPenny ? Math.min(95, 60 + Math.floor(Math.random() * 35)) : Math.min(85, 40 + pct/2);

      return {
        name: item.identifiers?.productLabel || item.title || 'Unknown',
        brand: item.identifiers?.brandName || item.brand || '',
        retail: original,
        price: price,
        pct: pct,
        score: score,
        stock: item.inventory?.quantity || 0,
        aisle: item.location?.aisle || null,
        bay: item.location?.bay || null,
        sku: item.identifiers?.storeSkuNumber || '',
        upc: item.identifiers?.upc || '',
        itemId: item.itemId || item.identifiers?.itemId || '',
        store: storeId ? 'Store #' + storeId : 'Nearest Store',
        ago: 'Just now',
        isPenny: isPenny,
        image: item.media?.images?.[0]?.url || '',
        url: 'https://homedepot.com' + (item.identifiers?.canonicalUrl || ''),
        isClearance: item.isClearanceItem || pct > 0
      };
    });

    return res.status(200).json({ 
      success: true, 
      items: processed,
      total: processed.length,
      penny: processed.filter(i => i.isPenny).length,
      clearance: processed.filter(i => i.pct >= 50).length
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
