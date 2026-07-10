import React, { useState, useEffect } from "react";
import { User, Transaction } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";
import { getMetalPrices } from "@/api/eveClient";

import SwapInterface from "../components/trading/SwapInterface";
import TradingViewChart from "../components/trading/TradingViewChart";
import MarketOverview from "../components/trading/MarketOverview";

export default function Trading() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [prices, setPrices] = useState({
    usd: 1.00,
    sgd: 0.74,
    usdt: 1.00,
    gold: 2024.50,
    silver: 24.85,
    platinum: 1045.30,
    palladium: 1825.75
  });
  const [priceChanges, setPriceChanges] = useState({
    gold: 0,
    silver: 0,
    platinum: 0,
    palladium: 0
  });
  const [selectedSymbol, setSelectedSymbol] = useState("GOLD"); // New state for selected symbol

  useEffect(() => {
    loadUserData();
    loadPrices();
    
    // Update prices every 30 seconds
    const interval = setInterval(() => {
      loadPrices();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await User.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user data:", error);
    }
    setIsLoading(false);
  };

  const loadPrices = async () => {
    try {
      const priceData = await getMetalPrices();
      if (priceData.data.success) {
        setPrices(priceData.data.prices);
        setPriceChanges(priceData.data.changes);
      }
    } catch (error) {
      console.error("Error loading prices:", error);
    }
  };

  const executeSwap = async (fromAsset, toAsset, amount) => {
    try {
      const fromPrice = prices[fromAsset.toLowerCase()];
      const toPrice = prices[toAsset.toLowerCase()];
      const exchangeRate = fromPrice / toPrice;

      // Calculate amounts and values
      const grossAmountToAsset = amount * exchangeRate;
      const feeInToAsset = grossAmountToAsset * 0.02; // 2% fee
      const netAmountToAsset = grossAmountToAsset - feeInToAsset;
      
      const transactionValueUSD = amount * fromPrice;
      const feeValueUSD = feeInToAsset * toPrice;

      // Create main swap transaction record
      await Transaction.create({
        transaction_type: "swap",
        user_email: user.email,
        from_asset: fromAsset,
        to_asset: toAsset,
        amount_usd: transactionValueUSD,
        fee_usd: feeValueUSD,
        exchange_rate: exchangeRate,
        status: "completed"
      });
      
      // --- EVE Token Reward Logic ---
      // For every $1 USD in fees, user gets 100 EVE tokens
      const eveReward = feeValueUSD * 100; 
      if (eveReward > 0) {
          // Create EVE reward transaction record
          await Transaction.create({
              transaction_type: "eve_reward",
              user_email: user.email,
              to_asset: "EVE",
              amount_usd: feeValueUSD, // Value of the reward is the fee paid in USD
              eve_amount: eveReward,
              status: "completed",
              description: `EVE token reward for a $${feeValueUSD.toFixed(4)} trading fee.`
          });
      }

      // Update user balances
      const newBalances = { ...user.wallet_balances };
      newBalances[fromAsset.toLowerCase()] = (newBalances[fromAsset.toLowerCase()] || 0) - amount;
      newBalances[toAsset.toLowerCase()] = (newBalances[toAsset.toLowerCase()] || 0) + netAmountToAsset;
      // Add EVE tokens to wallet
      if (eveReward > 0) {
          newBalances['eve'] = (newBalances['eve'] || 0) + eveReward;
      }

      await User.updateMyUserData({ wallet_balances: newBalances });
      
      // Refresh user data
      loadUserData();
      
      return { success: true, netAmount: netAmountToAsset, fee: feeInToAsset };
    } catch (error) {
      console.error("Error executing swap:", error);
      return { success: false, error: error.message };
    }
  };

  const handleSymbolClick = (symbol) => {
    setSelectedSymbol(symbol);
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
              交易中心
            </h1>
            <p className="text-slate-600 mt-2">以实时市场价格交易贵金属</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-100 text-green-800">
              <Zap className="w-3 h-3 mr-1" />
              实时报价
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              2% 手续费
            </Badge>
          </div>
        </motion.div>

        {/* Chart and Market Overview */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Price Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-2 h-[560px]"
          >
            <TradingViewChart symbol={selectedSymbol} />
          </motion.div>

          {/* Market Overview */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-[560px]"
          >
            <MarketOverview 
              prices={prices} 
              priceChanges={priceChanges} 
              onSymbolClick={handleSymbolClick}
            />
          </motion.div>
        </div>

        {/* Swap Interface and Trading Tips */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-2"
          >
            <SwapInterface 
              user={user}
              prices={prices}
              onSwap={executeSwap}
              isLoading={isLoading}
            />
          </motion.div>

          {/* Trading Tips */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex"
          >
            <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg flex-1 flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <h3 className="text-lg font-bold mb-4">交易提示</h3>
                <div className="space-y-3 text-blue-100 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">所有贵金属价格按金衡盎司（31.1克）计价</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">点击上方任意金属查看其价格走势图</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">大额交易前请先关注价格走势</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">使用百分比按钮快速分配余额</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-sm">所有交易对目标资产收取 2% 手续费</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* RSS Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8"
        >
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="text-slate-900">最新资讯与动态</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-hidden rounded-b-lg">
                <iframe 
                  width="100%" 
                  height="800" 
                  src="https://rss.app/embed/v1/wall/t4eSLPbO9kswK4As" 
                  frameBorder="0"
                  className="w-full"
                  title="Latest News Feed"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}