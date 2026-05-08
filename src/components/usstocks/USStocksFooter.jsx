import React from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/components/common/LanguageProvider";

const CONTENT = {
  en: {
    products: {
      title: "Products",
      links: [
        { label: "US Stocks", to: "/USStocks" },
        { label: "Metals Trading", to: "/Trading" },
        { label: "Staking", to: "/Staking" },
        { label: "Physical Redemption", to: "/Physical" },
        { label: "Crypto Loans", to: "/Lending" },
      ],
    },
    trading: {
      title: "Trading",
      links: [
        { label: "Market Orders", to: "/USStocks" },
        { label: "Limit Orders", to: "/USStocks" },
        { label: "Portfolio", to: "/Wallet" },
        { label: "Fee: 0.1% · 100 EVE/$1", to: "/Guide" },
      ],
    },
    account: {
      title: "Account",
      links: [
        { label: "KYC Verification", to: "/Account" },
        { label: "Daily Statement", to: "/DailyStatement" },
        { label: "Support", to: "/Account" },
        { label: "Guide", to: "/Guide" },
      ],
    },
    risk: "Risk Warning: Trading tokenized stocks involves significant risk. You may lose some or all of your capital. Past performance is not indicative of future results. Not available in the US, Canada, or restricted jurisdictions.",
    copyright: "© 2004–2026 EVE FINANCE Ltd. All rights reserved.",
    ssl: "256-bit SSL",
    segregated: "Segregated Funds",
    support: "24/7 Support",
  },
  zh: {
    products: {
      title: "产品",
      links: [
        { label: "美股交易", to: "/USStocks" },
        { label: "贵金属", to: "/Trading" },
        { label: "质押收益", to: "/Staking" },
        { label: "实物兑换", to: "/Physical" },
        { label: "加密借贷", to: "/Lending" },
      ],
    },
    trading: {
      title: "交易",
      links: [
        { label: "市价订单", to: "/USStocks" },
        { label: "限价订单", to: "/USStocks" },
        { label: "我的投资组合", to: "/Wallet" },
        { label: "费率 0.1% · 每$1得100 EVE", to: "/Guide" },
      ],
    },
    account: {
      title: "账户",
      links: [
        { label: "KYC 认证", to: "/Account" },
        { label: "每日账单", to: "/DailyStatement" },
        { label: "客户支持", to: "/Account" },
        { label: "使用指南", to: "/Guide" },
      ],
    },
    risk: "风险提示：交易代币化股票存在重大风险，您可能损失部分或全部本金。历史表现不代表未来收益。本平台不向美国、加拿大及受限地区用户提供服务。",
    copyright: "© 2004–2026 EVE FINANCE Ltd. 版权所有。",
    ssl: "256位 SSL 加密",
    segregated: "资金隔离保管",
    support: "24/7 客服支持",
  },
  id: {
    products: {
      title: "Produk",
      links: [
        { label: "Saham AS", to: "/USStocks" },
        { label: "Perdagangan Logam", to: "/Trading" },
        { label: "Staking", to: "/Staking" },
        { label: "Penebusan Fisik", to: "/Physical" },
        { label: "Pinjaman Kripto", to: "/Lending" },
      ],
    },
    trading: {
      title: "Perdagangan",
      links: [
        { label: "Order Pasar", to: "/USStocks" },
        { label: "Order Limit", to: "/USStocks" },
        { label: "Portofolio", to: "/Wallet" },
        { label: "Biaya 0,1% · 100 EVE/$1", to: "/Guide" },
      ],
    },
    account: {
      title: "Akun",
      links: [
        { label: "Verifikasi KYC", to: "/Account" },
        { label: "Laporan Harian", to: "/DailyStatement" },
        { label: "Dukungan", to: "/Account" },
        { label: "Panduan", to: "/Guide" },
      ],
    },
    risk: "Peringatan Risiko: Perdagangan saham tokenisasi memiliki risiko signifikan. Anda mungkin kehilangan sebagian atau seluruh modal. Kinerja masa lalu bukan indikator hasil di masa depan.",
    copyright: "© 2004–2026 EVE FINANCE Ltd. Hak cipta dilindungi.",
    ssl: "Enkripsi SSL 256-bit",
    segregated: "Dana Terpisah",
    support: "Dukungan 24/7",
  },
  vi: {
    products: {
      title: "Sản phẩm",
      links: [
        { label: "Cổ phiếu Mỹ", to: "/USStocks" },
        { label: "Giao dịch Kim loại", to: "/Trading" },
        { label: "Staking", to: "/Staking" },
        { label: "Đổi vật lý", to: "/Physical" },
        { label: "Vay Crypto", to: "/Lending" },
      ],
    },
    trading: {
      title: "Giao dịch",
      links: [
        { label: "Lệnh thị trường", to: "/USStocks" },
        { label: "Lệnh giới hạn", to: "/USStocks" },
        { label: "Danh mục", to: "/Wallet" },
        { label: "Phí 0,1% · 100 EVE/$1", to: "/Guide" },
      ],
    },
    account: {
      title: "Tài khoản",
      links: [
        { label: "Xác minh KYC", to: "/Account" },
        { label: "Báo cáo hàng ngày", to: "/DailyStatement" },
        { label: "Hỗ trợ", to: "/Account" },
        { label: "Hướng dẫn", to: "/Guide" },
      ],
    },
    risk: "Cảnh báo rủi ro: Giao dịch cổ phiếu token hóa có rủi ro đáng kể. Bạn có thể mất một phần hoặc toàn bộ vốn. Kết quả quá khứ không đảm bảo cho tương lai.",
    copyright: "© 2004–2026 EVE FINANCE Ltd. Bảo lưu mọi quyền.",
    ssl: "Mã hóa SSL 256-bit",
    segregated: "Quỹ tách biệt",
    support: "Hỗ trợ 24/7",
  },
  th: {
    products: {
      title: "ผลิตภัณฑ์",
      links: [
        { label: "หุ้นสหรัฐ", to: "/USStocks" },
        { label: "ซื้อขายโลหะ", to: "/Trading" },
        { label: "สเตคกิ้ง", to: "/Staking" },
        { label: "แลกรับสินทรัพย์จริง", to: "/Physical" },
        { label: "กู้ยืมคริปโต", to: "/Lending" },
      ],
    },
    trading: {
      title: "การซื้อขาย",
      links: [
        { label: "คำสั่งตลาด", to: "/USStocks" },
        { label: "คำสั่งจำกัดราคา", to: "/USStocks" },
        { label: "พอร์ตโฟลิโอ", to: "/Wallet" },
        { label: "ค่าธรรมเนียม 0.1% · 100 EVE/$1", to: "/Guide" },
      ],
    },
    account: {
      title: "บัญชี",
      links: [
        { label: "ยืนยัน KYC", to: "/Account" },
        { label: "ใบแจ้งยอดรายวัน", to: "/DailyStatement" },
        { label: "ฝ่ายสนับสนุน", to: "/Account" },
        { label: "คู่มือการใช้งาน", to: "/Guide" },
      ],
    },
    risk: "คำเตือนความเสี่ยง: การซื้อขายหุ้นแบบโทเคนมีความเสี่ยงสูง คุณอาจสูญเสียเงินลงทุนบางส่วนหรือทั้งหมด ผลการดำเนินงานในอดีตไม่ได้รับประกันผลในอนาคต",
    copyright: "© 2004–2026 EVE FINANCE Ltd. สงวนลิขสิทธิ์",
    ssl: "การเข้ารหัส SSL 256 บิต",
    segregated: "แยกเงินทุน",
    support: "บริการ 24/7",
  },
};

export default function USStocksFooter() {
  const { language } = useLanguage();
  const c = CONTENT[language] || CONTENT.en;

  return (
    <footer className="mt-16 bg-slate-900 text-slate-300 rounded-2xl overflow-hidden shadow-2xl">
      {/* Nav Links */}
      <div className="px-6 py-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-8">
          {[c.products, c.trading, c.account].map(section => (
            <div key={section.title}>
              <h4 className="text-white font-semibold text-xs uppercase tracking-widest mb-4">{section.title}</h4>
              <ul className="space-y-2.5">
                {section.links.map(link => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-slate-400 text-sm hover:text-blue-400 transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Warning */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/40">
        <div className="max-w-5xl mx-auto flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">{c.risk}</p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png"
              alt="EVE FINANCE"
              className="w-6 h-6 rounded object-cover"
            />
            <div>
              <span className="text-slate-300 font-bold text-sm">EVE FINANCE</span>
              <p className="text-slate-600 text-xs">{c.copyright}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-green-500" />{c.ssl}</span>
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-blue-400" />{c.segregated}</span>
            <span className="text-slate-500">{c.support}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}