import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Get latest quotes from Alpaca for dynamically added stock symbols
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const symbols = (body.symbols || '').trim();

    if (!symbols) {
      return Response.json({ prices: {} });
    }

    const apiKey = Deno.env.get("ALPACA_API_KEY");
    const secretKey = Deno.env.get("ALPACA_SECRET_KEY");

    // Get latest trades (last traded price — more accurate than bid/ask mid)
    const tradeRes = await fetch(
      `https://data.alpaca.markets/v2/stocks/trades/latest?symbols=${encodeURIComponent(symbols)}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );

    if (!tradeRes.ok) {
      const errText = await tradeRes.text();
      return Response.json({ error: `Alpaca trades error: ${tradeRes.status} ${errText}` }, { status: 502 });
    }

    const tradeData = await tradeRes.json();
    const prices = {};

    for (const [symbol, trade] of Object.entries(tradeData.trades || {})) {
      const price = trade.p || 0;
      if (price > 0) {
        prices[symbol] = {
          price,
          change: 0,
          name: symbol,
        };
      }
    }

    // Get snapshots for 24h change (best effort)
    try {
      const snapRes = await fetch(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols)}`,
        {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': secretKey,
          }
        }
      );

      if (snapRes.ok) {
        const snapData = await snapRes.json();
        for (const [symbol, snap] of Object.entries(snapData.snapshots || {})) {
          if (prices[symbol] && snap.daily_bar) {
            const prevClose = snap.prev_daily_bar?.c || snap.daily_bar.o;
            if (prevClose > 0) {
              prices[symbol].change = ((prices[symbol].price - prevClose) / prevClose) * 100;
            }
          }
        }
      }
    } catch (e) {
      // Snapshots not available, prices from trades are sufficient
    }

    return Response.json({ prices, timestamp: Date.now() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});