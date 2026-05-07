import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, AlertCircle, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { US_STOCKS } from "./StockMarketOverview";

export default function StockTradeInterface({ user, selectedSymbol, onTrade }) {
  const [side, setSide] = useState("buy"); // "buy" | "sell"
  const [amount, setAmount] = useState(""); // USDT amount for buy, stock units for sell
  const [livePrice, setLivePrice] = useState(null);
  const [result, setResult] = useState(null);
  const [isTrading, setIsTrading] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const stock = US_STOCKS.find(s => s.symbol === selectedSymbol) || US_STOCKS[0];

  // Connect WebSocket for live price of selected stock
  useEffect(() => {
    const connectWs = () => {
      if (wsRef.current) wsRef.current.close();
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stock.binance}@ticker`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        setLivePrice(parseFloat(d.c));
      };
      ws.onclose = () => {
        reconnectRef.current = setTimeout(connectWs, 3000);
      };
    };
    setLivePrice(null);
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [selectedSymbol]);

  const usdtBalance = user?.wallet_balances?.usdt || 0;
  const stockBalance = user?.wallet_balances?.[selectedSymbol.toLowerCase()] || 0;

  const parsedAmount = parseFloat(amount) || 0;

  // Calculate preview
  const calcBuy = () => {
    if (!livePrice || parsedAmount <= 0) return null;
    const units = parsedAmount / livePrice;
    const fee = parsedAmount * 0.005;
    const netUnits = units * (1 - 0.005);
    return { units, fee, netUnits, cost: parsedAmount };
  };

  const calcSell = () => {
    if (!livePrice || parsedAmount <= 0) return null;
    const gross = parsedAmount * livePrice;
    const fee = gross * 0.005;
    const netUsdt = gross - fee;
    return { gross, fee, netUsdt, units: parsedAmount };
  };

  const calc = side === "buy" ? calcBuy() : calcSell();

  const isInsufficient = side === "buy"
    ? parsedAmount > usdtBalance
    : parsedAmount > stockBalance;

  const handleTrade = async () => {
    if (!calc || isInsufficient || isTrading) return;
    setIsTrading(true);
    const res = await onTrade(side, selectedSymbol, parsedAmount, livePrice, calc);
    setResult(res);
    setIsTrading(false);
    if (res.success) {
      setAmount("");
      setTimeout(() => setResult(null), 3000);
    }
  };

  const setPercentage = (pct) => {
    if (side === "buy") {
      setAmount(((usdtBalance * pct / 100) * 100 / 100).toFixed(2));
    } else {
      setAmount(((stockBalance * pct / 100) * 1e6 / 1e6).toFixed(6));
    }
  };

  const isDisabled = !amount || !calc || isInsufficient || isTrading || !livePrice;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-2xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-slate-900">
            <ArrowUpDown className="w-5 h-5 text-blue-600" />
            Trade {selectedSymbol}
          </span>
          {livePrice ? (
            <span className="text-xl font-bold text-slate-900">${livePrice.toFixed(2)}</span>
          ) : (
            <span className="text-sm text-slate-400">Connecting...</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Buy / Sell Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          <button
            onClick={() => { setSide("buy"); setAmount(""); setResult(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
              side === "buy"
                ? "bg-green-500 text-white"
                : "bg-white text-slate-600 hover:bg-green-50"
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-1" />
            Buy
          </button>
          <button
            onClick={() => { setSide("sell"); setAmount(""); setResult(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
              side === "sell"
                ? "bg-red-500 text-white"
                : "bg-white text-slate-600 hover:bg-red-50"
            }`}
          >
            <TrendingDown className="w-4 h-4 inline mr-1" />
            Sell
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <label className="font-medium text-slate-700">
              {side === "buy" ? "Pay (USDT)" : `Sell (${selectedSymbol})`}
            </label>
            <span className="text-slate-500">
              Balance: {side === "buy"
                ? `${usdtBalance.toFixed(2)} USDT`
                : `${stockBalance.toFixed(6)} ${selectedSymbol}`}
            </span>
          </div>
          <Input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="text-lg"
            min="0"
          />
          <div className="flex gap-2">
            {[25, 50, 75, 100].map(pct => (
              <Button
                key={pct}
                variant="outline"
                size="sm"
                onClick={() => setPercentage(pct)}
                className="text-xs flex-1"
                disabled={side === "buy" ? usdtBalance <= 0 : stockBalance <= 0}
              >
                {pct}%
              </Button>
            ))}
          </div>
        </div>

        {/* Calculation Preview */}
        {calc && parsedAmount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-slate-50 rounded-lg space-y-2 text-sm"
          >
            {side === "buy" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">You get (est.)</span>
                  <span className="font-medium">{calc.netUnits.toFixed(6)} {selectedSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee (0.5%)</span>
                  <span className="text-red-600 font-medium">-${(calc.fee).toFixed(4)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">You get (est.)</span>
                  <span className="font-medium">{calc.netUsdt.toFixed(4)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee (0.5%)</span>
                  <span className="text-red-600 font-medium">-${calc.fee.toFixed(4)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t pt-2">
              <span className="text-slate-500">Price</span>
              <span className="font-bold">${livePrice?.toFixed(2)}</span>
            </div>
          </motion.div>
        )}

        {/* Errors */}
        <AnimatePresence>
          {isInsufficient && parsedAmount > 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg"
            >
              <AlertCircle className="w-4 h-4" />
              Insufficient {side === "buy" ? "USDT" : selectedSymbol} balance
            </motion.div>
          )}
          {result && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                result.success ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
              }`}
            >
              {result.success
                ? <><CheckCircle className="w-4 h-4" />{result.message}</>
                : <><AlertCircle className="w-4 h-4" />{result.error}</>
              }
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execute Button */}
        <Button
          onClick={handleTrade}
          disabled={isDisabled}
          className={`w-full text-lg py-6 ${
            side === "buy"
              ? "bg-green-500 hover:bg-green-600"
              : "bg-red-500 hover:bg-red-600"
          }`}
        >
          {isTrading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Processing...
            </div>
          ) : (
            `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}