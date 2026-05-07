import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FEE_RATE = 0.001; // 0.1%

export default function StockTradeInterface({ user, selectedSymbol, livePrice, onTrade }) {
  const [side, setSide] = useState("buy");       // "buy" | "sell"
  const [orderType, setOrderType] = useState("market"); // "market" | "limit"
  // For buy: usdtAmount is how much USDT to spend
  // For sell: sharesAmount is how many shares to sell
  const [usdtAmount, setUsdtAmount] = useState("");
  const [sharesAmount, setSharesAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [result, setResult] = useState(null);
  const [isTrading, setIsTrading] = useState(false);

  const usdtBalance = user?.wallet_balances?.usdt || 0;
  const stockBalance = user?.wallet_balances?.[selectedSymbol.toLowerCase()] || 0;

  const execPrice = orderType === "market" ? livePrice : parseFloat(limitPrice) || 0;

  // ---- BUY calculation ----
  // User pays X USDT → receives shares
  // totalCost = usdtAmount (what user pays, fee included)
  // fee = usdtAmount * FEE_RATE
  // sharesReceived = (usdtAmount - fee) / price
  const calcBuy = () => {
    const spent = parseFloat(usdtAmount) || 0;
    if (spent <= 0 || execPrice <= 0) return null;
    const fee = spent * FEE_RATE;
    const netUsdt = spent - fee;
    const sharesReceived = netUsdt / execPrice;
    return { spent, fee, sharesReceived, execPrice };
  };

  // ---- SELL calculation ----
  // User sells X shares → receives USDT
  // gross = shares * price
  // fee = gross * FEE_RATE
  // netUsdt = gross - fee
  const calcSell = () => {
    const shares = parseFloat(sharesAmount) || 0;
    if (shares <= 0 || execPrice <= 0) return null;
    const gross = shares * execPrice;
    const fee = gross * FEE_RATE;
    const netUsdt = gross - fee;
    return { shares, gross, fee, netUsdt, execPrice };
  };

  const calc = side === "buy" ? calcBuy() : calcSell();

  const isInsufficient = side === "buy"
    ? (parseFloat(usdtAmount) || 0) > usdtBalance
    : (parseFloat(sharesAmount) || 0) > stockBalance;

  const isLimitPriceInvalid = orderType === "limit" && (parseFloat(limitPrice) || 0) <= 0;
  const isDisabled = !calc || isInsufficient || isTrading || isLimitPriceInvalid || !execPrice;

  const handleTrade = async () => {
    if (isDisabled) return;
    setIsTrading(true);
    setResult(null);
    const res = await onTrade(side, selectedSymbol, calc);
    setResult(res);
    setIsTrading(false);
    if (res.success) {
      setUsdtAmount("");
      setSharesAmount("");
      setTimeout(() => setResult(null), 4000);
    }
  };

  const setPercentageBuy = (pct) => {
    setUsdtAmount(((usdtBalance * pct / 100)).toFixed(2));
  };

  const setPercentageSell = (pct) => {
    setSharesAmount(((stockBalance * pct / 100)).toFixed(6));
  };

  const switchSide = (newSide) => {
    setSide(newSide);
    setUsdtAmount("");
    setSharesAmount("");
    setResult(null);
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-slate-900">
          <span>Trade {selectedSymbol}</span>
          <div className="text-right">
            {livePrice ? (
              <span className="text-xl font-bold text-slate-900">${livePrice.toFixed(2)}</span>
            ) : (
              <span className="text-sm text-slate-400 animate-pulse">Loading price...</span>
            )}
            <p className="text-xs text-slate-400 font-normal">Market Price</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Buy / Sell Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          <button
            onClick={() => switchSide("buy")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
              side === "buy" ? "bg-green-500 text-white" : "bg-white text-slate-500 hover:bg-green-50"
            }`}
          >
            <TrendingUp className="w-4 h-4" /> Buy
          </button>
          <button
            onClick={() => switchSide("sell")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
              side === "sell" ? "bg-red-500 text-white" : "bg-white text-slate-500 hover:bg-red-50"
            }`}
          >
            <TrendingDown className="w-4 h-4" /> Sell
          </button>
        </div>

        {/* Market / Limit Toggle */}
        <div className="flex gap-2">
          {["market", "limit"].map(type => (
            <button
              key={type}
              onClick={() => { setOrderType(type); setLimitPrice(""); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all capitalize ${
                orderType === type
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
              }`}
            >
              {type === "market" ? "Market Order" : "Limit Order"}
            </button>
          ))}
        </div>

        {/* Limit Price Input */}
        {orderType === "limit" && (
          <div className="space-y-1">
            <Label className="text-sm text-slate-700">Limit Price (USDT)</Label>
            <Input
              type="number"
              placeholder={livePrice ? `e.g. ${livePrice.toFixed(2)}` : "Enter limit price"}
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              min="0"
            />
            <p className="text-xs text-slate-400">Current market: {livePrice ? `$${livePrice.toFixed(2)}` : "—"}</p>
          </div>
        )}

        {/* BUY: input USDT amount */}
        {side === "buy" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label className="text-slate-700">Amount to Spend (USDT)</Label>
              <span className="text-slate-500">Balance: {usdtBalance.toFixed(2)} USDT</span>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={usdtAmount}
              onChange={e => setUsdtAmount(e.target.value)}
              className="text-base"
              min="0"
            />
            <div className="flex gap-1.5">
              {[25, 50, 75, 100].map(pct => (
                <Button key={pct} variant="outline" size="sm" onClick={() => setPercentageBuy(pct)}
                  className="text-xs flex-1" disabled={usdtBalance <= 0}>
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* SELL: input shares amount */}
        {side === "sell" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label className="text-slate-700">Shares to Sell ({selectedSymbol})</Label>
              <span className="text-slate-500">Balance: {stockBalance.toFixed(6)} {selectedSymbol}</span>
            </div>
            <Input
              type="number"
              placeholder="0.000000"
              value={sharesAmount}
              onChange={e => setSharesAmount(e.target.value)}
              className="text-base"
              min="0"
              step="0.000001"
            />
            <div className="flex gap-1.5">
              {[25, 50, 75, 100].map(pct => (
                <Button key={pct} variant="outline" size="sm" onClick={() => setPercentageSell(pct)}
                  className="text-xs flex-1" disabled={stockBalance <= 0}>
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Order Summary */}
        {calc && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-sm"
          >
            <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-2">Order Summary</p>
            {side === "buy" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Exec. Price</span>
                  <span className="font-medium">${calc.execPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">You Spend</span>
                  <span className="font-medium">${calc.spent.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee (0.1%)</span>
                  <span className="text-red-500 font-medium">-${calc.fee.toFixed(4)} USDT</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-700">You Receive</span>
                  <span className="font-bold text-green-600">{calc.sharesReceived.toFixed(6)} {selectedSymbol}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">Exec. Price</span>
                  <span className="font-medium">${calc.execPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">You Sell</span>
                  <span className="font-medium">{calc.shares.toFixed(6)} {selectedSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Value</span>
                  <span className="font-medium">${calc.gross.toFixed(2)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee (0.1%)</span>
                  <span className="text-red-500 font-medium">-${calc.fee.toFixed(4)} USDT</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-700">You Receive</span>
                  <span className="font-bold text-green-600">${calc.netUsdt.toFixed(2)} USDT</span>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Errors */}
        <AnimatePresence>
          {isInsufficient && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Insufficient {side === "buy" ? "USDT" : selectedSymbol} balance
            </motion.div>
          )}
          {isLimitPriceInvalid && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Please enter a valid limit price
            </motion.div>
          )}
          {!livePrice && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Waiting for live price data...
            </motion.div>
          )}
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                result.success ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"
              }`}>
              {result.success
                ? <><CheckCircle className="w-4 h-4 flex-shrink-0" />{result.message}</>
                : <><AlertCircle className="w-4 h-4 flex-shrink-0" />{result.error}</>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execute Button */}
        <Button
          onClick={handleTrade}
          disabled={isDisabled}
          className={`w-full text-base py-5 font-semibold ${
            side === "buy"
              ? "bg-green-500 hover:bg-green-600 disabled:bg-green-200"
              : "bg-red-500 hover:bg-red-600 disabled:bg-red-200"
          }`}
        >
          {isTrading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Processing...
            </div>
          ) : (
            `${orderType === "limit" ? "Place Limit Order" : side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`
          )}
        </Button>

        <p className="text-xs text-slate-400 text-center">
          {orderType === "limit"
            ? "Limit orders execute when market reaches your target price"
            : "Market orders execute at current market price"}
          {" · "}0.1% fee on all trades
        </p>
      </CardContent>
    </Card>
  );
}