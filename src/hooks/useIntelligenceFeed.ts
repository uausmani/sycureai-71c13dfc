import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NewsLink } from "@/data/newsData";

const CACHE_KEY_PREFIX = "intelligence_feed_";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ai: ['LLM', 'GenAI', 'generative ai', 'prompt injection', 'jailbreak', 'vulnerability', 'exploit', 'adversarial', 'AI security', 'machine learning'],
  cybersecurity: ['CVE-', 'Vulnerability', 'Exploit', 'Zero-Day', 'Patch', 'ransomware', 'Security Advisory'],
  btc: ['Bitcoin', 'Ethereum', 'crypto', 'hack', 'exploit', 'drainer', 'DeFi', 'blockchain'],
  quantum: ['quantum', 'PQC', 'post-quantum', 'cryptography', 'NIST', 'encryption', 'lattice'],
  funding: ['$', 'million', 'billion', 'funding'],
};

function passesHardFilter(article: NewsLink, category: string): boolean {
  const keywords = CATEGORY_KEYWORDS[category] || [];
  if (category === 'funding') {
    const title = (article.title || '').toLowerCase();
    return keywords.some(kw => title.includes(kw.toLowerCase()));
  }
  const text = `${article.title || ''} ${article.sourceName || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw.toLowerCase()));
}

interface CachedData {
  articles: NewsLink[];
  fetchedAt: string;
}

interface UseIntelligenceFeedOptions {
  /** Index used to stagger background refresh start times (2s per index). */
  staggerIndex?: number;
  /** Callback fired whenever fresh data is fetched (not from cache). */
  onSynced?: (fetchedAt: string) => void;
}

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes
const STAGGER_MS = 2000;

export function useIntelligenceFeed(category: string, options: UseIntelligenceFeedOptions = {}) {
  const { staggerIndex = 0, onSynced } = options;
  const [links, setLinks] = useState<NewsLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const fetchData = useCallback(async (skipCache = false, background = false) => {
    const cacheKey = CACHE_KEY_PREFIX + category;

    if (!skipCache) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: CachedData = JSON.parse(cached);
          if (Date.now() - new Date(parsed.fetchedAt).getTime() < CACHE_DURATION) {
            setLinks(parsed.articles);
            setIsLive(true);
            setLastUpdated(parsed.fetchedAt);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }

    if (background) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
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
        const fetchedAt = data.fetchedAt || new Date().toISOString();
        setLinks(withVia);
        setIsLive(withVia.length > 0);
        setLastUpdated(fetchedAt);
        localStorage.setItem(cacheKey, JSON.stringify({
          articles: withVia,
          fetchedAt,
        }));
        onSyncedRef.current?.(fetchedAt);
      }
    } catch (err) {
      console.error(`Failed to fetch intelligence for ${category}:`, err);
      setIsLive(false);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [category]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Background auto-refresh every 30 minutes, staggered, only when tab is visible
  useEffect(() => {
    let intervalId: number | undefined;
    const startDelay = staggerIndex * STAGGER_MS;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return; // Skip refresh when tab is hidden to save API credits
      }
      fetchData(true, true);
    };

    const startTimeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, REFRESH_INTERVAL);
    }, REFRESH_INTERVAL + startDelay);

    return () => {
      window.clearTimeout(startTimeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [fetchData, staggerIndex]);

  const refresh = useCallback(() => fetchData(true, true), [fetchData]);

  return { links, loading, syncing, isLive, lastUpdated, refresh };
}
