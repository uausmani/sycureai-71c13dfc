import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NewsLink } from "@/data/newsData";

const CACHE_KEY_PREFIX = "intelligence_feed_";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: ['LLM', 'GenAI', 'generative ai', 'prompt injection', 'jailbreak', 'vulnerability', 'exploit', 'adversarial', 'AI security', 'machine learning'],
  cybersecurity: ['CVE-', 'Vulnerability', 'Exploit', 'Zero-Day', 'Patch', 'ransomware', 'Security Advisory'],
  btc: ['Bitcoin', 'Ethereum', 'crypto', 'hack', 'exploit', 'drainer', 'DeFi', 'blockchain'],
  quantum: ['quantum', 'PQC', 'post-quantum', 'cryptography', 'NIST', 'encryption', 'lattice'],
  funding: ['funding', 'raises', 'raised', 'series a', 'series b', 'series c', 'seed round', 'venture', 'investment', 'valuation', 'startup'],
};

function passesHardFilter(article: NewsLink, category: string): boolean {
  const text = `${article.title || ''} ${article.sourceName || ''}`.toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category] || [];
  return keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
}


interface CachedData {
  articles: NewsLink[];
  fetchedAt: string;
}

export function useIntelligenceFeed(category: string) {
  const [links, setLinks] = useState<NewsLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async (skipCache = false) => {
    const cacheKey = CACHE_KEY_PREFIX + category;

    if (!skipCache) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: CachedData = JSON.parse(cached);
          if (Date.now() - new Date(parsed.fetchedAt).getTime() < CACHE_DURATION) {
            setLinks(parsed.articles);
            setIsLive(true);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-intelligence", {
        body: { category },
      });

      if (error) throw error;

      if (data?.success && data.articles?.length > 0) {
        const filtered = data.articles.filter((a: any) => passesHardFilter(a, category));
        const withVia = filtered.map((a: any) => ({
          title: a.title,
          sourceName: a.sourceName,
          url: a.url,
          timestamp: a.timestamp,
          via: a.via || 'NewsAPI',
        }));
        setLinks(withVia);
        setIsLive(withVia.length > 0);
        localStorage.setItem(cacheKey, JSON.stringify({
          articles: withVia,
          fetchedAt: data.fetchedAt,
        }));
      }
    } catch (err) {
      console.error(`Failed to fetch intelligence for ${category}:`, err);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return { links, loading, isLive, refresh };
}
