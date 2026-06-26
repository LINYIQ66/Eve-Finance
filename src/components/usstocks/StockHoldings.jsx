import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Briefcase, BarChart2, DollarSign,
  ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { motion } from "framer-motion";

const US_STOCK_SYMBOLS = [
  "aapl","msft","nvda","amzn","googl","meta","tsla","amd","intc","sndk",
  "mu","mstr","pltr","hood","nflx","orcl","coin","baba","openai","crwv"
];

const DISPLAY_NAMES = {
  aapl: "Apple", msft: "Microsoft", nvda: "NVIDIA", amzn: "Amazon",
  googl: "Alphabet", meta: "Meta", tsla: "Tesla", amd: "AMD",
  intc: "Intel", sndk: "SanDisk", mu: "Micron", mstr: "MicroStrategy",
  pltr: "Palantir", hood: "Robinhood", nflx: "Netflix", orcl: "Oracle",
  coin: "Coinbase", baba: "Alibaba", openai: "OpenAI", crwv: "CoreWeave"
};

const CURRENCIES = new Set(["usdt", "usd", "eve"]);

// Calculate average cost basis per symbol from completed buy transactions
function calcCostBasis(transactions = []) {
  const basis = {}; // { [symbolLower]: { totalShares, totalCost } }

  const completed = transactions.filter(t =>
    t.transaction_type === "swap" && t.status === "completed"
  );

  for (const tx of completed) {
    if (!tx.from_asset || !tx.to_asset) continue;
    const toKey = tx.to_asset.toLowerCase();
    const fromKey = tx.from_asset.toLowerCase();
    // Identify stock transactions by checking currency vs non-currency assets
    const isBuy = !CURRENCIES.has(toKey) && CURRENCIES.has(fromKey);
    const isSell = !CURRENCIES.has(fromKey) && CURRENCIES.has(toKey);

    if (isBuy) {
      // buying stock: amount_usd = gross spent, net shares = gross*(1-fee)/price
      const price = tx.exchange_rate || 0;
      const shares = price > 0 ? (tx.amount_usd * (1 - 0.001)) / price : 0;
      if (!basis[toKey]) basis[toKey] = { totalShares: 0, totalCost: 0 };
      basis[toKey].totalShares += shares;
      basis[toKey].totalCost += tx.amount_usd; // cost = what user paid
    }

    if (isSell) {
      // selling stock: reduce cost basis proportionally
      const price = tx.exchange_rate || 0;
      const shares = price > 0 ? tx.amount_usd / price : 0;
      if (basis[fromKey] && basis[fromKey].totalShares > 0) {
        const ratio = Math.min(shares / basis[fromKey].totalShares, 1);
        basis[fromKey].totalCost *= (1 - ratio);
        basis[fromKey].totalShares -= shares;
        if (basis[fromKey].totalShares < 0) basis[fromKey].totalShares = 0;
      }
    }
  }
  return basis;
}

export default function StockHoldings({ user, prices, onSymbolClick, transactions = [] }) {
  const [view, setView] = useState("overview"); // "overview" | "pnl"

  const balances = user?.wallet_balances || {};

  const costBasis = useMemo(() => calcCostBasis(transactions), [transactions]);

  // Dynamically build stock keys from balances — includes custom-added stocks
  const stockKeys = [...new Set([
    ...Object.keys(balances).filter(k =>
      !CURRENCIES.has(k) && !k.startsWith("frozen_") && (balances[k] || 0) > 0
    ),
    ...Object.keys(balances)
      .filter(k => k.startsWith("frozen_") && (balances[k] || 0) > 0)
      .map(k => k.replace("frozen_", "")),
  ])];

  const holdings = stockKeys
    .map(key => {
      const shares = balances[key] || 0;
      const frozenShares = balances[`frozen_${key}`] || 0;
      const symbol = key.toUpperCase();
      const price = prices?.[symbol]?.price || null;
      const change24h = prices?.[symbol]?.change || 0;
      const marketValue = price ? shares * price : null;

      const cb = costBasis[key];
      const avgCost = cb && cb.totalShares > 0 ? cb.totalCost / cb.totalShares : null;
      const totalCost = avgCost ? avgCost * shares : null;
      const unrealizedPnl = (marketValue !== null && totalCost !== null) ? marketValue - totalCost : null;
      const pnlPct = (unrealizedPnl !== null && totalCost > 0) ? (unrealizedPnl / totalCost) * 100 : null;

      return {
        key, symbol, shares, frozenShares, price, change24h,
        marketValue, avgCost, totalCost,
        unrealizedPnl, pnlPct,
        name: DISPLAY_NAMES[key] || symbol
      };
    });

  if (holdings.length === 0) return null;

  const totalMarketValue = holdings.reduce((s, h) => s + (h.marketValue || 0), 0);
  const totalCost = holdings.reduce((s, h) => s + (h.totalCost || 0), 0);
  const totalPnl = totalMarketValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-500" />
            我的股票持仓
            <Badge className="bg-blue-100 text-blue-700 text-xs">{holdings.length} 个持仓</Badge>
          </CardTitle>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
            <button
              onClick={() => setView("overview")}
              className={`px-3 py-1.5 font-medium flex items-center gap-1 transition-all ${
                view === "overview" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <BarChart2 className="w-3 h-3" /> 概览
            </button>
            <button
              onClick={() => setView("pnl")}
              className={`px-3 py-1.5 font-medium flex items-center gap-1 transition-all ${
                view === "pnl" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <DollarSign className="w-3 h-3" /> 盈亏
            </button>
          </div>
        </div>

        {/* Portfolio summary bar (P&L view) */}
        {view === "pnl" && totalCost > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-2 rounded-xl px-4 py-3 flex items-center justify-between text-sm ${
              totalPnl >= 0 ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
            }`}
          >
            <div>
              <span className="text-slate-500 text-xs">总成本</span>
              <p className="font-semibold text-slate-800">${totalCost.toFixed(2)}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">市值</span>
              <p className="font-semibold text-slate-800">${totalMarketValue.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-xs">未实现盈亏</span>
              <p className={`font-bold text-base flex items-center gap-1 justify-end ${totalPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                {totalPnl >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                <span className="text-xs font-medium">({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)</span>
              </p>
            </div>
          </motion.div>
        )}
      </CardHeader>

      <CardContent className="p-3 pt-0">
        {view === "overview" ? (
          /* ── Overview Grid ── */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {holdings.map((h, i) => (
              <motion.div
                key={h.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onSymbolClick?.(h.symbol)}
                className="bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-xl p-3 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900 text-sm">{h.symbol}</span>
                  {h.change24h !== 0 && (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${h.change24h >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {h.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {h.change24h >= 0 ? "+" : ""}{h.change24h.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{h.name}</p>
                <div className="text-xs text-slate-600 mt-1">
                  <span>{h.shares.toFixed(6)} 股</span>
                  {h.frozenShares > 0 && (
                    <span className="text-yellow-600 ml-1">({h.frozenShares.toFixed(6)} 冻结)</span>
                  )}
                </div>
                {h.marketValue !== null && (
                  <p className="text-sm font-semibold text-blue-700 mt-0.5">${h.marketValue.toFixed(2)}</p>
                )}
                {h.price && (
                  <p className="text-xs text-slate-400">@ ${h.price.toFixed(2)}</p>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          /* ── P&L Table ── */
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="text-left py-2 px-2 font-medium">股票</th>
                  <th className="text-right py-2 px-2 font-medium">持股总数</th>
                  <th className="text-right py-2 px-2 font-medium">均价成本</th>
                  <th className="text-right py-2 px-2 font-medium">市价</th>
                  <th className="text-right py-2 px-2 font-medium">市值</th>
                  <th className="text-right py-2 px-2 font-medium">未实现盈亏</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <motion.tr
                    key={h.key}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => onSymbolClick?.(h.symbol)}
                    className="border-b border-slate-50 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-2">
                      <div className="font-bold text-slate-900">{h.symbol}</div>
                      <div className="text-slate-400 text-xs">{h.name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-700 font-medium">
                      {h.shares.toFixed(6)}
                      {h.frozenShares > 0 && (
                        <div className="text-xs text-yellow-600 font-normal">{h.frozenShares.toFixed(6)} 待成交</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600">
                      {h.avgCost ? `$${h.avgCost.toFixed(2)}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="text-slate-800 font-medium">{h.price ? `$${h.price.toFixed(2)}` : "—"}</div>
                      {h.change24h !== 0 && (
                        <div className={`text-xs ${h.change24h >= 0 ? "text-green-500" : "text-red-400"}`}>
                          {h.change24h >= 0 ? "+" : ""}{h.change24h.toFixed(2)}%
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-800 font-semibold">
                      {h.marketValue !== null ? `$${h.marketValue.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {h.unrealizedPnl !== null ? (
                        <div className={`font-bold ${h.unrealizedPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                          <div className="flex items-center justify-end gap-0.5">
                            {h.unrealizedPnl >= 0
                              ? <ArrowUpRight className="w-3 h-3" />
                              : <ArrowDownRight className="w-3 h-3" />}
                            {h.unrealizedPnl >= 0 ? "+" : ""}${h.unrealizedPnl.toFixed(2)}
                          </div>
                          <div className="text-xs font-medium">
                            ({h.pnlPct >= 0 ? "+" : ""}{h.pnlPct?.toFixed(2)}%)
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 flex items-center justify-end gap-0.5">
                          <Minus className="w-3 h-3" /> 暂无
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}