// Fetch HK stock prices via real-time quote API
// No source branding exposed

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const symbols = (body.symbols || '').trim();

    if (!symbols) {
      return Response.json({ prices: {} });
    }

    // Build query symbols: 00700 -> r_hk00700
    const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
    if (symList.length === 0) {
      return Response.json({ prices: {} });
    }

    const querySymbols = symList.map(s => {
      const code = s.replace(/^0+/, '').padStart(5, '0');
      return `r_hk${code}`;
    }).join(',');

    const res = await fetch(`https://qt.gtimg.cn/q=${querySymbols}`);
    const text = await res.text();

    // Decode GBK to UTF-8
    const decoder = new TextDecoder('gbk');
    // Re-fetch as array buffer for proper decoding
    const res2 = await fetch(`https://qt.gtimg.cn/q=${querySymbols}`);
    const buf = await res2.arrayBuffer();
    const decoded = decoder.decode(buf);

    const prices = {};

    for (const sym of symList) {
      const code = sym.replace(/^0+/, '').padStart(5, '0');
      const prefix = `v_r_hk${code}="`;
      const startIdx = decoded.indexOf(prefix);
      if (startIdx === -1) continue;

      const valueStart = startIdx + prefix.length;
      const endIdx = decoded.indexOf('"', valueStart);
      if (endIdx === -1) continue;

      const fields = decoded.slice(valueStart, endIdx).split('~');
      if (fields.length < 35) continue;

      // Parse Tencent quote fields
      const name = fields[1] || sym;
      const price = parseFloat(fields[3]) || 0;
      const prevClose = parseFloat(fields[4]) || 0;
      const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      if (price > 0) {
        prices[sym] = {
          price,
          change,
          name,
        };
      }
    }

    return Response.json({ prices, timestamp: Date.now() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
