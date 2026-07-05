import React, { useEffect, useRef, memo } from "react";
import { Card } from "@/components/ui/card";

// TradingView symbol mapping for popular HK stocks
const HK_TV_MAP = {
  "00700": "HKEX:0700",
  "09988": "HKEX:9988",
  "03690": "HKEX:3690",
  "00388": "HKEX:0388",
  "02318": "HKEX:2318",
  "00939": "HKEX:0939",
  "01299": "HKEX:1299",
  "00005": "HKEX:0005",
  "01398": "HKEX:1398",
  "03988": "HKEX:3988",
  "00386": "HKEX:0386",
  "02388": "HKEX:2388",
  "06862": "HKEX:6862",
  "01038": "HKEX:1038",
  "00011": "HKEX:0011",
  "00002": "HKEX:0002",
  "00012": "HKEX:0012",
  "00016": "HKEX:0016",
  "00017": "HKEX:0017",
  "00027": "HKEX:0027",
  "00001": "HKEX:0001",
  "00941": "HKEX:0941",
  "00960": "HKEX:0960",
  "00992": "HKEX:0992",
  "01088": "HKEX:1088",
  "01109": "HKEX:1109",
  "01211": "HKEX:1211",
  "01336": "HKEX:1336",
  "01398": "HKEX:1398",
  "01876": "HKEX:1876",
  "01928": "HKEX:1928",
  "02018": "HKEX:2018",
  "02020": "HKEX:2020",
  "02331": "HKEX:2331",
  "02382": "HKEX:2382",
  "02601": "HKEX:2601",
  "02628": "HKEX:2628",
  "02899": "HKEX:2899",
  "03606": "HKEX:3606",
  "03633": "HKEX:3633",
  "03690": "HKEX:3690",
  "03836": "HKEX:3836",
  "03888": "HKEX:3888",
  "03968": "HKEX:3968",
  "06030": "HKEX:6030",
  "06098": "HKEX:6098",
  "06618": "HKEX:6618",
  "06690": "HKEX:6690",
  "06808": "HKEX:6808",
  "06823": "HKEX:6823",
  "06862": "HKEX:6862",
  "06888": "HKEX:6888",
  "06969": "HKEX:6969",
  "06988": "HKEX:6988",
  "09618": "HKEX:9618",
  "09626": "HKEX:9626",
  "09633": "HKEX:9633",
  "09818": "HKEX:9818",
  "09868": "HKEX:9868",
  "09888": "HKEX:9888",
  "09911": "HKEX:9911",
  "09999": "HKEX:9999",
};

function HKStockChart({ symbol = "00700" }) {
  const container = useRef();

  useEffect(() => {
    // Convert 5-digit code to TradingView format (strip leading zeros to 4 digits)
    const tvSymbol = HK_TV_MAP[symbol] || `HKEX:${parseInt(symbol)}`;

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
      timezone: "Asia/Hong_Kong",
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

export default memo(HKStockChart);
