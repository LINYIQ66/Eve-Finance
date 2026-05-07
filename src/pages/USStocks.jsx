import React, { useState, useEffect } from "react";
import { User, Transaction } from "@/entities/all";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";

import StockChart from "../components/usstocks/StockChart";
import StockMarketOverview from "../components/usstocks/StockMarketOverview";
import StockTradeInterface from "../components/usstocks/StockTradeInterface";
import StockHoldings from "../components/usstocks/StockHoldings";

const FEE_RATE = 0.001; // 0.1%

export default function USStocks() {
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [user, setUser] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [allPrices, setAllPrices] = useState({});

  const refreshUser = async () => {
    try {
      const u = await User.me();
      setUser(u);
    } catch {}
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // Reset livePrice when symbol changes
  useEffect(() => {
    setLivePrice(null);
  }, [selectedSymbol]);

  /**
   * handleTrade is called with the already-computed calc object from StockTradeInterface.
   * BUY:  calc = { spent, fee, sharesReceived, execPrice }
   *       Deduct `spent` USDT, add `sharesReceived` shares
   * SELL: calc = { shares, gross, fee, netUsdt, execPrice }
   *       Deduct `shares` stock, add `netUsdt` USDT
   */
  const handleTrade = async (side, symbol, calc, currency = "USDT") => {
    try {
      if (!user) return { success: false, error: "Please log in to trade." };

      const newBalances = { ...(user.wallet_balances || {}) };
      const stockKey = symbol.toLowerCase();
      const currencyKey = currency.toLowerCase(); // "usdt" or "usd"

      if (side === "buy") {
        const newCurrBal = (newBalances[currencyKey] || 0) - calc.spent;
        if (newCurrBal < 0) return { success: false, error: `Insufficient ${currency} balance.` };
        newBalances[currencyKey] = newCurrBal;
        newBalances[stockKey] = (newBalances[stockKey] || 0) + calc.sharesReceived;
      } else {
        const newShares = (newBalances[stockKey] || 0) - calc.shares;
        if (newShares < 0) return { success: false, error: `Insufficient ${symbol} balance.` };
        newBalances[stockKey] = newShares;
        newBalances[currencyKey] = (newBalances[currencyKey] || 0) + calc.netUsdt;
      }

      // EVE reward: 100 EVE per $1 fee
      const feeUsd = calc.fee;
      const eveReward = feeUsd * 100;
      if (eveReward > 0) {
        newBalances.eve = (newBalances.eve || 0) + eveReward;
      }

      // Record transaction
      await Transaction.create({
        transaction_type: "swap",
        user_email: user.email,
        from_asset: side === "buy" ? currency : symbol,
        to_asset: side === "buy" ? symbol : currency,
        amount_usd: side === "buy" ? calc.spent : calc.gross,
        fee_usd: feeUsd,
        exchange_rate: calc.execPrice,
        status: "completed",
      });

      if (eveReward > 0) {
        await Transaction.create({
          transaction_type: "eve_reward",
          user_email: user.email,
          to_asset: "EVE",
          amount_usd: feeUsd,
          eve_amount: eveReward,
          status: "completed",
        });
      }

      await User.updateMyUserData({ wallet_balances: newBalances });
      await refreshUser();

      const received = side === "buy"
        ? `${calc.sharesReceived.toFixed(6)} ${symbol}`
        : `$${calc.netUsdt.toFixed(2)} ${currency}`;

      return { success: true, message: `${side === "buy" ? "Bought" : "Sold"} successfully! Received ${received}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
              US Stocks
            </h1>
            <p className="text-slate-500 mt-1 text-sm">Tokenized US stocks via Binance · 0.1% fee</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 text-xs">
              <Zap className="w-3 h-3 mr-1" /> Live Prices
            </Badge>
            <Badge className="bg-blue-100 text-blue-800 text-xs">
              <TrendingUp className="w-3 h-3 mr-1" /> 0.1% Fee
            </Badge>
          </div>
        </motion.div>

        {/* Chart + Market List */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2 h-[520px]"
          >
            <StockChart symbol={selectedSymbol} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="h-[520px]"
          >
            <StockMarketOverview
              onStockClick={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
              onPriceUpdate={setLivePrice}
              onAllPricesUpdate={setAllPrices}
            />
          </motion.div>
        </div>

        {/* Trade Interface */}
        <div className="grid lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2 space-y-4"
          >
            <StockTradeInterface
              user={user}
              selectedSymbol={selectedSymbol}
              livePrice={livePrice}
              onTrade={handleTrade}
            />
            <StockHoldings
              user={user}
              prices={allPrices}
              onSymbolClick={setSelectedSymbol}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg h-full">
              <h3 className="text-base font-bold mb-4">Trading Info</h3>
              <div className="space-y-3 text-blue-100 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p>Real-time prices sourced via CoinMarketCap for tokenized US stocks</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p>Buy with USDT from your wallet, sell back to USDT anytime</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p>0.1% fee applies on all trades. Earn 100 EVE per $1 in fees</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p>Click any stock on the right to view its chart and start trading</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p>Fractional trading supported — trade any amount of USDT</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p><strong className="text-white">Market Order:</strong> Executes at current price instantly</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                  <p><strong className="text-white">Limit Order:</strong> Set your target price for execution</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}