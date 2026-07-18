import { CheckResult } from "../types";

export async function checkSubdomains(domain: string): Promise<CheckResult> {
  try {
    const response = await fetch(`https://crt.sh/?q=%.${domain}&output=json`);

    if (!response.ok) {
      throw new Error("crt.sh query failed");
    }

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

    let status: "good" | "review" | "action" | "info" = "info";
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
