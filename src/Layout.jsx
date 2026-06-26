import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/all";
import {
  Home, 
  Wallet, 
  ArrowLeftRight, 
  Banknote, 
  UserCheck, 
  Settings,
  Shield,
  PiggyBank, 
  Package, 
  BookOpen,
  FileText,
  Languages,
  ChevronDown,
  BarChart2,
  LogIn
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LanguageProvider, useLanguage } from "@/components/common/LanguageProvider";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import { canAccessPage } from "@/lib/accessControl";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";

const LanguageSwitcher = () => {
    const { language, setLanguage } = useLanguage();
    const [isMobile, setIsMobile] = useState(false);
    
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const languages = [
        { code: 'en', name: 'English' },
        { code: 'zh', name: '中文' },
        { code: 'id', name: 'Bahasa Indonesia' },
        { code: 'vi', name: 'Tiếng Việt' },
        { code: 'th', name: 'ภาษาไทย' }
    ];
    const currentLanguage = languages.find(l => l.code === language);

    // 移动端使用Select组件，桌面端使用Popover
    if (isMobile) {
        return (
            <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full">
                    <SelectValue>
                        <span className="flex items-center gap-2">
                            <Languages className="w-4 h-4" />
                            {currentLanguage.name}
                        </span>
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {languages.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>
                            {lang.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    // 桌面端使用Popover
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                        <Languages className="w-4 h-4" />
                        {currentLanguage.name}
                    </span>
                    <ChevronDown className="w-4 h-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
                {languages.map(lang => (
                    <Button
                        key={lang.code}
                        variant={language === lang.code ? 'secondary' : 'ghost'}
                        className="w-full justify-start"
                        onClick={() => setLanguage(lang.code)}
                    >
                        {lang.name}
                    </Button>
                ))}
            </PopoverContent>
        </Popover>
    );
};

const SidebarMenuContent = ({ visibleNavItems, location, showLogin, loginLabel }) => {
  const { setOpen } = useSidebar();

  const handleMenuClick = () => {
    if (window.innerWidth < 768) {
      setOpen(false);
    }
  };

  return (
    <SidebarMenu>
      {visibleNavItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton 
            asChild 
            onClick={handleMenuClick}
            className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 transition-all duration-300 rounded-xl mb-1 ${
              location.pathname === item.url 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' 
                : 'text-slate-600'
            }`}
          >
            <Link to={item.url} className="flex items-center gap-3 px-4 py-3">
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
      {showLogin && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => {
              handleMenuClick();
              base44.auth.redirectToLogin(window.location.href);
            }}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 rounded-xl mb-1 shadow-lg"
          >
            <div className="flex items-center gap-3 px-4 py-3 w-full">
              <LogIn className="w-5 h-5" />
              <span className="font-medium">{loginLabel}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
};

const AppLayout = ({ children }) => {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (e) {
        setUser(null);
      }
    };
    fetchUser();
  }, [location.pathname]);

  const navigationItems = [
    { title: t('sidebar.home'), url: createPageUrl("Home"), icon: Home, page: 'Home' },
    { title: t('sidebar.wallet'), url: createPageUrl("Wallet"), icon: Wallet, page: 'Wallet' },
    { title: t('sidebar.trading'), url: createPageUrl("Trading"), icon: ArrowLeftRight, page: 'Trading' },
    { title: t('sidebar.physical'), url: createPageUrl("Physical"), icon: Package, page: 'Physical' },
    { title: t('sidebar.loan'), url: createPageUrl("Lending"), icon: Banknote, page: 'Lending' },
    { title: t('sidebar.us_stocks'), url: createPageUrl("USStocks"), icon: BarChart2, page: 'USStocks' },
    { title: t('sidebar.staking'), url: createPageUrl("Staking"), icon: PiggyBank, page: 'Staking' },
    { title: t('sidebar.account'), url: createPageUrl("Account"), icon: UserCheck, page: 'Account' },
    { title: t('sidebar.statement'), url: createPageUrl("DailyStatement"), icon: FileText, page: 'DailyStatement' },
    { title: t('sidebar.guide'), url: createPageUrl("Guide"), icon: BookOpen, page: 'Guide' },
    { title: t('sidebar.admin'), url: createPageUrl("Admin"), icon: Settings, page: 'Admin' },
  ];

  const visibleNavItems = navigationItems.filter(item => canAccessPage(user?.role, item.page));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50">
        <Sidebar className="border-r border-slate-200/50 bg-white">
          <SidebarHeader className="border-b border-slate-200/50 p-6 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png" 
                  alt="EVE FINANCE Logo" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="font-bold text-xl bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
                  EVE FINANCE
                </h2>
                <p className="text-xs text-slate-500 font-medium">Premium Exchange</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-3 bg-white">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenuContent visibleNavItems={visibleNavItems} location={location} showLogin={!user} loginLabel={t('sidebar.login')} />
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto pt-4">
               <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">
                 Language
               </SidebarGroupLabel>
               <SidebarGroupContent className="px-3">
                 <LanguageSwitcher />
               </SidebarGroupContent>
            </SidebarGroup>
            
            {user && (
              <SidebarGroup className="mt-4">
                <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-3">
                  {t('sidebar.security')}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Shield className="w-4 h-4 text-green-500" />
                      <span className="text-slate-600">{t('sidebar.bank_grade_security')}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {t('sidebar.security_desc')}
                    </div>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          {user && (
            <SidebarFooter className="border-t border-slate-200/50 p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 gradient-navy rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">{user.full_name?.[0]?.toUpperCase() || 'U'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{user.full_name || "Guest"}</p>
                  <p className="text-xs text-slate-500 truncate">{user.kyc_status === 'approved' ? 'Verified Account' : 'Not Verified'}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/50 text-center">
                <p className="text-xs text-slate-400">© 2004 EVE FINANCE. All rights reserved.</p>
              </div>
            </SidebarFooter>
          )}
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/50 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0],
                  boxShadow: [
                    "0 0 0px rgba(99, 102, 241, 0)",
                    "0 0 30px rgba(99, 102, 241, 0.6)",
                    "0 0 0px rgba(99, 102, 241, 0)"
                  ]
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: "easeInOut"
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-xl"
              >
                <SidebarTrigger className="relative hover:bg-slate-100 p-3 rounded-xl transition-all duration-200 shadow-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600">
                  <motion.div
                    animate={{
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-indigo-400 blur"
                  />
                  <div className="relative z-10">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </div>
                </SidebarTrigger>
              </motion.div>
              <div className="flex items-center gap-2">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png" 
                  alt="EVE FINANCE Logo" 
                  className="w-8 h-8 rounded-lg object-cover"
                />
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
                  EVE FINANCE
                </h1>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
        <ChatbotWidget />
      </div>
    </SidebarProvider>
  );
}


export default function Layout({ children, currentPageName }) {
    return (
        <LanguageProvider>
            <AppLayout>
                {children}
            </AppLayout>
        </LanguageProvider>
    );
}