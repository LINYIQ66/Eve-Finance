import React, { useState, useEffect } from "react";
import { User, FundRequest, SystemSetting } from "@/entities/all";
import { UploadFile } from "@/integrations/Core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  ArrowDownLeft,
  RefreshCw,
  PlusCircle,
  AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { getMetalPrices } from "@/functions/getMetalPrices";
import { getStockPrices } from "@/functions/getStockPrices";
import { getUserTransactions } from "@/functions/getUserTransactions";

import BalanceCards from "../components/wallet/BalanceCards";
import TransactionHistory from "../components/wallet/TransactionHistory";
import QuickActions from "../components/wallet/QuickActions";
import DepositModal from "../components/wallet/DepositModal";
import EveTokenInfoModal from "../components/wallet/EveTokenInfoModal";
import FundRequestList from "../components/wallet/FundRequestList";
import PendingOrdersList from "../components/wallet/PendingOrdersList";
import { useLanguage } from "@/components/common/LanguageProvider";


export default function Wallet() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [prices, setPrices] = useState({});
  const [priceChanges, setPriceChanges] = useState({});
  const [stockPrices, setStockPrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isEveInfoModalOpen, setEveInfoModalOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    setIsLoading(true);
    try {
      const userData = await User.me();
      const [txResult, allFundRequests, settingsData, priceData, stockData] = await Promise.all([
          getUserTransactions({}),
          FundRequest.list("-created_date", 50),
          SystemSetting.list(),
          getMetalPrices(),
          getStockPrices({})
      ]);

      const userTransactions = txResult?.data?.transactions || [];

      setUser(userData);
      setTransactions(userTransactions);
      
      // Filter fund requests for current user on the frontend
      const userFundRequests = allFundRequests.filter(request => request.user_email === userData.email);
      setFundRequests(userFundRequests);

      const settingsMap = settingsData.reduce((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});
      setSystemSettings(settingsMap);

      if (priceData.data.success) {
        setPrices(priceData.data.prices);
        setPriceChanges(priceData.data.changes);
      }
      if (stockData?.data?.prices) {
        setStockPrices(stockData.data.prices);
      }

    } catch (error) {
      console.error("Error loading wallet data:", error);
    }
    setIsLoading(false);
  };

  const handleCreateDepositRequest = async (requestData) => {
    try {
      // 1. Upload proof of payment
      const { file_url } = await UploadFile({ file: requestData.proofOfPayment });

      // 2. Create FundRequest record
      await FundRequest.create({
        request_type: 'deposit',
        user_email: user.email,
        asset: requestData.asset,
        amount: requestData.amount,
        method: requestData.method,
        proof_of_payment_url: file_url,
        status: 'pending'
      });

      loadWalletData(); // Refresh data
      setDepositModalOpen(false); // Close modal
      return { success: true };
    } catch(error) {
      console.error("Error creating deposit request:", error);
      return { success: false, error: error.message };
    }
  };


  const getTotalPortfolioValue = () => {
    if (!user) return 0;

    const allBalances = {};
    for (const [asset, val] of Object.entries(user.wallet_balances || {})) {
      if (asset.startsWith("frozen_")) continue; // skip frozen keys to avoid double-counting
      allBalances[asset] = (allBalances[asset] || 0) + val;
    }
    if (user.locked_balances) {
      for (const [asset, val] of Object.entries(user.locked_balances)) {
        if (asset.startsWith("frozen_")) continue;
        allBalances[asset] = (allBalances[asset] || 0) + val;
      }
    }

    let total = 0;
    for (const [asset, balance] of Object.entries(allBalances)) {
      const metalPrice = prices[asset] || 0;
      const stockData = stockPrices[asset.toUpperCase()];
      const stockPrice = stockData?.price || 0;
      total += balance * (metalPrice || stockPrice);
    }
    return total;
  };

  const goldPriceChange = priceChanges.gold;
  const changeIcon = goldPriceChange > 0 ? TrendingUp : ArrowDownLeft;
  const changeColorClass = goldPriceChange > 0 ? "text-green-300" : "text-red-300";

  const isKYCApproved = user?.kyc_status === 'approved';


  return (
    <>
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSubmit={handleCreateDepositRequest}
        settings={systemSettings}
      />
      <EveTokenInfoModal
        isOpen={isEveInfoModalOpen}
        onClose={() => setEveInfoModalOpen(false)}
      />
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
                {t('wallet.title')}
              </h1>
              <p className="text-slate-600 mt-2">{t('wallet.subtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
               <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block"> {/* Wrap button in a div for tooltip to work when button is disabled */}
                      <Button
                        onClick={() => setDepositModalOpen(true)}
                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                        disabled={!isKYCApproved || isLoading}
                      >
                        <PlusCircle className="w-4 h-4" />
                        {t('wallet.deposit')}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {!isKYCApproved && (
                    <TooltipContent>
                      <p className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {t('wallet.kyc_required_tooltip')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <Button
                variant="outline"
                onClick={loadWalletData}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {t('wallet.refresh')}
              </Button>
            </div>
          </motion.div>

          {/* Portfolio Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-2xl">
              <CardContent className="p-8">
                <div className="grid md:grid-cols-3 gap-8">
                  <div>
                    <p className="text-blue-100 mb-2">{t('wallet.total_portfolio_value')}</p>
                    <p className="text-4xl font-bold">
                      ${getTotalPortfolioValue().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-100 mb-2">{t('wallet.change_24h')}</p>
                    {/* Placeholder for 24h change, can be improved using priceChanges state */}
                    <div className="flex items-center gap-2">
                      {React.createElement(changeIcon, { className: `w-5 h-5 ${changeColorClass}` })}
                      <span className={`text-2xl font-bold ${changeColorClass}`}>
                        {/* Display change for a primary asset, e.g., Gold, or aggregate */}
                        {typeof priceChanges.gold === 'number' ? `${priceChanges.gold > 0 ? '+' : ''}${priceChanges.gold.toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-blue-100 mb-2">{t('wallet.active_assets')}</p>
                    <p className="text-2xl font-bold">
                      {user?.wallet_balances ? Object.entries(user.wallet_balances).filter(([k, b]) => !k.startsWith("frozen_") && b > 0).length + (user.locked_balances ? Object.entries(user.locked_balances).filter(([k, b]) => !k.startsWith("frozen_") && b > 0).length : 0) : 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Balance Cards */}
            <div className="lg:col-span-2">
              <BalanceCards
                user={user}
                isLoading={isLoading}
                prices={prices}
                priceChanges={priceChanges}
                stockPrices={stockPrices}
                onInfoClick={() => setEveInfoModalOpen(true)}
              />
            </div>

            {/* Quick Actions */}
            <div>
              <QuickActions user={user} isLoading={isLoading} />
            </div>
          </div>

          {/* Transaction History & Fund Requests */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8"
          >
            <Tabs defaultValue="transactions" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm shadow-lg">
                    <TabsTrigger value="transactions">{t('wallet.transaction_history')}</TabsTrigger>
                    <TabsTrigger value="pending" className="relative">
                      Pending Orders
                      {transactions.filter(t => t.status === "pending" && t.transaction_type === "swap").length > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs font-bold bg-yellow-500 text-white rounded-full">
                          {transactions.filter(t => t.status === "pending" && t.transaction_type === "swap").length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="requests">{t('wallet.requests_title')}</TabsTrigger>
                </TabsList>
                <TabsContent value="transactions">
                    <TransactionHistory transactions={transactions} isLoading={isLoading} />
                </TabsContent>
                <TabsContent value="pending">
                    <PendingOrdersList orders={transactions} isLoading={isLoading} onRefresh={loadWalletData} />
                </TabsContent>
                <TabsContent value="requests">
                    <FundRequestList requests={fundRequests} isLoading={isLoading} />
                </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </>
  );
}