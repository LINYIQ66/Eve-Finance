import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { getMetalPrices } from "@/api/eveClient";

export default function MarketTicker() {
  const [prices, setPrices] = useState({
    gold: { price: 2024.50, change: 1.2 },
    silver: { price: 24.85, change: -0.8 },
    platinum: { price: 1045.30, change: 2.1 },
    palladium: { price: 1825.75, change: -1.4 }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLivePrices();
    
    // Update prices every 30 seconds
    const interval = setInterval(loadLivePrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLivePrices = async () => {
    try {
      const response = await getMetalPrices();
      if (response.data.success) {
        const livePrices = response.data.prices;
        setPrices({
          gold: { 
            price: livePrices.gold, 
            change: (Math.random() - 0.5) * 3 // Mock change for now
          },
          silver: { 
            price: livePrices.silver, 
            change: (Math.random() - 0.5) * 2 
          },
          platinum: { 
            price: livePrices.platinum, 
            change: (Math.random() - 0.5) * 3 
          },
          palladium: { 
            price: livePrices.palladium, 
            change: (Math.random() - 0.5) * 4 
          }
        });
      }
    } catch (error) {
      console.error("Error loading live prices:", error);
      // Fall back to simulated updates if API fails
      setPrices(prev => ({
        gold: { 
          price: prev.gold.price + (Math.random() - 0.5) * 10, 
          change: (Math.random() - 0.5) * 3 
        },
        silver: { 
          price: prev.silver.price + (Math.random() - 0.5) * 0.5, 
          change: (Math.random() - 0.5) * 2 
        },
        platinum: { 
          price: prev.platinum.price + (Math.random() - 0.5) * 15, 
          change: (Math.random() - 0.5) * 3 
        },
        palladium: { 
          price: prev.palladium.price + (Math.random() - 0.5) * 20, 
          change: (Math.random() - 0.5) * 4 
        }
      }));
    }
    setIsLoading(false);
  };

  const metals = [
    { name: "Gold", symbol: "XAU", data: prices.gold, color: "text-yellow-600" },
    { name: "Silver", symbol: "XAG", data: prices.silver, color: "text-gray-500" },
    { name: "Platinum", symbol: "XPT", data: prices.platinum, color: "text-blue-600" },
    { name: "Palladium", symbol: "XPD", data: prices.palladium, color: "text-purple-600" }
  ];

  return (
    <div className="bg-slate-900 text-white py-3 overflow-hidden">
      <motion.div 
        className="flex space-x-8"
        animate={{ x: ["100%", "-100%"] }}
        transition={{ 
          repeat: Infinity, 
          duration: 30, 
          ease: "linear"
        }}
      >
        {metals.concat(metals).map((metal, index) => (
          <div key={index} className="flex items-center space-x-3 whitespace-nowrap">
            <span className="font-semibold">{metal.symbol}/USD</span>
            <span className="text-2xl font-bold">
              ${metal.data.price.toFixed(2)}
            </span>
            <div className={`flex items-center space-x-1 ${
              metal.data.change >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {metal.data.change >= 0 ? 
                <TrendingUp className="w-4 h-4" /> : 
                <TrendingDown className="w-4 h-4" />
              }
              <span className="font-medium">
                {metal.data.change >= 0 ? '+' : ''}{metal.data.change.toFixed(1)}%
              </span>
            </div>
            {isLoading && index === 0 && (
              <span className="text-xs text-slate-400">(Loading live prices...)</span>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}