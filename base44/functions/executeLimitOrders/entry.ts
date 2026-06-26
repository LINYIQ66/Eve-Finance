// executeLimitOrders - Checks pending limit orders and executes them if market price conditions are met
// BUY limit: executes when market price <= limit price
// SELL limit: executes when market price >= limit price

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FEE_RATE = 0.001;

const STOCKS = [
  { symbol: "AAPL",   id: 39491 },
  { symbol: "MSFT",   id: 39495 },
  { symbol: "NVDA",   id: 38153 },
  { symbol: "AMZN",   id: 39471 },
  { symbol: "GOOGL",  id: 39470 },
  { symbol: "META",   id: 39513 },
  { symbol: "TSLA",   id: 38152 },
  { symbol: "AMD",    id: 39489 },
  { symbol: "INTC",   id: 39472 },
  { symbol: "SNDK",   id: 39507 },
  { symbol: "MU",     id: 39469 },
  { symbol: "MSTR",   id: 39473 },
  { symbol: "PLTR",   id: 39475 },
  { symbol: "HOOD",   id: 39478 },
  { symbol: "NFLX",   id: 39479 },
  { symbol: "ORCL",   id: 39482 },
  { symbol: "COIN",   id: 39483 },
  { symbol: "BABA",   id: 39486 },
  { symbol: "OPENAI", id: 39485 },
  { symbol: "CRWV",   id: 39497 },
];

async function fetchPrices() {
  const ids = STOCKS.map(s => s.id).join(",");
  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${ids}&convert=USD`;
  const res = await fetch(url, {
    headers: {
      "X-CMC_PRO_API_KEY": Deno.env.get("CMC_API_KEY"),
      "Accept": "application/json",
    }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.status?.error_message || "CMC API error");
  const prices = {};
  for (const stock of STOCKS) {
    const entry = json.data?.[String(stock.id)];
    if (entry?.quote?.USD?.price > 0) {
      prices[stock.symbol] = entry.quote.USD.price;
    }
  }
  return prices;
}

// Fetch prices for custom (non-default) stock symbols via Alpaca
async function fetchAlpacaPrices(symbols) {
  const apiKey = Deno.env.get("ALPACA_API_KEY");
  const secretKey = Deno.env.get("ALPACA_SECRET_KEY");
  const symStr = symbols.join(",");
  const prices = {};

  try {
    const tradeRes = await fetch(
      `https://data.alpaca.markets/v2/stocks/trades/latest?symbols=${encodeURIComponent(symStr)}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );

    if (!tradeRes.ok) return prices;

    const tradeData = await tradeRes.json();
    for (const [symbol, trade] of Object.entries(tradeData.trades || {})) {
      const price = trade.p || 0;
      if (price > 0) prices[symbol] = price;
    }
  } catch (e) {
    // Best effort — custom symbols without prices will be skipped
  }

  return prices;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch all pending swap transactions
    const pendingTxs = await base44.asServiceRole.entities.Transaction.filter({
      transaction_type: "swap",
      status: "pending",
    });

    if (!pendingTxs.length) {
      return Response.json({ message: "No pending limit orders.", executed: 0 });
    }

    // Fetch current market prices for default stocks
    const prices = await fetchPrices();

    // Fetch Alpaca prices for any custom (non-default) stock symbols in pending orders
    const defaultSymbols = new Set(STOCKS.map(s => s.symbol));
    const customSymbols = new Set();
    for (const tx of pendingTxs) {
      let orderInfo;
      try { orderInfo = JSON.parse(tx.description || "{}"); } catch { continue; }
      if (orderInfo.symbol && !defaultSymbols.has(orderInfo.symbol)) {
        customSymbols.add(orderInfo.symbol);
      }
    }
    if (customSymbols.size > 0) {
      const alpacaPrices = await fetchAlpacaPrices([...customSymbols]);
      Object.assign(prices, alpacaPrices);
    }

    let executed = 0;
    let errors = [];

    for (const tx of pendingTxs) {
      // Parse limit order info from description
      let orderInfo;
      try {
        orderInfo = JSON.parse(tx.description || "{}");
      } catch {
        continue; // Not a limit order we manage
      }
      if (!orderInfo.limitPrice || !orderInfo.side || !orderInfo.symbol) continue;

      const { limitPrice, side, shares, currency, symbol } = orderInfo;
      const marketPrice = prices[symbol];
      if (!marketPrice) continue;

      // Check execution condition
      const shouldExecute = side === "buy"
        ? marketPrice <= limitPrice   // Buy: market <= limit price (got a bargain)
        : marketPrice >= limitPrice;  // Sell: market >= limit price (price target hit)

      if (!shouldExecute) continue;

      // Fetch the user's current balances
      const users = await base44.asServiceRole.entities.User.filter({ email: tx.user_email });
      if (!users.length) continue;
      const userRecord = users[0];
      const newBalances = { ...(userRecord.wallet_balances || {}) };
      const stockKey = symbol.toLowerCase();
      const currencyKey = (currency || "USDT").toLowerCase();
      const frozenCurrKey = `frozen_${currencyKey}`;
      const frozenStockKey = `frozen_${stockKey}`;

      if (side === "buy") {
        // Funds were frozen: spent = tx.amount_usd
        const spent = tx.amount_usd;
        const fee = spent * FEE_RATE;
        const sharesReceived = (spent * (1 - FEE_RATE)) / marketPrice;
        const eveReward = fee * 100;

        // Unfreeze and apply
        newBalances[frozenCurrKey] = Math.max(0, (newBalances[frozenCurrKey] || 0) - spent);
        newBalances[stockKey] = (newBalances[stockKey] || 0) + sharesReceived;
        if (eveReward > 0) newBalances.eve = (newBalances.eve || 0) + eveReward;

        // Update transaction to completed
        await base44.asServiceRole.entities.Transaction.update(tx.id, {
          status: "completed",
          fee_usd: fee,
          exchange_rate: marketPrice,
          description: JSON.stringify({
            ...orderInfo,
            executedAt: new Date().toISOString(),
            executedPrice: marketPrice,
            sharesReceived,
          }),
        });

        if (eveReward > 0) {
          await base44.asServiceRole.entities.Transaction.create({
            transaction_type: "eve_reward",
            user_email: tx.user_email,
            to_asset: "EVE",
            amount_usd: fee,
            eve_amount: eveReward,
            status: "completed",
          });
        }
      } else {
        // Shares were frozen: shares = orderInfo.shares
        const gross = shares * marketPrice;
        const fee = gross * FEE_RATE;
        const netUsdt = gross - fee;
        const eveReward = fee * 100;

        // Unfreeze stock, credit currency
        newBalances[frozenStockKey] = Math.max(0, (newBalances[frozenStockKey] || 0) - shares);
        newBalances[currencyKey] = (newBalances[currencyKey] || 0) + netUsdt;
        if (eveReward > 0) newBalances.eve = (newBalances.eve || 0) + eveReward;

        await base44.asServiceRole.entities.Transaction.update(tx.id, {
          status: "completed",
          fee_usd: fee,
          amount_usd: gross,
          exchange_rate: marketPrice,
          description: JSON.stringify({
            ...orderInfo,
            executedAt: new Date().toISOString(),
            executedPrice: marketPrice,
            netUsdt,
          }),
        });

        if (eveReward > 0) {
          await base44.asServiceRole.entities.Transaction.create({
            transaction_type: "eve_reward",
            user_email: tx.user_email,
            to_asset: "EVE",
            amount_usd: fee,
            eve_amount: eveReward,
            status: "completed",
          });
        }
      }

      // Save updated balances
      await base44.asServiceRole.entities.User.update(userRecord.id, {
        wallet_balances: newBalances,
      });

      executed++;
    }

    return Response.json({ message: `Executed ${executed} limit order(s).`, executed, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});