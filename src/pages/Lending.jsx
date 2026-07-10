import React, { useState, useEffect } from "react";
import { User, Loan, Transaction } from "@/entities/all";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Banknote,
  DollarSign,
  Coins,
  Calculator
} from "lucide-react";
import { motion } from "framer-motion";
import { getMetalPrices } from "@/api/eveClient";

import LoanCalculator from "../components/lending/LoanCalculator";
import ActiveLoans from "../components/lending/ActiveLoans";
import CollateralOverview from "../components/lending/CollateralOverview";

export default function Lending() {
  const [user, setUser] = useState(null);
  const [loans, setLoans] = useState([]);
  const [prices, setPrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await User.me();
      const userLoans = await Loan.filter({ created_by: userData.email }, "-created_date");
      const priceData = await getMetalPrices();
      
      setUser(userData);
      setLoans(userLoans);
      setPrices(priceData.data.prices);
    } catch (error) {
      console.error("Error loading lending data:", error);
    }
    setIsLoading(false);
  };

  const createLoan = async (loanData) => {
    try {
      // 1. Create Loan record
      await Loan.create(loanData);
      
      const loanAmountUsd = loanData.loan_amount * (prices[loanData.loan_asset.toLowerCase()] || 1);

      // 2. Create transaction record
      await Transaction.create({
        transaction_type: "loan",
        amount_usd: loanAmountUsd,
        user_email: user.email,
        from_asset: loanData.collateral_asset,
        to_asset: loanData.loan_asset,
        status: "completed"
      });

      // 3. Update user balances - CRITICAL FIX
      const newWalletBalances = { ...user.wallet_balances };
      const newLockedBalances = { ...user.locked_balances || {} }; // Ensure locked_balances is an object

      // Move collateral from available to locked
      const collateralKey = loanData.collateral_asset.toLowerCase();
      newWalletBalances[collateralKey] = (newWalletBalances[collateralKey] || 0) - loanData.collateral_amount;
      newLockedBalances[collateralKey] = (newLockedBalances[collateralKey] || 0) + loanData.collateral_amount;
      
      // Add loan amount to available balance
      const loanAssetKey = loanData.loan_asset.toLowerCase();
      newWalletBalances[loanAssetKey] = (newWalletBalances[loanAssetKey] || 0) + loanData.loan_amount;

      await User.updateMyUserData({ 
        wallet_balances: newWalletBalances,
        locked_balances: newLockedBalances
      });
      
      loadData();
      return { success: true };
    } catch (error) {
      console.error("Error creating loan:", error);
      return { success: false, error: error.message };
    }
  };

  const repayLoan = async (loanId, repaymentAmountUSD, paymentAsset) => {
    try {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) throw new Error("Loan not found");
      if (!user) throw new Error("User data not loaded");

      // --- 1. Calculate Accrued Interest & Total Owed ---
      const loanCreatedDate = new Date(loan.created_date);
      // Ensure interest isn't calculated for the day the loan is taken
      const daysSinceLoan = Math.max(0, Math.floor((new Date() - loanCreatedDate) / (1000 * 60 * 60 * 24)));
      const dailyRate = (loan.interest_rate / 100) / 365;
      const accruedInterest = loan.loan_amount * dailyRate * daysSinceLoan;
      const totalOwed = loan.loan_amount + accruedInterest;

      // --- 2. Check User's Wallet Balance ---
      const paymentAssetPrice = prices[paymentAsset.toLowerCase()] || 1;
      const requiredAssetAmount = repaymentAmountUSD / paymentAssetPrice;
      const userBalance = user.wallet_balances[paymentAsset.toLowerCase()] || 0;

      if (userBalance < requiredAssetAmount) {
        return { success: false, error: `Insufficient ${paymentAsset} balance` };
      }

      // --- 3. Determine Repayment Breakdown & New Loan State ---
      const REPAYMENT_TOLERANCE_USD = 0.01; // Allow for 1 cent of rounding difference
      const isConsideredFullRepayment = Math.abs(totalOwed - repaymentAmountUSD) <= REPAYMENT_TOLERANCE_USD || repaymentAmountUSD > totalOwed;

      let loanUpdatePayload = {};
      let paidInterest = 0;
      let paidPrincipal = 0;
      
      const newWalletBalances = { ...user.wallet_balances };
      const newLockedBalances = { ...user.locked_balances || {} }; // Safe initialization

      if (isConsideredFullRepayment) {
        paidInterest = accruedInterest;
        paidPrincipal = loan.loan_amount;
        // Mark as repaid and clear the principal
        loanUpdatePayload = { status: 'repaid', loan_amount: 0 }; 
        
        // Release collateral
        const collateralKey = loan.collateral_asset.toLowerCase();
        newLockedBalances[collateralKey] = Math.max(0, (newLockedBalances[collateralKey] || 0) - loan.collateral_amount);
        newWalletBalances[collateralKey] = (newWalletBalances[collateralKey] || 0) + loan.collateral_amount;

      } else { // Partial Repayment Logic
        // Payment covers interest first, then principal
        paidInterest = Math.min(repaymentAmountUSD, accruedInterest);
        paidPrincipal = repaymentAmountUSD - paidInterest;
        const newPrincipal = loan.loan_amount - paidPrincipal;
        
        // Update the outstanding principal
        loanUpdatePayload = { loan_amount: newPrincipal };
      }

      // --- 4. Execute Database Updates ---
      
      // a. Deduct from user's wallet and update locked balances if needed
      newWalletBalances[paymentAsset.toLowerCase()] -= requiredAssetAmount;
      await User.updateMyUserData({ 
        wallet_balances: newWalletBalances,
        locked_balances: newLockedBalances
      });

      // b. Update the loan record (status and/or principal)
      await Loan.update(loanId, loanUpdatePayload);

      // c. Create a clear transaction record
      await Transaction.create({
        transaction_type: "repayment",
        amount_usd: repaymentAmountUSD,
        user_email: user.email,
        from_asset: paymentAsset,
        status: "completed",
        description: `Repayment. Principal: $${paidPrincipal.toFixed(2)}, Interest: $${paidInterest.toFixed(2)}.`
      });
      
      loadData();
      return { success: true };
    } catch (error) {
      console.error("Error repaying loan:", error);
      return { success: false, error: error.message };
    }
  };

  const getTotalCollateral = () => {
    // This now reflects total collateral across both wallet_balances and locked_balances
    // For active loans, we're interested in the *locked* collateral value
    return loans
      .filter(loan => loan.status === "active")
      .reduce((total, loan) => {
        const price = prices[loan.collateral_asset.toLowerCase()] || 0;
        return total + (loan.collateral_amount * price);
      }, 0);
  };

  const getTotalBorrowed = () => {
    return loans
      .filter(loan => loan.status === "active")
      .reduce((total, loan) => total + loan.loan_amount, 0);
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
              借贷中心
            </h1>
            <p className="text-slate-600 mt-2">以您的贵金属作为抵押进行借款</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-100 text-green-800">
              最高 80% 抵押率
            </Badge>
            <Badge className="bg-blue-100 text-blue-800">
              竞争性利率
            </Badge>
          </div>
        </motion.div>

        {/* Overview Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid md:grid-cols-3 gap-6 mb-8"
        >
          <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 mb-2">总抵押价值</p>
                  <p className="text-3xl font-bold">${getTotalCollateral().toFixed(2)}</p>
                </div>
                <Coins className="w-10 h-10 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 mb-2">已借总额</p>
                  <p className="text-3xl font-bold">${getTotalBorrowed().toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-600 to-violet-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 mb-2">活跃贷款</p>
                  <p className="text-3xl font-bold">{loans.filter(l => l.status === "active").length}</p>
                </div>
                <Banknote className="w-10 h-10 text-purple-200" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Tabs defaultValue="calculator" className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow-lg">
            <TabsTrigger value="calculator" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Calculator className="w-4 h-4 mr-2" />
              贷款计算器
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Banknote className="w-4 h-4 mr-2" />
              活跃贷款
            </TabsTrigger>
            <TabsTrigger value="collateral" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Coins className="w-4 h-4 mr-2" />
              抵押资产
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <LoanCalculator 
              user={user}
              prices={prices}
              onCreateLoan={createLoan}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="active">
            <ActiveLoans 
              loans={loans.filter(l => l.status === "active")}
              prices={prices}
              user={user}
              onRepayLoan={repayLoan}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value="collateral">
            <CollateralOverview 
              user={user}
              loans={loans}
              prices={prices}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}