import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const CURRENCIES = new Set(["usdt", "usd", "eve"]);

function isHKStock(key) {
  return /^\d{5}$/.test(key);
}

export default function HKStockTradeHistory({ transactions = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("all");

  const stockTrades = useMemo(() => {
    return transactions
      .filter(t => t.transaction_type === "swap" && t.status === "completed")
      .filter(t => {
        const toKey = (t.to_asset || "").toLowerCase();
        const fromKey = (t.from_asset || "").toLowerCase();
        return (isHKStock(toKey) && !CURRENCIES.has(toKey)) || (isHKStock(fromKey) && !CURRENCIES.has(fromKey));
      })
      .map(t => {
        const toKey = (t.to_asset || "").toLowerCase();
        const fromKey = (t.from_asset || "").toLowerCase();
        const isBuy = isHKStock(toKey) && !CURRENCIES.has(toKey);
        const symbol = isBuy ? toKey : fromKey;
        const price = t.exchange_rate || 0;
        const shares = price > 0 ? t.amount_usd / price : 0;
        const fee = t.fee_usd || 0;
        return {
          id: t.id,
          side: isBuy ? "buy" : "sell",
          symbol: symbol.toUpperCase(),
          name: symbol.toUpperCase(),
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
            <History className="w-4 h-4 text-red-500" />
            港股交易记录
            <Badge className="bg-red-100 text-red-700 text-xs">{stockTrades.length} 笔交易</Badge>
          </CardTitle>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
            {[["all", "全部"], ["buy", "买入"], ["sell", "卖出"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1.5 font-medium transition-all ${
                  filter === val
                    ? val === "sell" ? "bg-red-500 text-white" : val === "buy" ? "bg-green-500 text-white" : "bg-red-600 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">累计买入</p>
            <p className="text-sm font-bold text-green-700">${totalBought.toFixed(2)}</p>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">累计卖出</p>
            <p className="text-sm font-bold text-red-600">${totalSold.toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-slate-500">累计手续费</p>
            <p className="text-sm font-bold text-slate-600">${totalFees.toFixed(4)}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm">暂无符合条件的交易记录</div>
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
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      trade.side === "buy" ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {trade.side === "buy"
                        ? <TrendingUp className="w-4 h-4 text-green-600" />
                        : <TrendingDown className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{trade.symbol}</span>
                        <Badge className={`text-xs px-1.5 py-0 ${trade.side === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {trade.side === "buy" ? "买入" : "卖出"}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 hidden sm:block">
                      <div>{trade.shares.toFixed(6)} 股</div>
                      <div>@ ${trade.price.toFixed(3)}</div>
                    </div>
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

            {filtered.length > 5 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-red-600 hover:text-red-700 py-2 rounded-lg hover:bg-red-50 transition-colors font-medium"
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> 收起</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> 查看全部 {filtered.length} 笔交易</>
                )}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
