import React from 'react';
import Hero from '../components/home/Hero';
import USStocksIntro from '../components/home/USStocksIntro';
import MetalsShowcase from '../components/home/MetalsShowcase';
import FeatureHighlights from '../components/home/FeatureHighlights';
import EveTokenSection from '../components/home/EveTokenSection';

export default function Home() {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50">
      <Hero />
      <USStocksIntro />
      <MetalsShowcase />
      <FeatureHighlights />
      <EveTokenSection />
    </div>
  );
}