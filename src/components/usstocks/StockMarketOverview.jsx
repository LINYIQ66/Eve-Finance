import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

export const US_STOCKS = [
  { symbol: "AAPL",  name: "Apple",              binance: "aaplbusdt" },
  { symbol: "MSFT",  name: "Microsoft",           binance: "msftbusdt" },
  { symbol: "GOOGL", name: "Alphabet",            binance: "googlbusdt" },
  { symbol: "AMZN",  name: "Amazon",              binance: "amznbusdt" },
  { symbol: "NVDA",  name: "NVIDIA",              binance: "nvdabusdt" },
  { symbol: "TSLA",  name: "Tesla",               binance: "tslabusdt" },
  { symbol: "META",  name: "Meta",                binance: "metabusdt" },
  { symbol: "JPM",   name: "JPMorgan",            binance: "jpmbusdt" },
  { symbol: "V",     name: "Visa",                binance: "vbusdt" },
  { symbol: "JNJ",   name: "Johnson & Johnson",   binance: "jnjbusdt" },
  { symbol: "WMT",   name: "Walmart",             binance: "wmtbusdt" },
  { symbol: "XOM",   name: "ExxonMobil",          binance: "xombusdt" },
  { symbol: "MA",    name: "Mastercard",          binance: "mabusdt" },
  { symbol: "PG",    name: "Procter & Gamble",    binance: "pgbusdt" },
  { symbol: "HD",    name: "Home Depot",          binance: "hdbusdt" },
  { symbol: "CVX",   name: "Chevron",             binance: "cvxbusdt" },
  { symbol: "MRK",   name: "Merck",               binance: "mrkbusdt" },
  { symbol: "ABBV",  name: "AbbVie",              binance: "abbvbusdt" },
  { symbol: "KO",    name: "Coca-Cola",           binance: "kobusdt" },
  { symbol: "BAC",   name: "Bank of America",     binance: "bacbusdt" },
];

// Fetch all 24hr tickers from Binance REST API (no CORS issues for public data)
async function fetchAllPrices() {
  const symbols = US_STOCKS.map(s => `"${s.binance.toUpperCase()}"`).join(",");
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch prices");
  return res.json();
}

export default function StockMarketOverview({ onStockClick, selectedSymbol, onPriceUpdate }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const loadPrices = async () => {
    try {
      const data = await fetchAllPrices();
      const priceMap = {};
      data.forEach(ticker => {
        const stock = US_STOCKS.find(s => s.binance.toUpperCase() === ticker.symbol);
        if (stock) {
          priceMap[stock.symbol] = {
            price: parseFloat(ticker.lastPrice),
            change: parseFloat(ticker.priceChangePercent),
            open: parseFloat(ticker.openPrice),
          };
        }
      });
      setPrices(priceMap);
      setLoading(false);
      // Notify parent with selected stock price
      if (onPriceUpdate && selectedSymbol && priceMap[selectedSymbol]) {
        onPriceUpdate(priceMap[selectedSymbol].price);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
    intervalRef.current = setInterval(loadPrices, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Notify parent when selected symbol changes
  useEffect(() => {
    if (onPriceUpdate && prices[selectedSymbol]) {
      onPriceUpdate(prices[selectedSymbol].price);
    }
  }, [selectedSymbol, prices]);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg h-full flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-slate-900 text-base flex items-center gap-2">
          US Stocks
          <Badge className="bg-green-100 text-green-800 text-xs">Live</Badge>
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2 min-h-0">
        <div className="space-y-0.5">
          {US_STOCKS.map((stock) => {
            const data = prices[stock.symbol];
            const isPositive = data ? data.change >= 0 : true;
            const isSelected = selectedSymbol === stock.symbol;

            return (
              <div
                key={stock.symbol}
                onClick={() => onStockClick(stock.symbol)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0">
                  <p className={`font-semibold text-sm leading-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                    {stock.symbol}
                  </p>
                  <p className={`text-xs truncate leading-tight ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                    {stock.name}
                  </p>
                </div>
                <div className="text-right ml-2 flex-shrink-0">
                  {data ? (
                    <>
                      <p className={`font-semibold text-sm leading-tight ${isSelected ? "text-white" : "text-slate-900"}`}>
                        ${data.price.toFixed(2)}
                      </p>
                      <div className={`flex items-center gap-0.5 justify-end text-xs font-medium leading-tight ${
                        isSelected ? "text-blue-100" : isPositive ? "text-green-600" : "text-red-500"
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {data.change >= 0 ? "+" : ""}{data.change.toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Loading...</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}