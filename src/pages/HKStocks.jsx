import React, { useState, useEffect } from "react";
import { User, Transaction } from "@/entities/all";
import { getUserTransactions } from "@/api/eveClient";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Zap } from "lucide-react";
import { motion } from "framer-motion";

import HKStockChart from "../components/hkstocks/HKStockChart";
import HKStockMarketOverview from "../components/hkstocks/HKStockMarketOverview";
import HKStockTradeInterface from "../components/hkstocks/HKStockTradeInterface";
import HKStockHoldings from "../components/hkstocks/HKStockHoldings";
import HKStockTradeHistory from "../components/hkstocks/HKStockTradeHistory";
import HKStockPendingOrders from "../components/hkstocks/HKStockPendingOrders";
import USStocksFooter from "../components/usstocks/USStocksFooter";

const FEE_RATE = 0.001; // 0.1%

export default function HKStocks() {
  const [selectedSymbol, setSelectedSymbol] = useState("00700");
  const [user, setUser] = useState(null);
  const [livePrice, setLivePrice] = useState(null);
  const [allPrices, setAllPrices] = useState({});
  const [transactions, setTransactions] = useState([]);

  const refreshUser = async () => {
    try {
      const u = await User.me();
      setUser(u);
    } catch {}
  };

  const loadTransactions = async () => {
    try {
      const result = await getUserTransactions({});
      setTransactions(result?.data?.transactions || []);
    } catch {}
  };

  useEffect(() => {
    refreshUser();
    loadTransactions();
  }, []);

  useEffect(() => {
    setLivePrice(null);
  }, [selectedSymbol]);

  /**
   * handleTrade — identical logic to USStocks page
   * BUY:  calc = { spent, fee, sharesReceived, execPrice }
   * SELL: calc = { shares, gross, fee, netUsdt, execPrice }
   */
  const handleTrade = async (side, symbol, calc, currency = "USDT", orderType = "market") => {
    try {
      if (!user) return { success: false, error: "Please log in to trade." };

      // Limit orders: freeze funds and record as pending
      if (orderType === "limit") {
        const newBalances = { ...(user.wallet_balances || {}) };
        const stockKey = symbol.toLowerCase();
        const currencyKey = currency.toLowerCase();

        if (side === "buy") {
          const newCurrBal = (newBalances[currencyKey] || 0) - calc.spent;
          if (newCurrBal < -1e-9) return { success: false, error: `Insufficient ${currency} balance.` };
          newBalances[currencyKey] = Math.max(0, newCurrBal);
          const frozenKey = `frozen_${currencyKey}`;
          newBalances[frozenKey] = (newBalances[frozenKey] || 0) + calc.spent;
        } else {
          const newShares = (newBalances[stockKey] || 0) - calc.shares;
          if (newShares < -1e-9) return { success: false, error: `Insufficient ${symbol} balance.` };
          newBalances[stockKey] = Math.max(0, newShares);
          const frozenKey = `frozen_${stockKey}`;
          newBalances[frozenKey] = (newBalances[frozenKey] || 0) + calc.shares;
        }

        await Transaction.create({
          transaction_type: "swap",
          user_email: user.email,
          from_asset: side === "buy" ? currency : symbol,
          to_asset: side === "buy" ? symbol : currency,
          amount_usd: side === "buy" ? calc.spent : calc.gross,
          fee_usd: 0,
          exchange_rate: calc.execPrice,
          status: "pending",
          description: JSON.stringify({
            limitPrice: calc.execPrice,
            side,
            shares: side === "buy" ? calc.sharesReceived : calc.shares,
            currency,
            symbol,
          }),
        });

        await User.updateMyUserData({ wallet_balances: newBalances });
        await refreshUser();
        loadTransactions();
        return { success: true, message: `Limit ${side} order placed @ $${calc.execPrice.toFixed(3)}. Funds frozen, awaiting execution.` };
      }

      // Market orders: execute immediately
      const newBalances = { ...(user.wallet_balances || {}) };
      const stockKey = symbol.toLowerCase();
      const currencyKey = currency.toLowerCase();

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
      loadTransactions();

      const received = side === "buy"
        ? `${calc.sharesReceived.toFixed(6)} ${symbol}`
        : `$${calc.netUsdt.toFixed(2)} ${currency}`;

      return { success: true, message: `${side === "buy" ? "Bought" : "Sold"} successfully! Received ${received}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-rose-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-red-900 bg-clip-text text-transparent">
              港股交易
            </h1>
            <p className="text-slate-500 mt-1 text-sm">代币化港股 · 0.1% 手续费 · HKD自动折算USD结算</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 text-xs">
              <Zap className="w-3 h-3 mr-1" /> 实时报价
            </Badge>
            <Badge className="bg-red-100 text-red-800 text-xs">
              <TrendingUp className="w-3 h-3 mr-1" /> 0.1% 手续费
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
            <HKStockChart symbol={selectedSymbol} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="h-[520px]"
          >
            <HKStockMarketOverview
              onStockClick={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
              onPriceUpdate={setLivePrice}
              onAllPricesUpdate={setAllPrices}
              user={user}
            />
          </motion.div>
        </div>

        {/* Trade Interface */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <HKStockTradeInterface
              user={user}
              selectedSymbol={selectedSymbol}
              livePrice={livePrice}
              onTrade={handleTrade}
            />
          </motion.div>
          <HKStockPendingOrders
            transactions={transactions}
            onRefresh={() => { refreshUser(); loadTransactions(); }}
            livePrice={livePrice}
            allPrices={allPrices}
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <HKStockHoldings
              user={user}
              prices={allPrices}
              onSymbolClick={setSelectedSymbol}
              transactions={transactions}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <HKStockTradeHistory transactions={transactions} />
          </motion.div>
        </div>

        {/* Footer */}
        <USStocksFooter />
      </div>
    </div>
  );
}
