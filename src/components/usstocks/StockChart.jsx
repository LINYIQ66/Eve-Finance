import React, { useEffect, useRef, memo } from "react";
import { Card } from "@/components/ui/card";

const STOCK_TV_MAP = {
  AAPL: "NASDAQ:AAPL",
  MSFT: "NASDAQ:MSFT",
  GOOGL: "NASDAQ:GOOGL",
  AMZN: "NASDAQ:AMZN",
  NVDA: "NASDAQ:NVDA",
  TSLA: "NASDAQ:TSLA",
  META: "NASDAQ:META",
  BRK: "NYSE:BRK.B",
  JPM: "NYSE:JPM",
  V: "NYSE:V",
  JNJ: "NYSE:JNJ",
  WMT: "NYSE:WMT",
  XOM: "NYSE:XOM",
  MA: "NYSE:MA",
  PG: "NYSE:PG",
  HD: "NYSE:HD",
  CVX: "NYSE:CVX",
  MRK: "NYSE:MRK",
  ABBV: "NYSE:ABBV",
  KO: "NYSE:KO",
};

function StockChart({ symbol = "AAPL" }) {
  const container = useRef();

  useEffect(() => {
    const tvSymbol = STOCK_TV_MAP[symbol] || `NASDAQ:${symbol}`;

    if (container.current) {
      while (container.current.firstChild) {
        container.current.removeChild(container.current.firstChild);
      }
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      allow_symbol_change: true,
      calendar: false,
      details: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      interval: "D",
      locale: "en",
      save_image: true,
      style: "1",
      symbol: tvSymbol,
      theme: "light",
      timezone: "Etc/UTC",
      backgroundColor: "rgba(255, 255, 255, 0)",
      gridColor: "rgba(46, 46, 46, 0.06)",
      watchlist: [],
      withdateranges: false,
      compareSymbols: [],
      studies: [],
      autosize: true,
    });

    if (container.current) {
      container.current.appendChild(script);
    }
  }, [symbol]);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg p-2 h-full">
      <div
        className="tradingview-widget-container"
        ref={container}
        style={{ height: "100%", width: "100%" }}
      >
        <div
          className="tradingview-widget-container__widget"
          style={{ height: "calc(100% - 32px)", width: "100%" }}
        />
        <div className="tradingview-widget-copyright" style={{ zIndex: 10, position: "relative" }}>
          <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
            <span className="blue-text">Track all markets on TradingView</span>
          </a>
        </div>
      </div>
    </Card>
  );
}

export default memo(StockChart);