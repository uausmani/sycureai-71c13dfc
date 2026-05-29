import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATEGORY_QUERIES: Record<string, string> = {
  ai: '("LLM" OR "GenAI") AND ("vulnerability" OR "exploit" OR "injection")',
  cybersecurity: '("CVE-2025" OR "CVE-2026" OR "zero-day" OR "ransomware")',
  btc: '("Bitcoin" OR "Ethereum") AND ("drainer" OR "hack" OR "exploit")',
  quantum: '("PQC" OR "Post-Quantum") AND ("security" OR "standard")',
  funding: '("Series A" OR "Series B" OR "Seed Round" OR "Venture Capital" OR "Acquisition" OR "Funding") AND ("Cybersecurity" OR "AI" OR "Quantum" OR "Blockchain" OR "Web3")',
};

// Categories that should also pull from Tree of Alpha
const TREE_CATEGORIES = ['btc', 'quantum', 'ai'];

const HIGH_PRIORITY_KEYWORDS = ['CVE-', 'Vulnerability', 'Exploit', 'Zero-Day', 'Patch', 'Security Advisory', 'LLM', 'GenAI', 'injection', 'jailbreak', 'quantum', 'PQC', 'ransomware', 'hack', 'drainer', 'crypto'];
const FUNDING_KEYWORDS = ['$', 'million', 'billion', 'funding'];
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function matchesKeywords(text: string, category: string): boolean {
  const lower = text.toLowerCase();
  if (category === 'funding') {
    return FUNDING_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  }
  return HIGH_PRIORITY_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isRecent(dateStr: string | number | undefined, category: string): boolean {
  if (!dateStr) return false;
  const ts = typeof dateStr === 'number' ? dateStr : new Date(dateStr).getTime();
  const window = category === 'funding' ? SEVEN_DAYS_MS : TWO_DAYS_MS;
  return Date.now() - ts < window;
}

function isValidTitle(title: string | undefined): boolean {
  const t = (title || '').trim();
  if (!t) return false;
  if (/^Home\s*-\s*/i.test(t)) return false;
  if (t === '[Removed]') return false;
  return true;
}

interface UnifiedArticle {
  title: string;
  sourceName: string;
  url: string;
  timestamp: string;
  via: 'NewsAPI' | 'Tree News';
}

async function fetchNewsAPI(query: string, apiKey: string): Promise<UnifiedArticle[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '20',
      apiKey,
    });

    const response = await fetch(`https://newsapi.org/v2/everything?${params}`);
    const data = await response.json();

    if (!response.ok) {
      console.error('NewsAPI error:', data);
      return [];
    }

    return (data.articles || [])
      .filter((a: any) =>
        isValidTitle(a.title) &&
        isRecent(a.publishedAt) &&
        matchesKeywords(`${a.title || ''} ${a.description || ''}`)
      )
      .slice(0, 5)
      .map((a: any) => ({
        title: a.title,
        sourceName: a.source?.name || 'Unknown',
        url: a.url,
        timestamp: a.publishedAt,
        via: 'NewsAPI' as const,
      }));
  } catch (err) {
    console.error('NewsAPI fetch failed:', err);
    return [];
  }
}

async function fetchTreeOfAlpha(category: string): Promise<UnifiedArticle[]> {
  try {
    const treeKey = Deno.env.get('TREE_OF_ALPHA_KEY');
    const headers: Record<string, string> = {};
    if (treeKey) {
      headers['Authorization'] = `Bearer ${treeKey}`;
    }

    const response = await fetch('https://news.treeofalpha.com/api/news?limit=50', { headers });
    if (!response.ok) {
      console.error('Tree of Alpha error:', response.status);
      return [];
    }

    const items: any[] = await response.json();

    // Category-specific keyword filters for Tree of Alpha
    const categoryKeywords: Record<string, string[]> = {
      btc: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'hack', 'exploit', 'drainer', 'defi', 'vulnerability'],
      quantum: ['quantum', 'pqc', 'post-quantum', 'cryptography', 'nist', 'encryption', 'lattice', 'qubit'],
      ai: ['llm', 'genai', 'generative ai', 'prompt injection', 'jailbreak', 'machine learning', 'ai', 'gpt', 'openai', 'anthropic', 'deepfake'],
    };

    const keywords = categoryKeywords[category] || [];

    return items
      .filter((item: any) => {
        const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
        const hasKeyword = keywords.some(kw => text.includes(kw));
        const recentEnough = item.time ? isRecent(item.time) : false;
        return hasKeyword && recentEnough && isValidTitle(item.title || item.body?.substring(0, 80));
      })
      .slice(0, 5)
      .map((item: any) => ({
        title: item.title || item.body?.substring(0, 100) || 'Untitled',
        sourceName: item.source || 'Tree News',
        url: item.link || item.url || `https://news.treeofalpha.com`,
        timestamp: item.time ? new Date(item.time).toISOString() : new Date().toISOString(),
        via: 'Tree News' as const,
      }));
  } catch (err) {
    console.error('Tree of Alpha fetch failed:', err);
    return [];
  }
}

function deduplicateAndSort(articles: UnifiedArticle[]): UnifiedArticle[] {
  // Deduplicate by normalized title
  const seen = new Set<string>();
  const unique = articles.filter(a => {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by timestamp descending
  unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return unique.slice(0, 6);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();
    const query = CATEGORY_QUERIES[category];

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid category' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('NEWSAPI_KEY');
    if (!apiKey) {
      throw new Error('NEWSAPI_KEY is not configured');
    }

    // Build fetch promises based on category
    const fetchers: Promise<UnifiedArticle[]>[] = [fetchNewsAPI(query, apiKey)];

    if (TREE_CATEGORIES.includes(category)) {
      fetchers.push(fetchTreeOfAlpha(category));
    }

    // Fetch all sources simultaneously
    const results = await Promise.all(fetchers);
    const merged = results.flat();
    const articles = deduplicateAndSort(merged);

    return new Response(JSON.stringify({
      success: true,
      articles,
      fetchedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fetch-intelligence error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
