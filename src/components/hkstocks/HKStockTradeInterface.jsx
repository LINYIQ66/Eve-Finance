import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getHKStockPrices } from "@/api/eveClient";

const FEE_RATE = 0.001; // 0.1%

export default function HKStockTradeInterface({ user, selectedSymbol, livePrice: livePriceProp, onTrade }) {
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [fetchedPrice, setFetchedPrice] = useState(null);

  useEffect(() => {
    setFetchedPrice(null);
    if (!livePriceProp) {
      getHKStockPrices({ symbols: selectedSymbol }).then(res => {
        const p = res?.data?.prices?.[selectedSymbol]?.price;
        if (p) setFetchedPrice(p);
      }).catch(() => {});
    }
  }, [selectedSymbol, livePriceProp]);

  const livePrice = livePriceProp || fetchedPrice;

  const [spendAmount, setSpendAmount] = useState("");
  const [buyShares, setBuyShares] = useState("");
  const [sellShares, setSellShares] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  const [currency, setCurrency] = useState("USDT");
  const [result, setResult] = useState(null);
  const [isTrading, setIsTrading] = useState(false);
  const [lastBuyEdit, setLastBuyEdit] = useState("spend");

  // HK stocks priced in HKD, convert to USD/USDT (approx 1 USD ≈ 7.8 HKD)
  const HKD_TO_USD = 7.8;
  const livePriceUSD = livePrice ? livePrice / HKD_TO_USD : 0;

  const usdtBalance = user?.wallet_balances?.usdt || 0;
  const usdBalance = user?.wallet_balances?.usd || 0;
  const stockBalance = user?.wallet_balances?.[selectedSymbol.toLowerCase()] || 0;
  const payBalance = currency === "USDT" ? usdtBalance : usdBalance;

  const execPrice = orderType === "market"
    ? (livePriceUSD || 0)
    : (parseFloat(limitPrice) || 0);

  const handleSpendChange = (val) => {
    setSpendAmount(val);
    setLastBuyEdit("spend");
    if (execPrice > 0 && val !== "") {
      const spent = parseFloat(val) || 0;
      const netSpent = spent * (1 - FEE_RATE);
      setBuyShares((netSpent / execPrice).toFixed(6));
    } else {
      setBuyShares("");
    }
  };

  const handleBuySharesChange = (val) => {
    setBuyShares(val);
    setLastBuyEdit("shares");
    if (execPrice > 0 && val !== "") {
      const shares = parseFloat(val) || 0;
      const spendNeeded = (shares * execPrice) / (1 - FEE_RATE);
      setSpendAmount(spendNeeded.toFixed(2));
    } else {
      setSpendAmount("");
    }
  };

  const handleLimitPriceChange = (val) => {
    setLimitPrice(val);
    const price = parseFloat(val) || 0;
    if (price <= 0) return;
    if (lastBuyEdit === "spend" && spendAmount !== "") {
      const spent = parseFloat(spendAmount) || 0;
      setBuyShares(((spent * (1 - FEE_RATE)) / price).toFixed(6));
    } else if (lastBuyEdit === "shares" && buyShares !== "") {
      const shares = parseFloat(buyShares) || 0;
      setSpendAmount(((shares * price) / (1 - FEE_RATE)).toFixed(2));
    }
  };

  const calcBuy = () => {
    const spent = parseFloat(spendAmount) || 0;
    const shares = parseFloat(buyShares) || 0;
    if (spent <= 0 || shares <= 0 || execPrice <= 0) return null;
    const fee = spent * FEE_RATE;
    return { spent, fee, sharesReceived: shares, execPrice };
  };

  const calcSell = () => {
    const shares = parseFloat(sellShares) || 0;
    if (shares <= 0 || execPrice <= 0) return null;
    const gross = shares * execPrice;
    const fee = gross * FEE_RATE;
    const netUsdt = gross - fee;
    return { shares, gross, fee, netUsdt, execPrice };
  };

  const calc = side === "buy" ? calcBuy() : calcSell();

  const EPSILON = 1e-9;
  const isInsufficientBuy = side === "buy" && (parseFloat(spendAmount) || 0) > payBalance + EPSILON;
  const isInsufficientSell = side === "sell" && (parseFloat(sellShares) || 0) > stockBalance + EPSILON;
  const isInsufficient = isInsufficientBuy || isInsufficientSell;
  const isLimitPriceInvalid = orderType === "limit" && (parseFloat(limitPrice) || 0) <= 0;
  const isDisabled = !calc || isInsufficient || isTrading || isLimitPriceInvalid || !execPrice;

  const handleTrade = async () => {
    if (isDisabled) return;
    setIsTrading(true);
    setResult(null);
    const res = await onTrade(side, selectedSymbol, calc, currency, orderType);
    setResult(res);
    setIsTrading(false);
    if (res.success) {
      setSpendAmount(""); setBuyShares(""); setSellShares("");
      setTimeout(() => setResult(null), 4000);
    }
  };

  const setPercentageBuy = (pct) => {
    handleSpendChange((payBalance * pct / 100).toFixed(2));
  };

  const setPercentageSell = (pct) => {
    setSellShares(((stockBalance * pct / 100)).toFixed(6));
  };

  const switchSide = (newSide) => {
    setSide(newSide);
    setSpendAmount(""); setBuyShares(""); setSellShares("");
    setResult(null);
    setCurrency("USDT");
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-slate-900">
          <span>交易 {selectedSymbol}</span>
          <div className="text-right">
            {livePrice ? (
              <>
                <span className="text-xl font-bold text-slate-900">HK${livePrice.toFixed(3)}</span>
                <p className="text-xs text-slate-400 font-normal">≈ ${livePriceUSD.toFixed(3)} USD</p>
              </>
            ) : (
              <span className="text-sm text-slate-400 animate-pulse">行情加载中...</span>
            )}
            <p className="text-xs text-slate-400 font-normal">市场价格</p>
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
            <TrendingUp className="w-4 h-4" /> 买入
          </button>
          <button
            onClick={() => switchSide("sell")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
              side === "sell" ? "bg-red-500 text-white" : "bg-white text-slate-500 hover:bg-red-50"
            }`}
          >
            <TrendingDown className="w-4 h-4" /> 卖出
          </button>
        </div>

        {/* Market / Limit Toggle */}
        <div className="flex gap-2">
          {["market", "limit"].map(type => (
            <button
              key={type}
              onClick={() => { setOrderType(type); setLimitPrice(""); setBuyShares(""); setSpendAmount(""); setSellShares(""); setResult(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all capitalize ${
                orderType === type
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-red-300"
              }`}
            >
              {type === "market" ? "市价单" : "限价单"}
            </button>
          ))}
        </div>

        {/* Limit Price Input */}
        {orderType === "limit" && (
          <div className="space-y-1">
            <Label className="text-sm text-slate-700">
              {side === "buy" ? "限价买入价格" : "限价卖出价格"} (USD)
            </Label>
            <Input
              type="number"
              placeholder={livePriceUSD ? `如 ${livePriceUSD.toFixed(3)}` : "输入限价"}
              value={limitPrice}
              onChange={e => handleLimitPriceChange(e.target.value)}
              min="0"
            />
            <p className="text-xs text-slate-400">当前市价: {livePriceUSD ? `$${livePriceUSD.toFixed(3)}` : "—"} (HK${livePrice ? livePrice.toFixed(2) : "—"})</p>
          </div>
        )}

        {/* Market price display */}
        {orderType === "market" && (
          <div className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg border border-red-100">
            <span className="text-xs text-red-600 font-medium">成交价格</span>
            <span className="text-sm font-bold text-red-700">
              {livePrice ? `HK${livePrice.toFixed(3)} ≈ $${livePriceUSD.toFixed(3)}` : "—"}
            </span>
          </div>
        )}

        {/* ===== BUY SECTION ===== */}
        {side === "buy" && (
          <>
            <div className="flex gap-2">
              {["USDT", "USD"].map(c => (
                <button
                  key={c}
                  onClick={() => { setCurrency(c); setSpendAmount(""); setBuyShares(""); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all ${
                    currency === c
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  用 {c} 支付
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <Label className="text-slate-700">支付金额 ({currency})</Label>
                <span className="text-slate-500">余额: {payBalance.toFixed(2)} {currency}</span>
              </div>
              <Input
                type="number"
                placeholder="0.00"
                value={spendAmount}
                onChange={e => handleSpendChange(e.target.value)}
                className={`text-base ${isInsufficientBuy ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                min="0"
              />
              <div className="flex gap-1.5">
                {[25, 50, 75, 100].map(pct => (
                  <Button key={pct} variant="outline" size="sm" onClick={() => setPercentageBuy(pct)}
                    className="text-xs flex-1" disabled={payBalance <= 0}>
                    {pct}%
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <Label className="text-slate-700">数量（股数）</Label>
                {execPrice > 0 && (
                  <span className="text-xs text-slate-400">
                    最多 ≈ {((payBalance * (1 - FEE_RATE)) / execPrice).toFixed(6)} {selectedSymbol}
                  </span>
                )}
              </div>
              <Input
                type="number"
                placeholder="0.000000"
                value={buyShares}
                onChange={e => handleBuySharesChange(e.target.value)}
                className="text-base"
                min="0"
                step="0.000001"
              />
            </div>
          </>
        )}

        {/* ===== SELL SECTION ===== */}
        {side === "sell" && (
          <>
            <div className="flex gap-2">
              {["USDT", "USD"].map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all ${
                    currency === c
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  收取 {c}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <Label className="text-slate-700">卖出股数 ({selectedSymbol})</Label>
                <span className="text-slate-500">持仓: {stockBalance.toFixed(6)} {selectedSymbol}</span>
              </div>
              <Input
                type="number"
                placeholder="0.000000"
                value={sellShares}
                onChange={e => setSellShares(e.target.value)}
                className={`text-base ${isInsufficientSell ? "border-red-400 focus-visible:ring-red-300" : ""}`}
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

            {execPrice > 0 && sellShares !== "" && parseFloat(sellShares) > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-500">预计到账</span>
                <span className="text-sm font-bold text-green-600">
                  ≈ ${((parseFloat(sellShares) * execPrice) * (1 - FEE_RATE)).toFixed(2)} {currency}
                </span>
              </div>
            )}
          </>
        )}

        {/* Order Summary */}
        {calc && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-sm"
          >
            <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-2">订单摘要</p>
            {side === "buy" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">成交价格</span>
                  <span className="font-medium">≈ ${calc.execPrice.toFixed(3)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">支付金额</span>
                  <span className="font-medium">${calc.spent.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">手续费 (0.1%)</span>
                  <span className="text-red-500 font-medium">-${calc.fee.toFixed(4)} {currency}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-700">实际到账</span>
                  <span className="font-bold text-green-600">{calc.sharesReceived.toFixed(6)} {selectedSymbol}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">成交价格</span>
                  <span className="font-medium">≈ ${calc.execPrice.toFixed(3)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">卖出数量</span>
                  <span className="font-medium">{calc.shares.toFixed(6)} {selectedSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">交易总额</span>
                  <span className="font-medium">${calc.gross.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">手续费 (0.1%)</span>
                  <span className="text-red-500 font-medium">-${calc.fee.toFixed(4)} {currency}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold text-slate-700">实际到账</span>
                  <span className="font-bold text-green-600">${calc.netUsdt.toFixed(2)} {currency}</span>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Errors / Messages */}
        <AnimatePresence>
          {isInsufficient && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {side === "buy" ? `${currency} 余额不足（最多可用: ${payBalance.toFixed(2)}）` : `${selectedSymbol} 持仓不足（最多可卖: ${stockBalance.toFixed(6)}）`}
            </motion.div>
          )}
          {isLimitPriceInvalid && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              请输入有效的限价
            </motion.div>
          )}
          {!livePrice && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              正在获取实时行情，请稍候...
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
              处理中...
            </div>
          ) : (
            `${orderType === "limit" ? "提交限价单" : side === "buy" ? "买入" : "卖出"} ${selectedSymbol}`
          )}
        </Button>

        <p className="text-xs text-slate-400 text-center">
          {orderType === "limit"
            ? "限价单将在市价触达目标价格时自动成交"
            : "市价单按当前市场价格立即成交"}
          {" · "}所有交易收取 0.1% 手续费{" · "}港股价自动折算为USD结算
        </p>
      </CardContent>
    </Card>
  );
}
