import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const US_STOCK_SYMBOLS_SET = new Set([
  "aapl","msft","nvda","amzn","googl","meta","tsla","amd","intc","sndk",
  "mu","mstr","pltr","hood","nflx","orcl","coin","baba","openai","crwv"
]);

const DISPLAY_NAMES = {
  aapl: "Apple", msft: "Microsoft", nvda: "NVIDIA", amzn: "Amazon",
  googl: "Alphabet", meta: "Meta", tsla: "Tesla", amd: "AMD",
  intc: "Intel", sndk: "SanDisk", mu: "Micron", mstr: "MicroStrategy",
  pltr: "Palantir", hood: "Robinhood", nflx: "Netflix", orcl: "Oracle",
  coin: "Coinbase", baba: "Alibaba", openai: "OpenAI", crwv: "CoreWeave"
};

export default function StockTradeHistory({ transactions = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("all"); // "all" | "buy" | "sell"

  const stockTrades = useMemo(() => {
    return transactions
      .filter(t => t.transaction_type === "swap" && t.status === "completed")
      .filter(t => {
        const toKey = (t.to_asset || "").toLowerCase();
        const fromKey = (t.from_asset || "").toLowerCase();
        return US_STOCK_SYMBOLS_SET.has(toKey) || US_STOCK_SYMBOLS_SET.has(fromKey);
      })
      .map(t => {
        const toKey = (t.to_asset || "").toLowerCase();
        const fromKey = (t.from_asset || "").toLowerCase();
        const isBuy = US_STOCK_SYMBOLS_SET.has(toKey);
        const symbol = isBuy ? toKey : fromKey;
        const price = t.exchange_rate || 0;
        const shares = price > 0 ? t.amount_usd / price : 0;
        const fee = t.fee_usd || 0;
        return {
          id: t.id,
          side: isBuy ? "buy" : "sell",
          symbol: symbol.toUpperCase(),
          name: DISPLAY_NAMES[symbol] || symbol.toUpperCase(),
          shares,
          price,
          amount: t.amount_usd,
          fee,
          currency: isBuy ? (t.from_asset || "USDT").toUpperCase() : (t.to_asset || "USDT").toUpperCase(),
          date: t.created_date,
        };
      });
  }, [transactions]);

  const filtered = filter === "all" ? stockTrades : stockTrades.filter(t => t.side === filter);
  const visible = expanded ? filtered : filtered.slice(0, 5);

  if (stockTrades.length === 0) return null;

  const totalBought = stockTrades.filter(t => t.side === "buy").reduce((s, t) => s + t.amount, 0);
  const totalSold = stockTrades.filter(t => t.side === "sell").reduce((s, t) => s + t.amount, 0);
  const totalFees = stockTrades.reduce((s, t) => s + t.fee, 0);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            Trade History
            <Badge className="bg-indigo-100 text-indigo-700 text-xs">{stockTrades.length} trades</Badge>
          </CardTitle>

          {/* Filter tabs */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
            {[["all", "All"], ["buy", "Buys"], ["sell", "Sells"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1.5 font-medium transition-all ${
                  filter === val
                    ? val === "sell" ? "bg-red-500 text-white" : val === "buy" ? "bg-green-500 text-white" : "bg-blue-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">Total Bought</p>
            <p className="text-sm font-bold text-green-700">${totalBought.toFixed(2)}</p>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">Total Sold</p>
            <p className="text-sm font-bold text-red-600">${totalSold.toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">Total Fees</p>
            <p className="text-sm font-bold text-slate-600">${totalFees.toFixed(4)}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">No trades match this filter</div>
        ) : (
          <>
            <div className="space-y-2">
              <AnimatePresence>
                {visible.map((trade, i) => (
                  <motion.div
                    key={trade.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    {/* Side icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      trade.side === "buy" ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {trade.side === "buy"
                        ? <TrendingUp className="w-4 h-4 text-green-600" />
                        : <TrendingDown className="w-4 h-4 text-red-500" />}
                    </div>

                    {/* Stock info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{trade.symbol}</span>
                        <Badge className={`text-xs px-1.5 py-0 ${trade.side === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {trade.side === "buy" ? "BUY" : "SELL"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{trade.name}</p>
                    </div>

                    {/* Shares & price */}
                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                      <div>{trade.shares.toFixed(6)} shares</div>
                      <div>@ ${trade.price.toFixed(2)}</div>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <div className={`font-semibold text-sm flex items-center gap-0.5 justify-end ${
                        trade.side === "buy" ? "text-slate-700" : "text-green-600"
                      }`}>
                        {trade.side === "sell" && <ArrowUpRight className="w-3.5 h-3.5" />}
                        {trade.side === "buy" && <ArrowDownRight className="w-3.5 h-3.5 text-slate-400" />}
                        ${trade.amount.toFixed(2)} {trade.currency}
                      </div>
                      <div className="text-xs text-slate-400">
                        {trade.date ? format(new Date(trade.date), "MMM d, HH:mm") : "—"}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Show more / less */}
            {filtered.length > 5 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium"
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> Show all {filtered.length} trades</>
                )}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}