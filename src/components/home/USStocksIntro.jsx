import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Database, Languages, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useLanguage } from '@/components/common/LanguageProvider';

const features = [
  {
    key: 'ai',
    icon: Brain,
    color: 'from-violet-500 to-purple-600',
    title_key: 'us_stocks_ai_title',
    desc_key: 'us_stocks_ai_desc',
  },
  {
    key: 'memory',
    icon: Database,
    color: 'from-cyan-500 to-blue-600',
    title_key: 'us_stocks_memory_title',
    desc_key: 'us_stocks_memory_desc',
  },
  {
    key: 'i18n',
    icon: Languages,
    color: 'from-emerald-500 to-teal-600',
    title_key: 'us_stocks_i18n_title',
    desc_key: 'us_stocks_i18n_desc',
  },
  {
    key: 'diff',
    icon: Sparkles,
    color: 'from-orange-500 to-red-600',
    title_key: 'us_stocks_diff_title',
    desc_key: 'us_stocks_diff_desc',
  },
];

export default function USStocksIntro() {
  const { t } = useLanguage();

  return (
    <div className="py-20 sm:py-28 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />

      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="bg-gradient-to-r from-blue-500/30 to-indigo-500/30 text-blue-200 border border-blue-400/30 px-4 py-2 text-sm font-semibold mb-4 backdrop-blur-sm">
              {t('home.us_stocks_badge')}
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent">
              {t('home.us_stocks_title')}
            </h2>
            <p className="text-xl text-blue-200/80 leading-relaxed">
              {t('home.us_stocks_subtitle')}
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.03 }}
              className="group"
            >
              <Card className="h-full border border-white/10 bg-white/5 backdrop-blur-md shadow-xl hover:shadow-2xl transition-all duration-500 rounded-2xl">
                <CardContent className="p-8">
                  <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {t(`home.${feature.title_key}`)}
                  </h3>
                  <p className="text-blue-200/70 leading-relaxed text-sm">
                    {t(`home.${feature.desc_key}`)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 text-center"
        >
          <Link
            to="/USStocks"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 group"
          >
            {t('home.us_stocks_cta')}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}