import React, { useState, useEffect } from "react";
import { User, Transaction, Loan, AuditLog, FundRequest, SystemSetting, PhysicalProduct, PhysicalRedemption, SupportTicket } from "@/entities/all"; // Added SupportTicket
import { SendEmail } from "@/integrations/Core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users, FileText, TrendingUp, AlertTriangle, Landmark, DollarSign, Package, Truck, MessageSquare } from "lucide-react"; // Added MessageSquare
import { motion } from "framer-motion";
import { createPageUrl } from '@/utils';

import KYCReview from "../components/admin/KYCReview";
import TransactionLogs from "../components/admin/TransactionLogs";
import UserManagement from "../components/admin/UserManagement";
import FundRequests from "../components/admin/FundRequests";
import PaymentSettings from "../components/admin/PaymentSettings";
import FundManagement from "../components/admin/FundManagement";
import StatementGenerator from "../components/admin/StatementGenerator";
import PhysicalInventory from "../components/admin/PhysicalInventory";
import DeliveryRequests from "../components/admin/DeliveryRequests";
import SupportTicketReview from "../components/admin/SupportTicketReview";
import AnalyticsReport from "../components/admin/AnalyticsReport";

export default function Admin() {
  const [adminUser, setAdminUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [physicalProducts, setPhysicalProducts] = useState([]);
  const [physicalRedemptions, setPhysicalRedemptions] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]); // New state
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
        try {
            const currentUser = await User.me();
            if (currentUser.role !== 'admin') {
                window.location.href = createPageUrl('Home');
            } else {
                setAdminUser(currentUser);
                loadAdminData();
            }
        } catch (e) {
            window.location.href = createPageUrl('Home');
        }
    };
    checkAdmin();
  }, []);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [usersData, transactionsData, loansData, fundRequestsData, settingsData, productsData, redemptionsData, ticketsData] = await Promise.all([
        User.list("-created_date", 100),
        Transaction.list("-created_date", 200),
        Loan.list("-created_date", 100),
        FundRequest.list("-created_date", 100),
        SystemSetting.list(),
        PhysicalProduct.list("-created_date"),
        PhysicalRedemption.list("-created_date"),
        SupportTicket.list("-created_date"), // Fetch tickets
      ]);
      setUsers(usersData);
      setTransactions(transactionsData);
      setLoans(loansData);
      
      // Filter pending fund requests on the frontend
      const pendingFundRequests = fundRequestsData.filter(request => request.status === 'pending');
      setFundRequests(pendingFundRequests);
      
      const settingsMap = settingsData.reduce((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});
      setSystemSettings(settingsMap);
      setPhysicalProducts(productsData);
      setPhysicalRedemptions(redemptionsData);
      setSupportTickets(ticketsData); // Set state

    } catch (error) {
      console.error("Error loading admin data:", error);
    }
    setIsLoading(false);
  };
  
  const updateSystemSettings = async (key, value) => {
      try {
          const existingSetting = await SystemSetting.filter({ setting_key: key });
          if (existingSetting.length > 0) {
              await SystemSetting.update(existingSetting[0].id, { setting_value: value });
          } else {
              await SystemSetting.create({ setting_key: key, setting_value: value });
          }
          await AuditLog.create({
              admin_email: adminUser.email,
              action: `update_setting_${key}`,
              target_user_email: 'system',
              details: `Updated ${key} settings.`
          });
          loadAdminData();
          return { success: true };
      } catch (error) {
          console.error("Error updating system settings:", error);
          return { success: false, error: error.message };
      }
  };

  const updateKYCStatus = async (userId, status, notes = "", riskTags = []) => {
    try {
      const targetUser = users.find(u => u.id === userId);
      if (!targetUser) return { success: false, error: "User not found" };

      await User.update(userId, { kyc_status: status, kyc_notes: notes, risk_tags: riskTags });
      
      await AuditLog.create({
          admin_email: adminUser.email,
          action: `${status}_kyc`,
          target_user_email: targetUser.email,
          details: `Status set to ${status}. Notes: ${notes}`
      });

      await SendEmail({
          to: targetUser.email,
          subject: `Your EVE METAL KYC Status Update: ${status.toUpperCase()}`,
          body: `
              <p>Hello ${targetUser.full_name},</p>
              <p>Your KYC application status has been updated to: <strong>${status.toUpperCase()}</strong>.</p>
              ${status === 'rejected' ? `<p><strong>Reason:</strong> ${notes}</p><p>Please review the feedback and resubmit your documents on the KYC page.</p>` : ''}
              ${status === 'approved' ? `<p>You can now access all trading and lending features on the platform.</p>` : ''}
              <p>Thank you,<br/>The EVE METAL Team</p>
          `
      });

      loadAdminData();
      return { success: true };
    } catch (error) {
      console.error("Error updating KYC status:", error);
      return { success: false, error: error.message };
    }
  };
  
  const updateFundRequestStatus = async (requestId, status, notes = "") => {
    try {
        const allRequests = await FundRequest.list();
        const request = allRequests.find(r => r.id === requestId);
        
        if (!request) return { success: false, error: "Request not found" };

        // BUG FIX 1: Prevent re-processing of a request
        if (request.status !== 'pending') {
            return { success: false, error: `Request already ${request.status}.` };
        }

        await FundRequest.update(requestId, { status, admin_notes: notes });

        // If approved deposit, update user balance and create transaction record
        if (status === 'approved' && request.request_type === 'deposit') {
            const targetUser = await User.filter({ email: request.user_email });
            if (targetUser.length > 0) {
                const user = targetUser[0];
                const newBalances = { ...user.wallet_balances };
                newBalances[request.asset.toLowerCase()] = (newBalances[request.asset.toLowerCase()] || 0) + request.amount;
                await User.update(user.id, { wallet_balances: newBalances });

                // Create a transaction record for history
                await Transaction.create({
                    transaction_type: "deposit",
                    user_id: user.id,
                    user_email: request.user_email,
                    asset: request.asset.toUpperCase(),
                    amount_usd: request.amount, // FIX: Use amount_usd instead of amount
                    status: "completed",
                    description: "Admin approved fund deposit request"
                });
            }
        }
        
        // If approved withdrawal, balance is debited and create transaction record
        if (status === 'approved' && request.request_type === 'withdrawal') {
            const targetUser = await User.filter({ email: request.user_email });
            if (targetUser.length > 0) {
                const user = targetUser[0];
                const newBalances = { ...user.wallet_balances };
                // Ensure sufficient balance before deducting (though assumed by admin approval)
                if ((newBalances[request.asset.toLowerCase()] || 0) < request.amount) {
                  console.warn(`Admin approving withdrawal for user ${user.email} with insufficient balance. Proceeding as per admin decision.`);
                }
                newBalances[request.asset.toLowerCase()] = (newBalances[request.asset.toLowerCase()] || 0) - request.amount;
                await User.update(user.id, { wallet_balances: newBalances });

                // Create a transaction record for history
                await Transaction.create({
                    transaction_type: "withdrawal",
                    user_id: user.id,
                    user_email: request.user_email,
                    asset: request.asset.toUpperCase(),
                    amount_usd: request.amount, // FIX: Use amount_usd instead of amount
                    status: "completed",
                    description: "Admin approved fund withdrawal request"
                });
            }
        }

        await AuditLog.create({
            admin_email: adminUser.email,
            action: `${status}_fund_request`,
            target_user_email: request.user_email,
            details: `Request ID ${requestId} (${request.request_type} ${request.amount} ${request.asset}) set to ${status}. Notes: ${notes}`
        });

        await SendEmail({
            to: request.user_email,
            subject: `Your EVE METAL Fund Request Update: ${status.toUpperCase()}`,
            body: `<p>Your fund request (${request.request_type} of ${request.amount} ${request.asset}) has been ${status}.</p>`
        });

        loadAdminData();
        return { success: true };
    } catch (error) {
        console.error("Error updating fund request:", error);
        return { success: false, error: error.message };
    }
  };

  const addFundsToUser = async (userId, asset, amount, notes, balanceType = 'wallet') => {
    try {
      const targetUser = users.find(u => u.id === userId);
      if (!targetUser) return { success: false, error: "User not found" };

      const balanceKey = balanceType === 'wallet' ? 'wallet_balances' : 'locked_balances';
      const currentBalances = { ...targetUser[balanceKey] };
      currentBalances[asset.toLowerCase()] = (currentBalances[asset.toLowerCase()] || 0) + amount;

      const updateData = {};
      updateData[balanceKey] = currentBalances;
      await User.update(userId, updateData);

      // Create transaction record
      await Transaction.create({
        transaction_type: "deposit",
        amount_usd: amount, // FIX: Use amount_usd instead of amount
        status: "completed",
        user_id: userId,
        user_email: targetUser.email,
        asset: asset.toUpperCase(),
        description: `Admin manual ${balanceType} deposit: ${notes}`
      });

      await AuditLog.create({
        admin_email: adminUser.email,
        action: "add_funds",
        target_user_email: targetUser.email,
        details: `Added ${amount} ${asset.toUpperCase()} to ${balanceType} balance. Notes: ${notes}`
      });

      loadAdminData();
      return { success: true };
    } catch (error) {
      console.error("Error adding funds:", error);
      return { success: false, error: error.message };
    }
  };

  const deductFundsFromUser = async (userId, asset, amount, notes, balanceType = 'wallet') => {
    try {
      const targetUser = users.find(u => u.id === userId);
      if (!targetUser) return { success: false, error: "User not found" };

      const balanceKey = balanceType === 'wallet' ? 'wallet_balances' : 'locked_balances';
      const currentBalance = targetUser[balanceKey][asset.toLowerCase()] || 0;
      
      if (amount > currentBalance) {
        return { success: false, error: `Insufficient ${balanceType} balance` };
      }

      const currentBalances = { ...targetUser[balanceKey] };
      currentBalances[asset.toLowerCase()] = currentBalance - amount;

      const updateData = {};
      updateData[balanceKey] = currentBalances;
      await User.update(userId, updateData);

      // Create transaction record
      await Transaction.create({
        transaction_type: "withdrawal",
        amount_usd: amount, // FIX: Use amount_usd instead of amount
        status: "completed",
        user_id: userId,
        user_email: targetUser.email,
        asset: asset.toUpperCase(),
        description: `Admin manual ${balanceType} deduction: ${notes}`
      });

      await AuditLog.create({
        admin_email: adminUser.email,
        action: "deduct_funds",
        target_user_email: targetUser.email,
        details: `Deducted ${amount} ${asset.toUpperCase()} from ${balanceType} balance. Notes: ${notes}`
      });

      loadAdminData();
      return { success: true };
    } catch (error) {
      console.error("Error deducting funds:", error);
      return { success: false, error: error.message };
    }
  };

  const handleProductUpdate = async (productData) => {
    try {
        if (productData.id) { // Update existing
            await PhysicalProduct.update(productData.id, productData);
        } else { // Create new
            await PhysicalProduct.create(productData);
        }
        loadAdminData();
        return { success: true };
    } catch (error) {
        console.error("Error updating product:", error);
        return { success: false, error: error.message };
    }
  };

  const handleProductDelete = async (productId) => {
      try {
          await PhysicalProduct.delete(productId);
          loadAdminData();
          return { success: true };
      } catch (error)
      {
          console.error("Error deleting product:", error);
          return { success: false, error: error.message };
      }
  };
  
  const handleRedemptionStatusUpdate = async (redemptionId, status, trackingNumber) => {
    try {
        await PhysicalRedemption.update(redemptionId, { status, tracking_number: trackingNumber });
        loadAdminData();
        return { success: true };
    } catch (error) {
        console.error("Error updating redemption status:", error);
        return { success: false, error: error.message };
    }
  };

  const handleTicketUpdate = async (ticketId, status, response) => {
    try {
        const ticket = supportTickets.find(t => t.id === ticketId);
        if (!ticket) return { success: false, error: "Ticket not found" };

        await SupportTicket.update(ticketId, { status, admin_response: response });

        // Optionally send an email notification to the user
        if (response && ticket.admin_response !== response) {
            await SendEmail({
                to: ticket.user_email,
                subject: `Re: Your Support Ticket: ${ticket.subject}`,
                body: `<p>An admin has responded to your support ticket:</p><blockquote style="border-left: 2px solid #ccc; padding-left: 1em; margin-left: 1em;">${response}</blockquote><p>You can view the full ticket history in your account.</p>`
            });
        }
        
        await AuditLog.create({
            admin_email: adminUser.email,
            action: `update_support_ticket`,
            target_user_email: ticket.user_email,
            details: `Ticket ID ${ticketId} status set to ${status}. Response: ${response || 'N/A'}`
        });

        loadAdminData();
        return { success: true };
    } catch (error) {
        console.error("Error updating ticket:", error);
        return { success: false, error: error.message };
    }
  };

  const metrics = (() => {
    const totalUsers = users.length;
    const pendingKYC = users.filter(u => u.kyc_status === "pending").length;
    const totalVolume = transactions.reduce((sum, t) => sum + (t.amount_usd || 0), 0);
    const totalFees = transactions.reduce((sum, t) => sum + (t.fee_usd || 0), 0);
    const activeLoans = loans.filter(l => l.status === "active").length;
    const pendingDeposits = fundRequests.length; // Already filtered to pending requests
    return { totalUsers, pendingKYC, totalVolume, totalFees, activeLoans, pendingDeposits };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">Admin Dashboard</h1>
            <p className="text-slate-600 mt-2">Monitor and manage platform operations</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-blue-100 text-blue-800">{metrics.totalUsers} Users</Badge>
            <Badge className="bg-green-100 text-green-800">${metrics.totalVolume.toFixed(0)} Volume</Badge>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="grid md:grid-cols-5 gap-6 mb-8">
          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-blue-100 mb-2">Total Users</p><p className="text-3xl font-bold">{metrics.totalUsers}</p></div><Users className="w-8 h-8 text-blue-200" /></div></CardContent></Card>
          <Card className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-yellow-100 mb-2">Pending KYC</p><p className="text-3xl font-bold">{metrics.pendingKYC}</p></div><AlertTriangle className="w-8 h-8 text-yellow-200" /></div></CardContent></Card>
          <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-green-100 mb-2">Total Volume</p><p className="text-2xl font-bold">${metrics.totalVolume.toFixed(0)}</p></div><TrendingUp className="w-8 h-8 text-green-200" /></div></CardContent></Card>
          <Card className="bg-gradient-to-r from-purple-600 to-violet-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-purple-100 mb-2">Total Fees</p><p className="text-2xl font-bold">${metrics.totalFees.toFixed(2)}</p></div><FileText className="w-8 h-8 text-purple-200" /></div></CardContent></Card>
          <Card className="bg-gradient-to-r from-red-600 to-pink-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-red-100 mb-2">Active Loans</p><p className="text-3xl font-bold">{metrics.activeLoans}</p></div><Settings className="w-8 h-8 text-red-200" /></div></CardContent></Card>
          <Card className="bg-gradient-to-r from-cyan-600 to-sky-600 text-white border-0 shadow-lg"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-cyan-100 mb-2">Pending Deposits</p><p className="text-3xl font-bold">{metrics.pendingDeposits}</p></div><Landmark className="w-8 h-8 text-cyan-200" /></div></CardContent></Card>
        </motion.div>
        <Tabs defaultValue="kyc" className="space-y-8">
          <TabsList className="grid w-full grid-cols-11 bg-white shadow-lg">
            <TabsTrigger value="kyc" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><FileText className="w-4 h-4 mr-2" />KYC</TabsTrigger>
            <TabsTrigger value="funds" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Landmark className="w-4 h-4 mr-2" />Funds</TabsTrigger>
            <TabsTrigger value="tickets" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><MessageSquare className="w-4 h-4 mr-2" />Tickets</TabsTrigger>
            <TabsTrigger value="deliveries" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Truck className="w-4 h-4 mr-2" />Deliveries</TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><DollarSign className="w-4 h-4 mr-2" />Manage</TabsTrigger>
            <TabsTrigger value="physical" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Package className="w-4 h-4 mr-2" />Inventory</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><TrendingUp className="w-4 h-4 mr-2" />Logs</TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><TrendingUp className="w-4 h-4 mr-2" />Reports</TabsTrigger>
            <TabsTrigger value="statements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><FileText className="w-4 h-4 mr-2" />Statements</TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Users className="w-4 h-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="system" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><Settings className="w-4 h-4 mr-2" />System</TabsTrigger>
          </TabsList>
          <TabsContent value="kyc"><KYCReview users={users.filter(u => u.kyc_status === "pending")} onUpdateKYC={updateKYCStatus} isLoading={isLoading} /></TabsContent>
          <TabsContent value="funds"><FundRequests requests={fundRequests} onUpdateRequest={updateFundRequestStatus} isLoading={isLoading} /></TabsContent>
          <TabsContent value="tickets"><SupportTicketReview tickets={supportTickets} onUpdate={handleTicketUpdate} isLoading={isLoading} /></TabsContent>
          <TabsContent value="deliveries"><DeliveryRequests redemptions={physicalRedemptions} onUpdateStatus={handleRedemptionStatusUpdate} isLoading={isLoading} /></TabsContent>
          <TabsContent value="manage"><FundManagement users={users} onAddFunds={addFundsToUser} onDeductFunds={deductFundsFromUser} isLoading={isLoading} /></TabsContent>
          <TabsContent value="physical"><PhysicalInventory products={physicalProducts} onUpdate={handleProductUpdate} onDelete={handleProductDelete} isLoading={isLoading} /></TabsContent>
          <TabsContent value="activity"><TransactionLogs transactions={transactions} isLoading={isLoading} /></TabsContent>
          <TabsContent value="reports"><AnalyticsReport /></TabsContent>
          <TabsContent value="statements"><StatementGenerator users={users} /></TabsContent>
          <TabsContent value="users"><UserManagement users={users} isLoading={isLoading} /></TabsContent>
          <TabsContent value="system"><PaymentSettings settings={systemSettings} onUpdateSettings={updateSystemSettings} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}