import React, { useState, useEffect } from "react";
import { User, Stake, Transaction } from "@/entities/all";
import { Card, CardContent } from "@/components/ui/card";
import { PiggyBank, DollarSign, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { getMetalPrices, unstakeAndClaim } from "@/api/eveClient";

import StakeForm from "../components/staking/StakeForm";
import ActiveStakes from "../components/staking/ActiveStakes";

export default function Staking() {
  const [user, setUser] = useState(null);
  const [stakes, setStakes] = useState([]);
  const [prices, setPrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // The user object is needed for other parts of the page.
      const userData = await User.me();
      
      // FIX: RLS now handles user filtering automatically.
      // We only need to filter by status on the client-side call.
      const userStakes = await Stake.filter({ 
        status: "active" 
      }, "-created_date");

      const priceData = await getMetalPrices();
      
      console.log('User stakes loaded (after fix):', userStakes);
      
      setUser(userData);
      setStakes(userStakes);
      if (priceData.data.success) {
        setPrices(priceData.data.prices);
      }
    } catch (error) {
      console.error("Error loading staking data:", error);
    }
    setIsLoading(false);
  };

  const handleStake = async (asset, amount) => {
    try {
      console.log('Creating stake:', { asset, amount, user_email: user.email }); // 调试日志
      
      // 1. Create Stake record
      const newStake = await Stake.create({
        user_email: user.email,
        asset: asset,
        amount: amount,
        start_date: new Date().toISOString(),
        status: "active"
      });
      
      console.log('Stake created:', newStake); // 调试日志

      // 2. Create Transaction record for tracking
      const stakeValueUsd = amount * (prices[asset.toLowerCase()] || 0);
      await Transaction.create({
        transaction_type: "staking",
        user_email: user.email,
        from_asset: asset,
        amount_usd: stakeValueUsd,
        status: "completed",
        description: `Staked ${amount} ${asset}`
      });
      
      // 3. Update user balances to move staked amount to 'locked_balances'
      const assetKey = asset.toLowerCase();
      const newWalletBalances = { ...user.wallet_balances };
      const newLockedBalances = { ...user.locked_balances || {} }; // Initialize with empty object if null/undefined

      newWalletBalances[assetKey] = (newWalletBalances[assetKey] || 0) - amount;
      newLockedBalances[assetKey] = (newLockedBalances[assetKey] || 0) + amount;

      await User.updateMyUserData({ 
        wallet_balances: newWalletBalances,
        locked_balances: newLockedBalances
      });

      // 重新加载数据以显示新的质押
      await loadData();
      return { success: true };
    } catch (error) {
      console.error("Error creating stake:", error);
      return { success: false, error: error.message };
    }
  };

  const handleUnstake = async (stake) => {
    try {
      // Call the backend function to handle unstaking and reward calculation securely
      const response = await unstakeAndClaim({ stakeId: stake.id });
      
      if (response.data.success) {
        loadData(); // Reload all data to reflect changes
        return { success: true };
      } else {
        throw new Error(response.data.error || 'Unstaking failed on the server.');
      }
    } catch (error) {
      console.error("Error unstaking:", error);
      return { success: false, error: error.message };
    }
  };

  const totalStakedValue = stakes.reduce((total, stake) => {
    const price = prices[stake.asset.toLowerCase()] || 0;
    return total + (stake.amount * price);
  }, 0);

  const estimatedAnnualReward = totalStakedValue * 0.045;

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
              质押中心
            </h1>
            <p className="text-slate-600 mt-2">质押您的贵金属，赚取被动收益</p>
          </div>
        </motion.div>

        {/* Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid md:grid-cols-3 gap-6 mb-8"
        >
          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-blue-100 mb-2">总质押价值</p>
                <p className="text-3xl font-bold">${totalStakedValue.toFixed(2)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-blue-200" />
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-green-100 mb-2">预计年化收益</p>
                <p className="text-3xl font-bold">${estimatedAnnualReward.toFixed(2)}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-green-200" />
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-r from-purple-600 to-violet-600 text-white border-0 shadow-lg">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-purple-100 mb-2">质押年化收益率</p>
                <p className="text-3xl font-bold">4.5%</p>
              </div>
              <PiggyBank className="w-10 h-10 text-purple-200" />
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <StakeForm
              user={user}
              onStake={handleStake}
              isLoading={isLoading}
            />
          </div>
          <div className="lg:col-span-2">
            <ActiveStakes
              stakes={stakes}
              prices={prices}
              onUnstake={handleUnstake}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}