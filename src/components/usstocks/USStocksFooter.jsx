import React, { useState } from "react";
import { ChevronDown, ChevronUp, Shield, FileText, AlertTriangle, BookOpen, Phone, Globe } from "lucide-react";

const NAV_SECTIONS = [
  {
    title: "Products",
    links: [
      { label: "US Stock Trading", href: "#" },
      { label: "Precious Metals", href: "#" },
      { label: "Crypto Exchange", href: "#" },
      { label: "Staking & Yield", href: "#" },
      { label: "Physical Redemption", href: "#" },
      { label: "Crypto-Backed Loans", href: "#" },
    ],
  },
  {
    title: "Trading",
    links: [
      { label: "Market Orders", href: "#" },
      { label: "Limit Orders", href: "#" },
      { label: "Fractional Shares", href: "#" },
      { label: "Portfolio Overview", href: "#" },
      { label: "Order History", href: "#" },
      { label: "Fee Schedule", href: "#" },
    ],
  },
  {
    title: "Legal & Compliance",
    links: [
      { label: "Terms of Service", href: "#" },
      { label: "Privacy Policy", href: "#" },
      { label: "Risk Disclosure", href: "#" },
      { label: "AML / KYC Policy", href: "#" },
      { label: "Cookie Policy", href: "#" },
      { label: "Regulatory Information", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Trading Guide", href: "#" },
      { label: "Contact Support", href: "#" },
      { label: "System Status", href: "#" },
      { label: "Security Center", href: "#" },
      { label: "API Documentation", href: "#" },
    ],
  },
];

const DISCLAIMER_ITEMS = [
  {
    icon: AlertTriangle,
    title: "Investment Risk Warning",
    body: "Trading tokenized US stocks involves significant risk of loss. The value of investments can go up as well as down, and you may receive back less than you invest. Past performance is not indicative of future results. Please ensure you fully understand the risks involved before trading.",
  },
  {
    icon: Shield,
    title: "Tokenized Securities Disclosure",
    body: "EVE FINANCE offers tokenized representations of US-listed equities. These tokens track the price of the underlying stock but do not confer shareholder rights, voting rights, or dividend entitlements unless explicitly stated. Tokenized stocks are not the same as owning the actual underlying shares directly.",
  },
  {
    icon: FileText,
    title: "Regulatory Notice",
    body: "EVE FINANCE operates in compliance with applicable financial regulations. Users are responsible for ensuring that their use of the platform complies with the laws and regulations of their jurisdiction. This platform is not available to residents of certain jurisdictions where tokenized securities trading is restricted or prohibited.",
  },
  {
    icon: BookOpen,
    title: "Market Data & Pricing",
    body: "Price data is sourced from reputable third-party market data providers and is displayed for informational purposes. Prices may vary from those on traditional exchanges due to market conditions, liquidity, and timing. EVE FINANCE does not guarantee the accuracy, completeness, or timeliness of market data.",
  },
];

function DisclaimerItem({ item }) {
  const [open, setOpen] = useState(false);
  const Icon = item.icon;
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-slate-200 text-sm font-medium">
          <Icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
          {item.title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-slate-400 text-xs leading-relaxed border-t border-slate-700 pt-3">
          {item.body}
        </div>
      )}
    </div>
  );
}

export default function USStocksFooter() {
  return (
    <footer className="mt-16 bg-slate-900 text-slate-300 rounded-2xl overflow-hidden shadow-2xl">
      {/* Trading Info Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-white font-bold text-base mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Trading Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Real-Time Prices", desc: "Live market data for tokenized US stocks via EVE FINANCE" },
              { label: "Trade with USDT", desc: "Buy and sell back to USDT anytime from your wallet" },
              { label: "0.1% Fee · 100 EVE/$ Reward", desc: "Low trading fee with EVE token rewards on every trade" },
              { label: "Fractional Shares", desc: "Trade any USDT amount — no minimum share lot required" },
            ].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl px-4 py-3">
                <p className="text-white font-semibold text-xs mb-1">{item.label}</p>
                <p className="text-blue-200 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Market Order", desc: "Executes instantly at the current market price. Best for speed and certainty of execution." },
              { title: "Limit Order", desc: "Set your target price. Funds are frozen and the order executes automatically when the market reaches your price." },
            ].map(item => (
              <div key={item.title} className="bg-white/10 rounded-xl px-4 py-3 flex gap-3 items-start">
                <div className="w-2 h-2 bg-blue-300 rounded-full mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-semibold text-xs">{item.title}</p>
                  <p className="text-blue-200 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation Grid */}
      <div className="px-6 py-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <h4 className="text-white font-semibold text-xs uppercase tracking-widest mb-3">{section.title}</h4>
              <ul className="space-y-2">
                {section.links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-slate-400 text-xs hover:text-blue-400 transition-colors"
                      onClick={e => e.preventDefault()}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimers */}
      <div className="px-6 py-6 border-b border-slate-800">
        <div className="max-w-7xl mx-auto">
          <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            Important Disclosures &amp; Legal Notices
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DISCLAIMER_ITEMS.map(item => (
              <DisclaimerItem key={item.title} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md overflow-hidden">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png"
                alt="EVE FINANCE"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-slate-400 font-semibold">EVE FINANCE</span>
            <span className="text-slate-600">|</span>
            <span>© 2004–2026 EVE FINANCE. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-green-500" /> Bank-Grade Security</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-blue-400" /> 24/7 Support</span>
            <span className="text-slate-600">v2.6.0</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-800 text-xs text-slate-600 leading-relaxed">
          Tokenized stocks and digital assets are subject to market risk. EVE FINANCE does not provide investment advice. All trading decisions are made at your own risk. Please read our full Risk Disclosure, Terms of Service, and Privacy Policy before trading. EVE FINANCE is not registered as a broker-dealer or investment adviser. This platform is intended for informational and trading purposes only.
        </div>
      </div>
    </footer>
  );
}