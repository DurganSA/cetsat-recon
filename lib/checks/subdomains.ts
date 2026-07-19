import { CheckResult } from "../types";

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 8000;

// crt.sh is known to be slow/flaky (occasional timeouts, transient 5xx, no response at
// all) - seen in production on real scans. Retry a couple of times with a short delay
// before giving up, and always bound each attempt with a timeout so a hung request can
// never stall the whole scan.
async function fetchCrtSh(domain: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`https://crt.sh/?q=%.${domain}&output=json`, {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.ok) return response;
      lastError = new Error(`crt.sh returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < RETRY_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("crt.sh query failed");
}

export async function checkSubdomains(domain: string): Promise<CheckResult> {
  try {
    const response = await fetchCrtSh(domain);
    const data = await response.json();

    const subdomains = new Set<string>();
    data.forEach((cert: any) => {
      const names = cert.name_value.split("\n");
      names.forEach((name: string) => {
        const cleaned = name.trim().toLowerCase();
        if (cleaned.endsWith(`.${domain}`) && cleaned !== domain) {
          subdomains.add(cleaned);
        }
      });
    });

    const subdomainList = Array.from(subdomains).sort();
    
    // Common infrastructure keywords
    const infrastructureKeywords = [
      'dev', 'staging', 'test', 'admin', 'internal', 'www', 'mail', 'webmail',
      'smtp', 'pop', 'imap', 'ftp', 'ns', 'dns', 'mx', 'autodiscover', 'owa',
      'cpanel', 'whm', 'api', 'cdn', 'static', 'assets', 'images', 'img',
      'vpn', 'remote', 'portal', 'app', 'mobile', 'secure', 'ssl', 'tls',
      'blog', 'shop', 'store', 'forum', 'support', 'help', 'docs', 'wiki',
      'demo', 'sandbox', 'uat', 'qa', 'prod', 'production', 'preprod',
      'beta', 'alpha', 'cloud', 'dashboard', 'panel', 'console', 'manage',
      'login', 'auth', 'sso', 'oauth', 'status', 'monitor', 'metrics',
      'log', 'logs', 'analytics', 'stats', 'tracking', 'crm', 'erp',
      'db', 'database', 'backup', 'archive', 'repo', 'git', 'svn',
      'jenkins', 'ci', 'cd', 'build', 'deploy', 'docker', 'k8s',
      'email', 'smtp', 'pop3', 'imap', 'exchange', 'office', 'mail',
      'proxy', 'gateway', 'firewall', 'edge', 'router', 'switch',
      'web', 'server', 'host', 'node', 'worker', 'queue', 'cache',
      'redis', 'memcache', 'elastic', 'solr', 'search', 'index',
      'upload', 'download', 'file', 'files', 'media', 'video', 'audio',
      'chat', 'messenger', 'message', 'notification', 'alert',
      'payment', 'checkout', 'cart', 'order', 'invoice', 'billing',
      'connect', 'link', 'share', 'social', 'feed', 'news', 'press',
      'contact', 'about', 'career', 'job', 'recruit', 'hr', 'training',
      'event', 'calendar', 'booking', 'schedule', 'appointment',
      'report', 'export', 'import', 'sync', 'webhook', 'callback',
      'content', 'cms', 'page', 'site', 'landing', 'campaign', 'promo',
      'partner', 'affiliate', 'reseller', 'vendor', 'supplier',
      'unifi', 'ubiquiti', 'mikrotik', 'cisco', 'fortinet'
    ];

    const sensitiveSubdomains = subdomainList.filter(s =>
      s.includes("dev") ||
      s.includes("staging") ||
      s.includes("test") ||
      s.includes("admin") ||
      s.includes("internal")
    );

    // Detect likely third-party/client subdomains
    const likelyThirdParty = subdomainList.filter(subdomain => {
      // Extract the label (first part before any dots)
      const label = subdomain.split('.')[0];
      
      // Skip wildcards
      if (label === '*') return false;
      
      // Skip if it matches any infrastructure keyword
      const isInfrastructure = infrastructureKeywords.some(keyword => 
        label === keyword || label.includes(keyword) || keyword.includes(label)
      );
      
      if (isInfrastructure) return false;
      
      // If it's not infrastructure and not obviously generic, it's likely a client/project name
      // Skip very short labels (likely abbreviations or codes)
      if (label.length < 4) return false;
      
      // Skip labels that are just numbers
      if (/^\d+$/.test(label)) return false;
      
      return true;
    });

    const thirdPartyExposure = likelyThirdParty.length > 0;

    // "good" (not "info") for a clean successful scan - "info" is reserved for the
    // catch block below where the lookup itself failed and we have nothing to judge.
    // Comparison scoring excludes "info" entirely, so a clean result needs "good" to be
    // able to win a competitor comparison against a domain with sensitive subdomains.
    let status: "good" | "review" | "action" | "info" = "good";
    let capability: string | undefined;

    if (sensitiveSubdomains.length > 0) {
      status = "review";
      capability = "managed_security";
    }

    return {
      id: "subdomains",
      label: "Subdomains",
      status,
      data: {
        count: subdomainList.length,
        subdomains: subdomainList,
        sensitive: sensitiveSubdomains,
        likelyThirdParty,
        thirdPartyExposure
      },
      summary: `Found ${subdomainList.length} subdomain(s) in certificate logs${sensitiveSubdomains.length > 0 ? `, including ${sensitiveSubdomains.length} potentially sensitive` : ""}${thirdPartyExposure ? ` and ${likelyThirdParty.length} likely client/project subdomain(s)` : ""}.`,
      capability
    };
  } catch (error) {
    return {
      id: "subdomains",
      label: "Subdomains",
      status: "info",
      data: { error: error instanceof Error ? error.message : String(error) },
      summary: "Could not retrieve subdomain information."
    };
  }
}
