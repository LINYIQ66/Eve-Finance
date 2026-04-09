import React, { useState, useEffect } from "react";
import { FundRequest, SystemSetting, Transaction, PhysicalRedemption, SupportTicket, User } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { UserCheck, LogIn, LogOut, User as UserIcon, Activity, FileText, Package, LifeBuoy, Shield, Zap, Star } from "lucide-react"; // Added LifeBuoy, Shield, Zap, Star. Removed TrendingUp as per outline.
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import KYCStatus from "../components/kyc/KYCStatus";
import KYCForm from "../components/kyc/KYCForm";
import DocumentUpload from "../components/kyc/DocumentUpload";
import KYCApproved from "../components/kyc/KYCApproved";
import DepositModal from "../components/wallet/DepositModal";
import WithdrawalModal from "../components/account/WithdrawalModal";
import AccountActions from "../components/account/AccountActions";
import ActivityFeed from "../components/account/ActivityFeed";
import StatementGenerator from "../components/account/StatementGenerator";
import MyPhysicalInventory from "../components/account/MyPhysicalInventory";
import SupportTickets from "../components/account/SupportTickets"; // New Import
import LiquidGlassLoginCard from '../components/account/LiquidGlassLoginCard'; // Import the new card
import { useLanguage } from "@/components/common/LanguageProvider";

export default function Account() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [physicalRedemptions, setPhysicalRedemptions] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]); // New state
  const [isLoading, setIsLoading] = useState(true);
  const [systemSettings, setSystemSettings] = useState({});
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setWithdrawalModalOpen] = useState(false);

  const { t } = useLanguage();

  useEffect(() => {
    loadUserData();
    loadSystemSettings();
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const userData = await User.me();
      setUser(userData);
      if (userData?.email) {
        const [userTransactions, userRedemptions, userTickets] = await Promise.all([
          Transaction.filter({ user_email: userData.email }, "-created_date", 100),
          PhysicalRedemption.filter({ user_email: userData.email }, "-created_date"),
          SupportTicket.filter({ user_email: userData.email }, "-created_date") // Fetch tickets
        ]);
        setTransactions(userTransactions);
        setPhysicalRedemptions(userRedemptions);
        setSupportTickets(userTickets); // Set tickets
      } else {
        setTransactions([]);
        setPhysicalRedemptions([]);
        setSupportTickets([]);
      }
    } catch (error) {
      // Not logged in, user will be null
      console.error("Error loading user data:", error);
      setUser(null); // Ensure user is null on error or not logged in
      setTransactions([]);
      setPhysicalRedemptions([]);
      setSupportTickets([]);
    }
    setIsLoading(false);
  };
  
  const loadSystemSettings = async () => {
      try {
          const settingsData = await SystemSetting.list();
          const settingsMap = settingsData.reduce((acc, setting) => {
            acc[setting.setting_key] = setting.setting_value;
            return acc;
          }, {});
          setSystemSettings(settingsMap);
      } catch (error) {
          console.error("Error loading system settings:", error);
      }
  };

  const handleLogin = () => {
    base44.auth.redirectToLogin();
  };

  const handleLogout = async () => {
    try {
      await User.logout();
      setUser(null);
      setTransactions([]); // Clear data on logout
      setPhysicalRedemptions([]); // Clear data on logout
      setSupportTickets([]); // Clear data on logout
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleFormSubmit = async (formData) => {
    try {
      await User.updateMyUserData({
        ...formData,
        kyc_status: "pending"
      });
      await loadUserData();
      return { success: true };
    } catch (error) {
      console.error("Error submitting KYC form:", error);
      return { success: false, error: error.message };
    }
  };

  const handleDocumentUpload = async (documentType, file) => {
    try {
      const { file_url } = await UploadFile({ file });
      
      const currentDocs = user.kyc_documents || {};
      const updatedDocs = {
        ...currentDocs,
        [documentType]: file_url
      };

      await User.updateMyUserData({
        kyc_documents: updatedDocs
      });

      await loadUserData();
      return { success: true };
    } catch (error) {
      console.error("Error uploading document:", error);
      return { success: false, error: error.message };
    }
  };
  
  const handleCreateDepositRequest = async (requestData) => {
    try {
      const { file_url } = await UploadFile({ file: requestData.proofOfPayment });
      await FundRequest.create({
        request_type: 'deposit',
        user_email: user.email,
        asset: requestData.asset,
        amount: requestData.amount,
        method: requestData.method,
        proof_of_payment_url: file_url,
        status: 'pending'
      });
      setDepositModalOpen(false);
      // Reload user data to fetch new transactions/fund requests if applicable
      await loadUserData();
      return { success: true };
    } catch(error) {
      console.error("Error creating deposit request:", error);
      return { success: false, error: error.message };
    }
  };
  
  const handleCreateWithdrawalRequest = async (requestData) => {
    try {
        await FundRequest.create({
            request_type: 'withdrawal',
            user_email: user.email,
            amount: requestData.amount,
            asset: requestData.asset,
            method: requestData.method,
            user_destination_details: requestData.user_destination_details,
            status: 'pending'
        });
        setWithdrawalModalOpen(false);
        // Reload user data to fetch new transactions/fund requests if applicable
        await loadUserData();
        return { success: true };
    } catch(error) {
      console.error("Error creating withdrawal request:", error);
      return { success: false, error: error.message };
    }
  };

  const handleDeliveryRequest = async (redemptionId, address, notes) => {
    try {
      await PhysicalRedemption.update(redemptionId, {
        delivery_address: address,
        delivery_notes: notes,
        delivery_requested_date: new Date().toISOString()
      });
      loadUserData(); // Refresh to show updated status
      return { success: true };
    } catch (error) {
      console.error("Error requesting delivery:", error);
      return { success: false, error: error.message };
    }
  };

  const handleCreateTicket = async (ticketData) => {
    try {
        await SupportTicket.create({
            ...ticketData,
            user_email: user.email,
            status: 'Open'
        });
        await loadUserData(); // Refresh to show the new ticket
        return { success: true };
    } catch (error) {
        console.error("Error creating support ticket:", error);
        return { success: false, error: error.message };
    }
  };
  
  // If not logged in, show login interface
  if (!user && !isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2155&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="grid lg:grid-cols-2 gap-16 max-w-6xl w-full items-center">
          {/* Left Side - Platform Introduction */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-lg text-white hidden lg:block"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg bg-white/20 p-1">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png" 
                  alt="EVE FINANCE Logo" 
                  className="w-full h-full object-cover rounded-md"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t('login.company_name')}</h1>
                <p className="text-sm font-medium opacity-80">{t('login.company_tagline')}</p>
              </div>
            </div>

            <h2 className="text-4xl font-bold mb-6">
              {t('login.future_of_trading')} <span className="text-blue-300">{t('login.precious_metals')}</span> {t('login.trading')}
            </h2>
            
            <p className="text-lg opacity-90 mb-8 leading-relaxed">
              {t('login.platform_description')}
            </p>

            <div className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Shield className="w-4 h-4 text-green-300" />
                  </div>
                  <span>{t('login.bank_grade_security')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Zap className="w-4 h-4 text-blue-300" />
                  </div>
                  <span>{t('login.instant_trading')}</span>
                </div>
                 <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Star className="w-4 h-4 text-yellow-300" />
                  </div>
                  <span>{t('login.eve_rewards')}</span>
                </div>
            </div>
          </motion.div>

          {/* Right Side - Login Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-md w-full"
          >
            <LiquidGlassLoginCard>
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-2">
                  {t('login.account_access')}
                </h2>
                <p className="opacity-80 mb-8">
                  {t('login.login_description')}
                </p>
                
                <Button 
                  onClick={handleLogin}
                  size="lg"
                  className="w-full bg-white/20 hover:bg-white/30 text-white text-lg py-6 shadow-lg backdrop-blur-sm border border-white/20"
                >
                  <LogIn className="w-5 h-5 mr-3" />
                  {t('login.login_with_google')}
                </Button>
                <p className="text-xs opacity-60 mt-4">
                  {t('login.secure_auth')}
                </p>
                
                <div className="mt-8 pt-6 border-t border-white/20">
                  <p className="text-xs opacity-50">
                    {t('login.military_encryption')}<br />
                    {t('login.data_safe')}
                  </p>
                </div>
              </div>
            </LiquidGlassLoginCard>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <>
      {user && (
          <>
            <DepositModal
              isOpen={isDepositModalOpen}
              onClose={() => setDepositModalOpen(false)}
              onSubmit={handleCreateDepositRequest}
              settings={systemSettings}
            />
            <WithdrawalModal
              isOpen={isWithdrawalModalOpen}
              onClose={() => setWithdrawalModalOpen(false)}
              onSubmit={handleCreateWithdrawalRequest}
              user={user}
            />
          </>
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header with logout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex justify-between items-center mb-8"
          >
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent mb-4">
                My Account
              </h1>
              <p className="text-xl text-slate-600 max-w-2xl">
                Manage your profile, verification, and activity.
              </p>
            </div>
            
            <div className="ml-6 flex flex-col items-end gap-2">
              {user && (
                <div className="text-right mb-2">
                  <p className="font-semibold text-slate-900">{user.full_name || "User"}</p>
                  <p className="text-sm text-slate-600">{user.email}</p>
                </div>
              )}
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </motion.div>
          
          <Tabs defaultValue="kyc" className="space-y-8">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-white shadow-lg">
                <TabsTrigger value="kyc" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><UserCheck className="w-3 h-3 md:w-4 md:h-4 mr-1" />KYC</TabsTrigger>
                <TabsTrigger value="inventory" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><Package className="w-3 h-3 md:w-4 md:h-4 mr-1" />Inventory</TabsTrigger>
                <TabsTrigger value="funds" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><UserIcon className="w-3 h-3 md:w-4 md:h-4 mr-1" />Funds</TabsTrigger>
                <TabsTrigger value="activity" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><Activity className="w-3 h-3 md:w-4 md:h-4 mr-1" />Activity</TabsTrigger>
                <TabsTrigger value="statements" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><FileText className="w-3 h-3 md:w-4 md:h-4 mr-1" />Statement</TabsTrigger>
                <TabsTrigger value="support" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs md:text-sm"><LifeBuoy className="w-3 h-3 md:w-4 md:h-4 mr-1" />Support</TabsTrigger>
            </TabsList>

            <TabsContent value="kyc">
              <div className="space-y-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mb-8">
                  <KYCStatus user={user} isLoading={isLoading} />
                </motion.div>
                {user?.kyc_status === "approved" ? ( <KYCApproved /> ) : (
                  <div className="space-y-8">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                      <KYCForm user={user} onSubmit={handleFormSubmit} isLoading={isLoading} />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                      <DocumentUpload user={user} onUpload={handleDocumentUpload} isLoading={isLoading} />
                    </motion.div>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="inventory">
              <MyPhysicalInventory 
                redemptions={physicalRedemptions}
                onDeliveryRequest={handleDeliveryRequest}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="funds">
              <AccountActions 
                onDepositClick={() => setDepositModalOpen(true)}
                onWithdrawClick={() => setWithdrawalModalOpen(true)}
                isKycApproved={user?.kyc_status === 'approved'}
              />
            </TabsContent>

            <TabsContent value="activity">
                <ActivityFeed transactions={transactions} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="statements">
                <StatementGenerator user={user} />
            </TabsContent>
            
            <TabsContent value="support">
                <SupportTickets 
                    tickets={supportTickets}
                    onSubmit={handleCreateTicket}
                    isLoading={isLoading}
                />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}