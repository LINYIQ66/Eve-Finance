import React, { useState, useEffect } from "react";
import { User, Transaction } from "@/entities/all";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";

import StockChart from "../components/usstocks/StockChart";
import StockMarketOverview from "../components/usstocks/StockMarketOverview";
import StockTradeInterface from "../components/usstocks/StockTradeInterface";

export default function USStocks() {
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // Lazy-load user on mount
  useEffect(() => {
    User.me().then(u => {
      setUser(u);
      setUserLoaded(true);
    }).catch(() => setUserLoaded(true));
  }, []);

  const handleTrade = async (side, symbol, amount, price, calc) => {
    try {
      if (!user) return { success: false, error: "Please log in to trade." };

      const newBalances = { ...(user.wallet_balances || {}) };
      const stockKey = symbol.toLowerCase();
      const feeUsd = side === "buy" ? calc.fee : calc.fee;

      if (side === "buy") {
        // Deduct USDT, add stock
        newBalances.usdt = (newBalances.usdt || 0) - amount;
        newBalances[stockKey] = (newBalances[stockKey] || 0) + calc.netUnits;
      } else {
        // Deduct stock, add USDT
        newBalances[stockKey] = (newBalances[stockKey] || 0) - amount;
        newBalances.usdt = (newBalances.usdt || 0) + calc.netUsdt;
      }

      // EVE reward: 100 EVE per $1 fee
      const eveReward = feeUsd * 100;
      if (eveReward > 0) {
        newBalances.eve = (newBalances.eve || 0) + eveReward;
      }

      await Transaction.create({
        transaction_type: "swap",
        user_email: user.email,
        from_asset: side === "buy" ? "USDT" : symbol,
        to_asset: side === "buy" ? symbol : "USDT",
        amount_usd: side === "buy" ? amount : calc.gross,
        fee_usd: feeUsd,
        exchange_rate: price,
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
      const updatedUser = await User.me();
      setUser(updatedUser);

      const received = side === "buy"
        ? `${calc.netUnits.toFixed(6)} ${symbol}`
        : `${calc.netUsdt.toFixed(4)} USDT`;

      return { success: true, message: `${side === "buy" ? "Bought" : "Sold"} successfully! Received ${received}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
              US Stocks
            </h1>
            <p className="text-slate-600 mt-2">Trade tokenized US stocks with live Binance pricing</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-100 text-green-800">
              <Zap className="w-3 h-3 mr-1" />
              Live WebSocket
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              <TrendingUp className="w-3 h-3 mr-1" />
              0.5% Fee
            </Badge>
          </div>
        </motion.div>

        {/* Chart + Market List */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-2 h-[560px]"
          >
            <StockChart symbol={selectedSymbol} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-[560px]"
          >
            <StockMarketOverview
              onStockClick={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
            />
          </motion.div>
        </div>

        {/* Trade Interface */}
        <div className="grid lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-2"
          >
            <StockTradeInterface
              user={userLoaded ? user : null}
              selectedSymbol={selectedSymbol}
              onTrade={handleTrade}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-6 h-full shadow-lg">
              <h3 className="text-lg font-bold mb-4">Trading Info</h3>
              <div className="space-y-3 text-blue-100 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                  <p>Prices sourced via Binance WebSocket for tokenized US stocks (BUSDT pairs)</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                  <p>Buy with USDT from your wallet, sell back to USDT anytime</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                  <p>0.5% fee applies on all trades. Earn 100 EVE per $1 in fees</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                  <p>Click any stock on the right to view its chart and start trading</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                  <p>Fractional trading supported — trade any amount of USDT</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}