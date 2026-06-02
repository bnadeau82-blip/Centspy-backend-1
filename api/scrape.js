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
    // Use scrapyspider actor which successfully bypasses HD bot detection
    const ACTOR_ID = 'scrapyspider~home-depot-clearance-scraper';

    const input = storeId
      ? {
          storeId: String(storeId),
          maxResults: 2000,
          parallelRequests: 3,
          proxyConfig: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
            apifyProxyCountry: 'US',
          }
        }
      : {
          zipcode: String(zipCode),
          maxResults: 2000,
          parallelRequests: 3,
          proxyConfig: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
            apifyProxyCountry: 'US',
          }
        };

    const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const runData = await runRes.json();
    if (!runData.data?.id) throw new Error('Failed to start scraper');
    const runId = runData.data.id;

    // Poll for completion — up to 180 attempts × 5s = 15 minutes
    let attempts = 0;
    while (attempts < 180) {
      await new Promise(r => setTimeout(r, 5000));
      const s = await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json();
      if (s.data?.status === 'SUCCEEDED') break;
      if (s.data?.status === 'FAILED') throw new Error('Scraper failed');
      attempts++;
    }

    if (attempts >= 180) throw new Error('Scraper timed out after 15 minutes');

    // Fetch up to 1000 items then filter down
    const items = await (await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_KEY}&limit=1000`
    )).json();

    // Filter to only true clearance items
    const clearanceOnly = items.filter(item => item.isClearanceItem === true);

    const processed = clearanceOnly.map(item => {
      const clearancePrice = item.pricing?.clearance?.value ?? null;
      const regularPrice = item.pricing?.value ?? 0;
      const originalPrice = item.pricing?.original ?? regularPrice;
      const price = clearancePrice !== null ? clearancePrice : regularPrice;
      const pct = item.pricing?.clearance?.percentageOff ?? 0;
      const dollarOff = item.pricing?.clearance?.dollarOff ?? 0;
      const isPenny = price > 0 && price <= 0.03;

      return {
        name: item.identifiers?.productLabel || 'Unknown',
        brand: item.identifiers?.brandName || '',
        price: price,
        retail: originalPrice,
        pct: pct,
        dollarOff: dollarOff,
        isPenny: isPenny,
        isClearanceItem: true,
        stock: item.availability?.quantity ?? 0,
        inStock: item.availability?.status ?? false,
        aisle: item.location?.aisle ?? null,
        bay: item.location?.bay ?? null,
        sku: item.identifiers?.storeSkuNumber || '',
        upc: item.identifiers?.upc || '',
        itemId: item.itemId || '',
        store: item.storeName || (storeId ? 'Store #' + storeId : 'Near ' + zipCode),
        image: item.media?.images?.[0]?.url || '',
        url: item.URL || '',
        score: isPenny
          ? 85
          : Math.min(85, Math.round(
              (pct || 0) * 0.6 +
              Math.min(25, (dollarOff || 0) / 10) +
              (item.availability?.status ? 10 : 0)
            )),
      };
    });

    // Sort by price ascending (penny items first)
    processed.sort((a, b) => a.price - b.price);

    return res.status(200).json({ success: true, items: processed, total: processed.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
