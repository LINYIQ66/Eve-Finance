import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock, X, TrendingUp, TrendingDown, Lock,
  Edit2, Check, AlertCircle, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Transaction, User } from "@/entities/all";

const FEE_RATE = 0.001;

const US_STOCKS = new Set([
  "aapl","msft","nvda","amzn","googl","meta","tsla","amd","intc","sndk",
  "mu","mstr","pltr","hood","nflx","orcl","coin","baba","openai","crwv"
]);

export default function USStockPendingOrders({ transactions = [], onRefresh, livePrice, allPrices = {} }) {
  const [cancellingId, setCancellingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [editError, setEditError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const pendingOrders = transactions.filter(t => {
    if (t.status !== "pending" || t.transaction_type !== "swap") return false;
    let meta = {};
    try { meta = JSON.parse(t.description || "{}"); } catch {}
    const sym = (meta.symbol || t.to_asset || t.from_asset || "").toLowerCase();
    return US_STOCKS.has(sym);
  });

  const handleCancel = async (order) => {
    setCancellingId(order.id);
    try {
      let meta = {};
      try { meta = JSON.parse(order.description || "{}"); } catch {}
      const { side, currency, symbol, shares } = meta;
      const currencyKey = (currency || "usdt").toLowerCase();
      const stockKey = (symbol || "").toLowerCase();

      const user = await User.me();
      const newBalances = { ...(user.wallet_balances || {}) };

      if (side === "buy") {
        const frozenKey = `frozen_${currencyKey}`;
        const frozen = newBalances[frozenKey] || 0;
        const refund = Math.min(order.amount_usd, frozen);
        newBalances[currencyKey] = (newBalances[currencyKey] || 0) + refund;
        newBalances[frozenKey] = Math.max(0, frozen - refund);
      } else {
        const frozenKey = `frozen_${stockKey}`;
        const frozen = newBalances[frozenKey] || 0;
        const refundShares = Math.min(shares || 0, frozen);
        newBalances[stockKey] = (newBalances[stockKey] || 0) + refundShares;
        newBalances[frozenKey] = Math.max(0, frozen - refundShares);
      }

      await Transaction.update(order.id, {
        status: "failed",
        description: JSON.stringify({
          ...meta,
          cancelledAt: new Date().toISOString(),
          cancelReason: "User cancelled",
        }),
      });
      await User.updateMyUserData({ wallet_balances: newBalances });
      onRefresh();
    } catch (e) {
      console.error("Cancel failed:", e);
    }
    setCancellingId(null);
  };

  const startEdit = (order) => {
    let meta = {};
    try { meta = JSON.parse(order.description || "{}"); } catch {}
    setEditingId(order.id);
    setEditPrice(String(meta.limitPrice || order.exchange_rate || ""));
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
    setEditError("");
  };

  const handleSaveEdit = async (order) => {
    const newPrice = parseFloat(editPrice);
    if (!newPrice || newPrice <= 0) {
      setEditError("Please enter a valid price.");
      return;
    }

    let meta = {};
    try { meta = JSON.parse(order.description || "{}"); } catch {}

    setSavingId(order.id);
    try {
      const updatedMeta = {
        ...meta,
        limitPrice: newPrice,
        modifiedAt: new Date().toISOString(),
        originalLimitPrice: meta.limitPrice || order.exchange_rate,
      };

      await Transaction.update(order.id, {
        exchange_rate: newPrice,
        description: JSON.stringify(updatedMeta),
      });

      setEditingId(null);
      setEditPrice("");
      setEditError("");
      onRefresh();
    } catch (e) {
      setEditError("Failed to save. Please try again.");
    }
    setSavingId(null);
  };

  if (pendingOrders.length === 0) return null;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-500" />
            Pending Limit Orders
            <Badge className="bg-yellow-100 text-yellow-700 text-xs font-bold">
              {pendingOrders.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="text-slate-400 hover:text-blue-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-2">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 leading-relaxed">
            Funds are <strong>frozen</strong> while orders are pending. Cancelling returns them to your available balance immediately. Modifying the limit price does not change your frozen amount.
          </p>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <CardContent className="p-3 pt-1 space-y-2">
              <AnimatePresence>
                {pendingOrders.map((order, i) => {
                  let meta = {};
                  try { meta = JSON.parse(order.description || "{}"); } catch {}
                  const { side, currency, symbol, limitPrice, shares, modifiedAt } = meta;
                  const isBuy = side === "buy";
                  const isEditing = editingId === order.id;
                  const isCancelling = cancellingId === order.id;
                  const isSaving = savingId === order.id;
                  const displaySymbol = (symbol || order.to_asset || order.from_asset || "").toUpperCase();
                  const displayPrice = parseFloat(limitPrice || order.exchange_rate || 0);
                  // Use per-symbol price from allPrices, fall back to livePrice only if same symbol
                  const orderMarketPrice = allPrices[displaySymbol]?.price || null;

                  let estimatedNote = null;
                  if (orderMarketPrice && side === "buy") {
                    const sharesAtLimit = (order.amount_usd * (1 - FEE_RATE)) / displayPrice;
                    estimatedNote = `≈ ${sharesAtLimit.toFixed(6)} ${displaySymbol} at fill`;
                  } else if (orderMarketPrice && side === "sell" && shares) {
                    const net = shares * displayPrice * (1 - FEE_RATE);
                    estimatedNote = `≈ $${net.toFixed(2)} USDT at fill`;
                  }

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.04 }}
                      className={`rounded-xl border transition-all ${
                        isEditing
                          ? "border-blue-300 bg-blue-50/60"
                          : "border-slate-100 bg-slate-50/80 hover:bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isBuy ? "bg-green-100" : "bg-red-100"
                          }`}>
                            {isBuy
                              ? <TrendingUp className="w-4 h-4 text-green-600" />
                              : <TrendingDown className="w-4 h-4 text-red-600" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-bold text-slate-900 text-sm">
                                {isBuy ? "Buy" : "Sell"} {displaySymbol}
                              </span>
                              <Badge className={`text-xs px-1.5 ${isBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                                {isBuy ? "LIMIT BUY" : "LIMIT SELL"}
                              </Badge>
                              <Badge className="bg-yellow-100 text-yellow-700 text-xs px-1.5 flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Frozen
                              </Badge>
                              {modifiedAt && (
                                <Badge className="bg-blue-100 text-blue-600 text-xs px-1.5">Modified</Badge>
                              )}
                            </div>

                            <div className="text-xs text-slate-500 space-y-0.5">
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                <span>
                                  {isBuy
                                    ? <><strong className="text-slate-600">${order.amount_usd?.toFixed(2)}</strong> {currency || "USDT"} frozen</>
                                    : <><strong className="text-slate-600">{parseFloat(shares || 0).toFixed(6)}</strong> {displaySymbol} frozen</>
                                  }
                                </span>
                                <span className="text-slate-300">|</span>
                                <span>Limit @ <strong className="text-slate-700">${displayPrice.toFixed(2)}</strong></span>
                                {orderMarketPrice && (
                                  <>
                                    <span className="text-slate-300">|</span>
                                    <span>Market <strong className={orderMarketPrice >= displayPrice ? "text-green-600" : "text-red-500"}>${orderMarketPrice.toFixed(2)}</strong></span>
                                  </>
                                )}
                              </div>
                              {estimatedNote && <p className="text-indigo-500 font-medium">{estimatedNote}</p>}
                              <p className="text-slate-400">
                                Placed {order.created_date ? format(new Date(order.created_date), "MMM d, yyyy HH:mm") : "—"}
                                {modifiedAt && ` · Edited ${format(new Date(modifiedAt), "MMM d HH:mm")}`}
                              </p>
                            </div>
                          </div>

                          {!isEditing && (
                            <div className="flex gap-1.5 flex-shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(order)}
                                disabled={isCancelling}
                                className="h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50 text-xs gap-1"
                              >
                                <Edit2 className="w-3 h-3" /> Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(order)}
                                disabled={isCancelling}
                                className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1"
                              >
                                {isCancelling
                                  ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                  : <X className="w-3 h-3" />}
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>

                        {isEditing && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-3 pt-3 border-t border-blue-200"
                          >
                            <p className="text-xs font-medium text-slate-700 mb-2">
                              Modify Limit Price
                              {orderMarketPrice && <span className="ml-2 text-slate-400 font-normal">(Market: ${orderMarketPrice.toFixed(2)})</span>}
                            </p>
                            <div className="flex gap-2 items-start">
                              <div className="flex-1">
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                  <Input
                                    type="number"
                                    value={editPrice}
                                    onChange={e => { setEditPrice(e.target.value); setEditError(""); }}
                                    placeholder="New limit price"
                                    className="pl-7 h-8 text-sm"
                                    step="0.01"
                                    min="0.01"
                                    autoFocus
                                  />
                                </div>
                                {editError && (
                                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> {editError}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400 mt-1">
                                  {isBuy ? "Executes when market ≤ limit." : "Executes when market ≥ limit."} Frozen amount unchanged.
                                </p>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(order)}
                                  disabled={isSaving}
                                  className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-xs gap-1"
                                >
                                  {isSaving
                                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <Check className="w-3 h-3" />}
                                  Save
                                </Button>
                                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isSaving} className="h-8 px-3 text-xs">
                                  Discard
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-700">
                      ${pendingOrders
                        .filter(o => { let m = {}; try { m = JSON.parse(o.description || "{}"); } catch {} return m.side === "buy"; })
                        .reduce((s, o) => s + (o.amount_usd || 0), 0)
                        .toFixed(2)}
                    </strong> USDT frozen in buy orders
                  </span>
                  <span>
                    <strong className="text-slate-700">
                      {pendingOrders.filter(o => { let m = {}; try { m = JSON.parse(o.description || "{}"); } catch {} return m.side === "sell"; }).length}
                    </strong> sell orders pending
                  </span>
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}