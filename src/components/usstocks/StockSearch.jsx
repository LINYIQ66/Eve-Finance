import React, { useState, useRef, useEffect } from "react";
import { Search, Plus, Check, X } from "lucide-react";
import { searchStocks } from "@/api/eveClient";
import { motion, AnimatePresence } from "framer-motion";

export default function StockSearch({ onAdd, addedSymbols = [] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.trim().length >= 1) {
        doSearch(query.trim());
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const doSearch = async (q) => {
    setLoading(true);
    try {
      const res = await searchStocks({ q });
      setResults(res?.data?.results || []);
      setShowResults(true);
    } catch (e) {
      setResults([]);
    }
    setLoading(false);
  };

  const handleAdd = (stock) => {
    onAdd(stock);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="搜索美股 (如 AAPL, Apple)..."
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {loading && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {showResults && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
          >
            {results.map((stock) => {
              const isAdded = addedSymbols.includes(stock.symbol);
              return (
                <div
                  key={stock.symbol}
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">{stock.symbol}</span>
                      {stock.exchange && (
                        <span className="text-[10px] text-slate-400 uppercase">{stock.exchange}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{stock.name}</p>
                  </div>
                  <button
                    onClick={() => !isAdded && handleAdd(stock)}
                    disabled={isAdded}
                    className={`ml-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                      isAdded
                        ? "bg-green-100 text-green-700 cursor-default"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3 h-3" /> 已添加
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" /> 添加
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {showResults && !loading && query.length >= 1 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl px-3 py-3 text-sm text-slate-500">
          未找到匹配的美股
        </div>
      )}
    </div>
  );
}