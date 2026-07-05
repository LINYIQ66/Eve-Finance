import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw, Star, X } from "lucide-react";
import { getHKStockPrices } from "@/functions/getHKStockPrices";
import { User } from "@/entities/all";
import HKStockSearch from "./HKStockSearch";

// Default popular HK stocks
const DEFAULT_STOCKS = [
  { symbol: "00700", name: "腾讯控股" },
  { symbol: "09988", name: "阿里巴巴-W" },
  { symbol: "03690", name: "美团-W" },
  { symbol: "00388", name: "港交所" },
  { symbol: "02318", name: "中国平安" },
  { symbol: "00939", name: "建设银行" },
  { symbol: "01299", name: "友邦保险" },
  { symbol: "00005", name: "汇丰控股" },
  { symbol: "01398", name: "工商银行" },
  { symbol: "03988", name: "中国银行" },
  { symbol: "00941", name: "中国移动" },
  { symbol: "00386", name: "中国石油化工" },
  { symbol: "02388", name: "中银香港" },
  { symbol: "00011", name: "恒生银行" },
  { symbol: "01211", name: "比亚迪股份" },
  { symbol: "02020", name: "安踏体育" },
  { symbol: "02331", name: "李宁" },
  { symbol: "09633", name: "农夫山泉" },
  { symbol: "06618", name: "京东集团-SW" },
  { symbol: "09888", name: "网易-S" },
];

export { DEFAULT_STOCKS as HK_DEFAULT_STOCKS };

export default function HKStockMarketOverview({ onStockClick, selectedSymbol, onPriceUpdate, onAllPricesUpdate, user }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [addedStocks, setAddedStocks] = useState([]);
  const intervalRef = useRef(null);

  // Load added stocks from user profile
  useEffect(() => {
    if (user?.hk_stock_watchlist) {
      setAddedStocks(user.hk_stock_watchlist);
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('addedHKStocks') || '[]');
        setAddedStocks(stored);
      } catch (e) {
        setAddedStocks([]);
      }
    }
  }, [user]);

  const handleAddStock = async (stock) => {
    const updated = [...addedStocks, { symbol: stock.symbol, name: stock.name }];
    setAddedStocks(updated);
    if (user) {
      try {
        await User.updateMyUserData({ hk_stock_watchlist: updated });
      } catch (e) {}
    } else {
      localStorage.setItem('addedHKStocks', JSON.stringify(updated));
    }
  };

  const handleRemoveStock = async (symbol) => {
    const updated = addedStocks.filter(s => s.symbol !== symbol);
    setAddedStocks(updated);
    if (user) {
      try {
        await User.updateMyUserData({ hk_stock_watchlist: updated });
      } catch (e) {}
    } else {
      localStorage.setItem('addedHKStocks', JSON.stringify(updated));
    }
  };

  // Combined stock list
  const allStocks = [
    ...DEFAULT_STOCKS,
    ...addedStocks.filter(s => !DEFAULT_STOCKS.some(d => d.symbol === s.symbol)),
  ];

  const loadPrices = async () => {
    try {
      const allSymbols = allStocks.map(s => s.symbol).join(',');
      const res = await getHKStockPrices({ symbols: allSymbols });
      const mergedPrices = res?.data?.prices || {};

      setPrices(mergedPrices);
      setLoading(false);
      if (onPriceUpdate && selectedSymbol && mergedPrices[selectedSymbol]) {
        onPriceUpdate(mergedPrices[selectedSymbol].price);
      }
      if (onAllPricesUpdate) {
        onAllPricesUpdate(mergedPrices);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
    intervalRef.current = setInterval(loadPrices, 30000);
    return () => clearInterval(intervalRef.current);
  }, [addedStocks]);

  useEffect(() => {
    if (onPriceUpdate && prices[selectedSymbol]) {
      onPriceUpdate(prices[selectedSymbol].price);
    }
  }, [selectedSymbol, prices]);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-slate-900 text-base flex items-center gap-2">
          港股行情
          <Badge className="bg-green-100 text-green-800 text-xs">实时</Badge>
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2 min-h-0">
        <div className="mb-2">
          <HKStockSearch onAdd={handleAddStock} addedSymbols={allStocks.map(s => s.symbol)} />
        </div>
        <div className="space-y-0.5">
          {allStocks.map((stock) => {
            const isCustom = !DEFAULT_STOCKS.some(d => d.symbol === stock.symbol);
            const data = prices[stock.symbol];
            const isPositive = data ? data.change >= 0 : true;
            const isSelected = selectedSymbol === stock.symbol;

            return (
              <div
                key={stock.symbol}
                onClick={() => onStockClick(stock.symbol)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className={`font-semibold text-sm leading-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                      {stock.symbol}
                    </p>
                    {isCustom && (
                      <Star className={`w-3 h-3 flex-shrink-0 ${isSelected ? "text-yellow-300" : "text-yellow-500"}`} fill="currentColor" />
                    )}
                  </div>
                  <p className={`text-xs truncate leading-tight ${isSelected ? "text-red-100" : "text-slate-400"}`}>
                    {data?.name || stock.name}
                  </p>
                </div>
                <div className="text-right ml-2 flex-shrink-0">
                  {data?.price ? (
                    <>
                      <p className={`font-semibold text-sm leading-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                        HK${data.price.toFixed(2)}
                      </p>
                      <div className={`flex items-center gap-0.5 justify-end text-xs font-medium leading-tight ${
                        isSelected ? "text-red-100" : isPositive ? "text-green-600" : "text-red-500"
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {data.change >= 0 ? "+" : ""}{data.change.toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <p className={`text-xs ${loading ? "text-slate-400 animate-pulse" : "text-slate-400"}`}>
                      {loading ? "Loading..." : "—"}
                    </p>
                  )}
                </div>
                {isCustom && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveStock(stock.symbol); }}
                    className={`ml-1 p-1 rounded transition-colors flex-shrink-0 ${
                      isSelected ? "text-white/70 hover:text-white hover:bg-white/20" : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                    title="移除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
