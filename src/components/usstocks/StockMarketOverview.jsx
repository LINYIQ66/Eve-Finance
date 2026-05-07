import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

const US_STOCKS = [
  { symbol: "AAPL", name: "Apple", binance: "aaplbusdt" },
  { symbol: "MSFT", name: "Microsoft", binance: "msftbusdt" },
  { symbol: "GOOGL", name: "Alphabet", binance: "googlbusdt" },
  { symbol: "AMZN", name: "Amazon", binance: "amznbusdt" },
  { symbol: "NVDA", name: "NVIDIA", binance: "nvdabusdt" },
  { symbol: "TSLA", name: "Tesla", binance: "tslabusdt" },
  { symbol: "META", name: "Meta", binance: "metabusdt" },
  { symbol: "BRK", name: "Berkshire B", binance: "brkbbusdt" },
  { symbol: "JPM", name: "JPMorgan", binance: "jpmbusdt" },
  { symbol: "V", name: "Visa", binance: "vbusdt" },
  { symbol: "JNJ", name: "Johnson&Johnson", binance: "jnjbusdt" },
  { symbol: "WMT", name: "Walmart", binance: "wmtbusdt" },
  { symbol: "XOM", name: "ExxonMobil", binance: "xombusdt" },
  { symbol: "MA", name: "Mastercard", binance: "mabusdt" },
  { symbol: "PG", name: "Procter & Gamble", binance: "pgbusdt" },
  { symbol: "HD", name: "Home Depot", binance: "hdbusdt" },
  { symbol: "CVX", name: "Chevron", binance: "cvxbusdt" },
  { symbol: "MRK", name: "Merck", binance: "mrkbusdt" },
  { symbol: "ABBV", name: "AbbVie", binance: "abbvbusdt" },
  { symbol: "KO", name: "Coca-Cola", binance: "kobusdt" },
];

export default function StockMarketOverview({ onStockClick, selectedSymbol }) {
  const [prices, setPrices] = useState({});
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    const streams = US_STOCKS.map(s => `${s.binance}@ticker`).join("/");
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.data) {
        const d = msg.data;
        // Extract symbol from stream name: e.g. "aaplbusdt@ticker" -> find matching stock
        const streamSymbol = msg.stream.split("@")[0];
        const stock = US_STOCKS.find(s => s.binance === streamSymbol);
        if (stock) {
          setPrices(prev => ({
            ...prev,
            [stock.symbol]: {
              price: parseFloat(d.c),
              change: parseFloat(d.P),
              open: parseFloat(d.o),
            }
          }));
        }
      }
    };

    ws.onclose = () => {
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-900 text-lg flex items-center gap-2">
          US Stocks
          <Badge className="bg-green-100 text-green-800 text-xs">Live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {US_STOCKS.map((stock) => {
            const data = prices[stock.symbol];
            const isPositive = data ? data.change >= 0 : true;
            const isSelected = selectedSymbol === stock.symbol;

            return (
              <div
                key={stock.symbol}
                onClick={() => onStockClick(stock.symbol)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow"
                    : "hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="min-w-0">
                  <p className={`font-semibold text-sm ${isSelected ? "text-white" : "text-slate-900"}`}>
                    {stock.symbol}
                  </p>
                  <p className={`text-xs truncate ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                    {stock.name}
                  </p>
                </div>
                <div className="text-right ml-2 flex-shrink-0">
                  <p className={`font-semibold text-sm ${isSelected ? "text-white" : "text-slate-900"}`}>
                    {data ? `$${data.price.toFixed(2)}` : "—"}
                  </p>
                  {data && (
                    <div className={`flex items-center gap-1 justify-end text-xs font-medium ${
                      isSelected ? "text-blue-100" : isPositive ? "text-green-600" : "text-red-500"
                    }`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {data.change >= 0 ? "+" : ""}{data.change.toFixed(2)}%
                    </div>
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

export { US_STOCKS };