'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function MethodologyPage() {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/methodology')
      .then((res) => res.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent('Failed to load methodology document.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00788C]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-[#005F6B] to-[#00788C]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🐝</span>
              <h1 className="text-xl font-bold text-white">The Buzz Model</h1>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-300 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* White Paper Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <article className="prose prose-invert prose-slate max-w-none
          prose-headings:text-white prose-headings:font-bold
          prose-h1:text-3xl prose-h1:border-b prose-h1:border-[#F9A01B]/30 prose-h1:pb-4 prose-h1:mb-6
          prose-h2:text-2xl prose-h2:text-[#00A3B4] prose-h2:mt-12 prose-h2:mb-4
          prose-h3:text-xl prose-h3:text-[#F9A01B]
          prose-p:text-slate-300 prose-p:leading-relaxed
          prose-strong:text-white prose-strong:font-semibold
          prose-code:text-[#F9A01B] prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-slate-800/80 prose-pre:border prose-pre:border-slate-700
          prose-table:border-collapse
          prose-th:bg-slate-800 prose-th:text-[#00A3B4] prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-slate-700
          prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-slate-700
          prose-hr:border-slate-700 prose-hr:my-8
          prose-ul:text-slate-300 prose-li:text-slate-300
          prose-a:text-[#00A3B4] prose-a:no-underline hover:prose-a:underline
        ">
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </article>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-800 text-center text-slate-500 text-sm">
          <p>Charlotte Hornets Spread Prediction Model</p>
          <p className="mt-1">Regime-based variance with Bayesian blending</p>
        </footer>
      </main>
    </div>
  );
}
