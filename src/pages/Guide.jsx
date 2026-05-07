import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen, 
  Users,
  ArrowLeftRight,
  Banknote,
  Package,
  PiggyBank,
  UserCheck,
  Languages,
  BarChart2
} from "lucide-react";
import { motion } from "framer-motion";
import USStocksGuide from "../components/guide/USStocksGuide";

const content = {
  en: {
    title: "User Guide",
    subtitle: "Complete guide to using the EVE FINANCE platform",
    language: "Language",
    selectLang: "Select Language",
    gettingStarted: "Getting Started",
    trading: "Trading",
    lending: "Lending",
    physical: "Physical Assets",
    staking: "Staking",
    account: "Account Management",
    welcome: {
      title: "Welcome to EVE FINANCE",
      content: [
        "EVE FINANCE is a comprehensive precious metals trading platform that allows you to trade gold, silver, platinum, and palladium with ease.",
        "Our platform combines traditional precious metals trading with modern financial technology to provide you with a seamless trading experience.",
        "This guide will walk you through all the features and help you get started with your precious metals journey."
      ]
    },
    gettingStartedContent: {
      title: "Getting Started with EVE FINANCE",
      steps: [
        {
          title: "1. Account Registration",
          content: "Click 'Login with Google' to create your account. We use secure Google authentication for your safety."
        },
        {
          title: "2. KYC Verification",
          content: "Complete your Know Your Customer (KYC) verification by providing personal information and uploading required documents. This is mandatory for trading and withdrawals."
        },
        {
          title: "3. Fund Your Account",
          content: "Deposit funds using bank transfer or USDT. You can deposit USD, SGD, CNH, or USDT to start trading."
        },
        {
          title: "4. Start Trading",
          content: "Once your account is funded and verified, you can start trading precious metals immediately."
        }
      ]
    },
    tradingContent: {
      title: "Trading Guide",
      sections: [
        {
          title: "How Trading Works",
          content: "Our platform uses real-time market prices for all precious metals. You can swap between different assets with a 0.5% trading fee."
        },
        {
          title: "Available Assets",
          content: "Trade Gold, Silver, Platinum, Palladium, USD, SGD, CNH, and USDT. All metal prices are quoted per troy ounce."
        },
        {
          title: "Trading Fees",
          content: "We charge a competitive 0.5% fee on all trades, calculated on the target asset amount."
        },
        {
          title: "Live Market Data",
          content: "View real-time price charts and market data to make informed trading decisions."
        }
      ]
    },
    lendingContent: {
      title: "Lending & Borrowing",
      sections: [
        {
          title: "How It Works",
          content: "Use your precious metals as collateral to borrow USD or stablecoins. Loan-to-Value ratios up to 80%."
        },
        {
          title: "Interest Rates",
          content: "Competitive interest rates starting from 8% APR. Interest is calculated daily and compounds."
        },
        {
          title: "Liquidation",
          content: "If your LTV exceeds 85%, your collateral may be liquidated to repay the loan."
        },
        {
          title: "Repayment",
          content: "Repay your loan anytime using any supported currency. Partial payments are accepted."
        }
      ]
    },
    physicalContent: {
      title: "Physical Asset Redemption",
      sections: [
        {
          title: "Redeem Physical Metals",
          content: "Convert your digital gold and silver holdings into physical bars and coins from premium brands."
        },
        {
          title: "Available Products",
          content: "Choose from a curated selection of gold and silver products from renowned mints and refineries."
        },
        {
          title: "Delivery Process",
          content: "Request delivery to your address. We handle secure packaging and shipping worldwide."
        },
        {
          title: "Pricing",
          content: "Physical redemption includes a 5% fee for handling, insurance, and delivery services."
        }
      ]
    },
    stakingContent: {
      title: "Staking Rewards",
      sections: [
        {
          title: "Earn While You Hold",
          content: "Stake your precious metals and earn 4.5% APR. Rewards are calculated daily and paid monthly."
        },
        {
          title: "Flexible Staking",
          content: "Unstake anytime with no penalties. Your staked assets remain secure in your account."
        },
        {
          title: "Compound Growth",
          content: "Reinvest your staking rewards to maximize your returns over time."
        },
        {
          title: "Supported Assets",
          content: "Stake Gold, Silver, Platinum, and Palladium. Minimum staking amount is 0.1 troy ounces."
        }
      ]
    },
    accountContent: {
      title: "Account Management",
      sections: [
        {
          title: "KYC Verification",
          content: "Upload required documents including passport, ID card, and proof of address for account verification."
        },
        {
          title: "Fund Management",
          content: "Deposit and withdraw funds using various methods including bank transfers and cryptocurrency."
        },
        {
          title: "Transaction History",
          content: "View detailed transaction history and generate statements for your records."
        },
        {
          title: "Security Features",
          content: "Your account is protected with bank-grade security, including secure authentication and encrypted data storage."
        }
      ]
    }
  },
  zh: {
    title: "用户指南",
    subtitle: "EVE FINANCE平台完整使用指南",
    language: "语言",
    selectLang: "选择语言",
    gettingStarted: "入门指南",
    trading: "交易",
    lending: "借贷",
    physical: "实物资产",
    staking: "质押",
    account: "账户管理",
    welcome: {
      title: "欢迎使用EVE FINANCE",
      content: [
        "EVE FINANCE是一个综合性贵金属交易平台，让您能够轻松交易黄金、白银、铂金和钯金。",
        "我们的平台将传统贵金属交易与现代金融科技相结合，为您提供无缝的交易体验。",
        "本指南将引导您了解所有功能，帮助您开始贵金属投资之旅。"
      ]
    },
    gettingStartedContent: {
      title: "EVE FINANCE入门指南",
      steps: [
        {
          title: "1. 账户注册",
          content: "点击'使用Google登录'创建您的账户。我们使用安全的Google身份验证来保护您的安全。"
        },
        {
          title: "2. KYC身份验证",
          content: "通过提供个人信息和上传所需文件来完成您的客户身份识别(KYC)验证。这是交易和提现的必要步骤。"
        },
        {
          title: "3. 账户充值",
          content: "使用银行转账或USDT充值。您可以存入USD、SGD、CNH或USDT来开始交易。"
        },
        {
          title: "4. 开始交易",
          content: "一旦您的账户充值并验证完成，您就可以立即开始交易贵金属。"
        }
      ]
    },
    tradingContent: {
      title: "交易指南",
      sections: [
        {
          title: "交易机制",
          content: "我们的平台使用实时市场价格进行所有贵金属交易。您可以在不同资产间进行兑换，交易费用为0.5%。"
        },
        {
          title: "可交易资产",
          content: "交易黄金、白银、铂金、钯金、美元、新加坡元、离岸人民币和USDT。所有金属价格以金衡盎司计价。"
        },
        {
          title: "交易费用",
          content: "我们对所有交易收取具有竞争力的0.5%手续费，按目标资产金额计算。"
        },
        {
          title: "实时市场数据",
          content: "查看实时价格图表和市场数据，做出明智的交易决策。"
        }
      ]
    },
    lendingContent: {
      title: "借贷服务",
      sections: [
        {
          title: "运作机制",
          content: "使用您的贵金属作为抵押品借入美元或稳定币。贷款价值比最高可达80%。"
        },
        {
          title: "利率",
          content: "具有竞争力的利率，年化利率从8%起。利息按日计算并复合。"
        },
        {
          title: "清算",
          content: "如果您的贷款价值比超过85%，您的抵押品可能被清算以偿还贷款。"
        },
        {
          title: "还款",
          content: "随时使用任何支持的货币偿还贷款。接受部分还款。"
        }
      ]
    },
    physicalContent: {
      title: "实物资产兑换",
      sections: [
        {
          title: "兑换实物金属",
          content: "将您的数字黄金和白银持仓转换为来自优质品牌的实物金条和银币。"
        },
        {
          title: "可选产品",
          content: "从知名铸币厂和精炼厂的精选黄金和白银产品中选择。"
        },
        {
          title: "配送流程",
          content: "申请配送到您的地址。我们处理安全包装并全球配送。"
        },
        {
          title: "价格",
          content: "实物兑换包含5%的手续费，用于处理、保险和配送服务。"
        }
      ]
    },
    stakingContent: {
      title: "质押奖励",
      sections: [
        {
          title: "持有即赚取",
          content: "质押您的贵金属并获得4.5%年化收益率。奖励按日计算，按月支付。"
        },
        {
          title: "灵活质押",
          content: "随时解除质押，无惩罚。您的质押资产在账户中保持安全。"
        },
        {
          title: "复合增长",
          content: "重新投资您的质押奖励，以最大化长期回报。"
        },
        {
          title: "支持资产",
          content: "质押黄金、白银、铂金和钯金。最低质押金额为0.1金衡盎司。"
        }
      ]
    },
    accountContent: {
      title: "账户管理",
      sections: [
        {
          title: "KYC验证",
          content: "上传所需文件，包括护照、身份证和地址证明进行账户验证。"
        },
        {
          title: "资金管理",
          content: "使用包括银行转账和加密货币在内的多种方式存取资金。"
        },
        {
          title: "交易历史",
          content: "查看详细的交易历史记录并生成对账单。"
        },
        {
          title: "安全功能",
          content: "您的账户受到银行级安全保护，包括安全身份验证和加密数据存储。"
        }
      ]
    }
  }
};

export default function Guide() {
  const [language, setLanguage] = useState('en');
  const t = content[language];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header with Language Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-slate-900 to-blue-900 bg-clip-text text-transparent">
              {t.title}
            </h1>
            <p className="text-slate-600 mt-2">{t.subtitle}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-600">{t.language}:</span>
            </div>
            <Button
              variant={language === 'en' ? 'default' : 'outline'}
              onClick={() => setLanguage('en')}
              size="sm"
            >
              English
            </Button>
            <Button
              variant={language === 'zh' ? 'default' : 'outline'}
              onClick={() => setLanguage('zh')}
              size="sm"
            >
              中文
            </Button>
          </div>
        </motion.div>

        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0 shadow-lg">
            <CardContent className="p-8">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-4">{t.welcome.title}</h2>
                  <div className="space-y-3">
                    {t.welcome.content.map((paragraph, index) => (
                      <p key={index} className="text-blue-100 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Tabs defaultValue="getting-started" className="space-y-8">
            <TabsList className="grid w-full grid-cols-7 bg-white shadow-lg">
              <TabsTrigger value="getting-started" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" />
                {t.gettingStarted}
              </TabsTrigger>
              <TabsTrigger value="trading" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                {t.trading}
              </TabsTrigger>
              <TabsTrigger value="lending" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Banknote className="w-4 h-4 mr-2" />
                {t.lending}
              </TabsTrigger>
              <TabsTrigger value="physical" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Package className="w-4 h-4 mr-2" />
                {t.physical}
              </TabsTrigger>
              <TabsTrigger value="staking" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <PiggyBank className="w-4 h-4 mr-2" />
                {t.staking}
              </TabsTrigger>
              <TabsTrigger value="account" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <UserCheck className="w-4 h-4 mr-2" />
                {t.account}
              </TabsTrigger>
              <TabsTrigger value="usstocks" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white relative">
                <BarChart2 className="w-4 h-4 mr-2" />
                US Stocks
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="getting-started">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-600" />
                    {t.gettingStartedContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.gettingStartedContent.steps.map((step, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-2">{step.title}</h3>
                        <p className="text-slate-600 leading-relaxed">{step.content}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trading">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowLeftRight className="w-6 h-6 text-blue-600" />
                    {t.tradingContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.tradingContent.sections.map((section, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold text-slate-900 mb-2">{section.title}</h3>
                      <p className="text-slate-600">{section.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lending">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="w-6 h-6 text-blue-600" />
                    {t.lendingContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.lendingContent.sections.map((section, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold text-slate-900 mb-2">{section.title}</h3>
                      <p className="text-slate-600">{section.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="physical">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-6 h-6 text-blue-600" />
                    {t.physicalContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.physicalContent.sections.map((section, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold text-slate-900 mb-2">{section.title}</h3>
                      <p className="text-slate-600">{section.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staking">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="w-6 h-6 text-blue-600" />
                    {t.stakingContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.stakingContent.sections.map((section, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold text-slate-900 mb-2">{section.title}</h3>
                      <p className="text-slate-600">{section.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="account">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="w-6 h-6 text-blue-600" />
                    {t.accountContent.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {t.accountContent.sections.map((section, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold text-slate-900 mb-2">{section.title}</h3>
                      <p className="text-slate-600">{section.content}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="usstocks">
              <USStocksGuide />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}