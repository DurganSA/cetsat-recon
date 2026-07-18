import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } from "docx";
import { CheckResult } from "./types";
import { CAPABILITIES } from "./capabilities";

export async function generateReport(
  results: CheckResult[],
  input: {
    domain: string;
    companyName?: string;
    recipientName?: string;
    preparedBy?: string;
  }
): Promise<Buffer> {
  const actionResults = results.filter(r => r.status === "action");
  const reviewResults = results.filter(r => r.status === "review");
  const findings = [...actionResults, ...reviewResults].slice(0, 4);

  const capabilities = new Set<string>();
  findings.forEach(f => {
    if (f.capability) capabilities.add(f.capability);
  });

  const sections: Paragraph[] = [];

  sections.push(
    new Paragraph({
      text: "Security Review Report",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: input.domain,
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ text: "" })
  );

  if (input.recipientName) {
    sections.push(
      new Paragraph({
        text: `Prepared for: ${input.recipientName}`,
        alignment: AlignmentType.CENTER
      })
    );
  }

  if (input.preparedBy) {
    sections.push(
      new Paragraph({
        text: `Prepared by: ${input.preparedBy}`,
        alignment: AlignmentType.CENTER
      })
    );
  }

  sections.push(
    new Paragraph({ text: "" }),
    new Paragraph({
      text: `Report generated: ${new Date().toLocaleDateString()}`,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "" })
  );

  sections.push(
    new Paragraph({
      text: "1. Company Profile & Digital Footprint",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({
          text: "This report was prepared using only publicly available information. We have not accessed your systems or conducted any intrusive testing.",
          italics: true
        })
      ]
    }),
    new Paragraph({ text: "" })
  );

  // Companies House data
  const companyInfo = results.find(r => r.id === "companies_house");
  if (companyInfo && companyInfo.data.companyName) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Company Information", bold: true })]
      }),
      new Paragraph({
        text: `Company: ${companyInfo.data.companyName}`
      }),
      new Paragraph({
        text: `Status: ${companyInfo.data.status}`
      }),
      new Paragraph({
        text: `Incorporated: ${companyInfo.data.dateOfCreation}`
      })
    );

    if (companyInfo.data.companyNumber) {
      sections.push(
        new Paragraph({
          text: `Companies House Number: ${companyInfo.data.companyNumber}`
        })
      );
    }

    if (companyInfo.data.sicCodes && companyInfo.data.sicCodes.length > 0) {
      sections.push(
        new Paragraph({
          text: `Industry: ${companyInfo.data.sicCodes.join(", ")}`
        })
      );
    }

    if (companyInfo.data.directors && companyInfo.data.directors.length > 0) {
      sections.push(
        new Paragraph({
          text: `Directors: ${companyInfo.data.directors.join(", ")}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  // Domain age
  const whoisInfo = results.find(r => r.id === "whois");
  if (whoisInfo && whoisInfo.data.domainAge) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Domain Information", bold: true })]
      }),
      new Paragraph({
        text: `Domain age: ${whoisInfo.data.domainAge}`
      })
    );
    if (whoisInfo.data.registrar) {
      sections.push(
        new Paragraph({
          text: `Registrar: ${whoisInfo.data.registrar}`
        })
      );
    }
    sections.push(new Paragraph({ text: "" }));
  }

  // Technology stack
  const fingerprintInfo = results.find(r => r.id === "fingerprint");
  if (fingerprintInfo && fingerprintInfo.data.detected) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Technology Stack", bold: true })]
      })
    );
    
    if (fingerprintInfo.data.cms) {
      sections.push(
        new Paragraph({
          text: `CMS: ${fingerprintInfo.data.cms}`
        })
      );
    }
    
    if (fingerprintInfo.data.server) {
      sections.push(
        new Paragraph({
          text: `Web server: ${fingerprintInfo.data.server}`
        })
      );
    }

    if (fingerprintInfo.data.frameworks && fingerprintInfo.data.frameworks.length > 0) {
      sections.push(
        new Paragraph({
          text: `Frameworks: ${fingerprintInfo.data.frameworks.join(", ")}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  // Email infrastructure
  const emailInfo = results.find(r => r.id === "email");
  if (emailInfo) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Email Infrastructure", bold: true })]
      })
    );
    
    if (emailInfo.data.provider) {
      sections.push(
        new Paragraph({
          text: `Email provider: ${emailInfo.data.provider}`
        })
      );
    }

    if (emailInfo.data.mxRecords && emailInfo.data.mxRecords.length > 0) {
      sections.push(
        new Paragraph({
          text: `Mail servers: ${emailInfo.data.mxRecords.slice(0, 3).join(", ")}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  // DNS/Hosting
  const dnsInfo = results.find(r => r.id === "dns");
  if (dnsInfo && dnsInfo.data.aRecords && dnsInfo.data.aRecords.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Hosting Infrastructure", bold: true })]
      }),
      new Paragraph({
        text: `IP addresses: ${dnsInfo.data.aRecords.slice(0, 3).join(", ")}`
      })
    );

    if (dnsInfo.data.nsRecords && dnsInfo.data.nsRecords.length > 0) {
      sections.push(
        new Paragraph({
          text: `DNS provider: ${dnsInfo.data.nsRecords.slice(0, 2).join(", ")}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  // Digital footprint
  const subdomainInfo = results.find(r => r.id === "subdomains");
  if (subdomainInfo && subdomainInfo.data.count) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Digital Footprint", bold: true })]
      }),
      new Paragraph({
        text: `Discovered subdomains: ${subdomainInfo.data.count}`
      })
    );

    if (subdomainInfo.data.sensitive && subdomainInfo.data.sensitive.length > 0) {
      sections.push(
        new Paragraph({
          text: `Sensitive subdomains: ${subdomainInfo.data.sensitive.join(", ")}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  // Internet exposure
  const exposureInfo = results.find(r => r.id === "exposure");
  if (exposureInfo && exposureInfo.data.ports && exposureInfo.data.ports.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Internet Exposure", bold: true })]
      }),
      new Paragraph({
        text: `Open ports detected: ${exposureInfo.data.ports.join(", ")}`
      })
    );

    if (exposureInfo.data.vulns && exposureInfo.data.vulns.length > 0) {
      sections.push(
        new Paragraph({
          text: `Known CVEs: ${exposureInfo.data.vulns.length}`
        })
      );
    }

    sections.push(new Paragraph({ text: "" }));
  }

  sections.push(
    new Paragraph({
      text: "2. Security Findings",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" })
  );

  if (findings.length === 0) {
    sections.push(
      new Paragraph({
        text: "No significant security findings were identified during this review. Your public security posture appears solid."
      }),
      new Paragraph({ text: "" })
    );
  } else {
    findings.forEach((finding, index) => {
      const whyItMatters = getWhyItMatters(finding);
      const howToFix = getHowToFix(finding);
      
      sections.push(
        new Paragraph({
          text: `Finding ${index + 1}: ${finding.label}`,
          heading: HeadingLevel.HEADING_3
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [new TextRun({ text: "What we saw:", bold: true })]
        }),
        new Paragraph({
          text: finding.summary
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [new TextRun({ text: "Why it matters:", bold: true })]
        }),
        new Paragraph({
          text: whyItMatters
        }),
        new Paragraph({ text: "" })
      );
      
      if (howToFix) {
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "How to fix:", bold: true })]
          }),
          new Paragraph({
            text: howToFix
          }),
          new Paragraph({ text: "" })
        );
      }
    });
  }

  sections.push(
    new Paragraph({
      text: "3. Risk Assessment",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Good security hygiene for a business of your size and sector means: DMARC at enforcement (p=reject), security headers in place, no known vulnerabilities exposed to the internet, and systems kept current. These are baseline measures that provide protection against the most common attacks."
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "Industry context:", bold: true })]
    }),
    new Paragraph({
      text: "• The average cost of a data breach for UK SMEs is £4,200 (UK Government Cyber Security Breaches Survey 2023)."
    }),
    new Paragraph({
      text: "• Many public sector and enterprise tenders now require Cyber Essentials certification as a minimum."
    }),
    new Paragraph({
      text: "• 32% of businesses reported cyber security breaches or attacks in the past 12 months."
    }),
    new Paragraph({ text: "" })
  );

  sections.push(
    new Paragraph({
      text: "4. Executive Summary",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: `We found ${actionResults.length} item(s) requiring action and ${reviewResults.length} item(s) worth reviewing. This is an outside view only. A proper assessment would require access to your systems and your team's input.`
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "At-a-glance summary:", bold: true })]
    }),
    new Paragraph({ text: "" })
  );

  const trafficLight = getTrafficLightSummary(results);
  sections.push(
    new Paragraph({ text: `🔴 Action required: ${trafficLight.action}` }),
    new Paragraph({ text: `🟡 Review recommended: ${trafficLight.review}` }),
    new Paragraph({ text: `🟢 Good: ${trafficLight.good}` }),
    new Paragraph({ text: "" })
  );

  sections.push(
    new Paragraph({
      text: "5. Recommended Actions",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Based on the findings in this report, we recommend prioritizing the following actions:"
    }),
    new Paragraph({ text: "" })
  );

  // Add top 3 priority actions
  const priorityFindings = [...actionResults.slice(0, 3)];
  if (priorityFindings.length > 0) {
    sections.push(
      new Paragraph({
        children: [new TextRun({ text: "Priority Actions:", bold: true })]
      })
    );

    priorityFindings.forEach((finding, index) => {
      sections.push(
        new Paragraph({
          text: `${index + 1}. ${finding.label}: ${getQuickFix(finding)}`
        })
      );
    });

    sections.push(new Paragraph({ text: "" }));
  }

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "Next Steps:", bold: true })]
    }),
    new Paragraph({
      text: "• Review the detailed findings in section 2 and their remediation steps"
    }),
    new Paragraph({
      text: "• Assign ownership of each action item to appropriate team members"
    }),
    new Paragraph({
      text: "• Consider engaging a security professional for items requiring specialized expertise"
    }),
    new Paragraph({
      text: "• Re-scan after implementing fixes to verify improvements"
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "About This Report:", bold: true })]
    }),
    new Paragraph({
      text: "This assessment is based on publicly available information only. A comprehensive security audit would require internal access to systems, configurations, and policies. The findings in this report represent external visibility and may not reflect your complete security posture."
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sections
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

function getQuickFix(finding: CheckResult): string {
  switch (finding.id) {
    case "email":
      return "Add DMARC record with p=reject policy to DNS";
    case "headers":
      return "Configure security headers on web server";
    case "tls":
      return "Update TLS configuration to support TLS 1.3 and strong cipher suites";
    case "lookalike":
      return "Register common typosquatting variants and monitor for phishing";
    case "exposure":
      return "Patch vulnerable services and close unnecessary ports";
    case "fingerprint":
      return "Update CMS and plugins to latest versions";
    case "email-extras":
      return "Implement MTA-STS and TLS-RPT policies";
    case "blocklist":
      return "Request delisting and investigate source of spam complaints";
    case "web-hygiene":
      return "Enforce HTTPS redirects and implement cookie consent";
    case "safebrowsing":
      return "Contact Google to review and remove malware/phishing flags";
    case "subdomains":
      return "Secure or decommission sensitive subdomains (dev/staging/admin)";
    case "dns":
      return "Enable DNSSEC for domain authentication";
    case "pagespeed":
      return "Optimize images, leverage browser caching, and minify resources";
    default:
      return "Review finding and implement recommended fixes";
  }
}

function getWhyItMatters(finding: CheckResult): string {
  switch (finding.id) {
    case "email":
      return "Without proper email authentication, criminals can impersonate your domain in phishing emails to your customers. DMARC tells receiving mail servers to reject these fakes. Fix: Add a DMARC record with policy p=reject to your DNS.";
    
    case "headers": {
      const grade = finding.data.grade;
      return `Your security headers score is ${grade}. Missing headers leave visitors vulnerable to XSS attacks, clickjacking, and MIME-type attacks. Fix: Add Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Strict-Transport-Security headers to your web server config.`;
    }
    
    case "tls": {
      const grade = finding.data.grade;
      return `Your TLS configuration scores ${grade}. A weak configuration means attackers could intercept traffic between your site and customers, reading passwords and payment details. Fix: Update to TLS 1.3, disable old cipher suites, and ensure your certificate is up to date.`;
    }
    
    case "lookalike": {
      const count = finding.data.found?.length || 0;
      const domains = finding.data.found?.slice(0, 3).map((d: any) => d.domain).join(", ") || "";
      return `${count} lookalike domains are registered and could be used in phishing campaigns against your customers: ${domains}${count > 3 ? "..." : ""}. Action: Register common typosquats yourself, monitor for phishing activity, and consider trademark protection.`;
    }
    
    case "exposure": {
      const vulns = finding.data.vulns?.length || 0;
      const ports = finding.data.ports?.length || 0;
      if (vulns > 0) {
        return `${vulns} known CVE(s) detected on ${ports} exposed port(s). These are actively scanned and exploited by automated tools. Fix: Patch vulnerable services immediately, close unnecessary ports, and place services behind a firewall or VPN.`;
      }
      return `${ports} ports are exposed to the internet. Review whether all these services need public access, and close or firewall anything that doesn't.`;
    }
    
    case "subdomains": {
      const sensitive = finding.data.sensitive || [];
      return `Development and staging subdomains are visible in certificate logs: ${sensitive.join(", ")}. These often have weaker security than production and become entry points. Fix: Use internal DNS for dev/staging, or ensure they have the same security posture as production.`;
    }
    
    case "fingerprint": {
      const version = finding.data.version;
      const latestVersion = finding.data.latestVersion;
      const cmsType = finding.data.cmsType;
      
      if (cmsType === "WordPress" && version && latestVersion) {
        if (finding.data.isOutdated) {
          return `Your WordPress is running version ${version}. The latest secure version is ${latestVersion}. Outdated WordPress installations have known vulnerabilities that are actively exploited. Fix: Update immediately via your WordPress admin dashboard (Dashboard → Updates). Always keep WordPress, themes, and plugins current.`;
        } else if (version !== latestVersion) {
          return `Your WordPress is running version ${version}. The latest version is ${latestVersion}. An update is available with security patches and improvements. Fix: Update via Dashboard → Updates.`;
        } else {
          return `Your WordPress is on the latest version (${version}). Keep it that way, and remember to update themes and plugins regularly too.`;
        }
      }
      
      return "Outdated software has known vulnerabilities that attackers exploit. Keeping your stack current is the first line of defense. Fix: Enable automatic updates where possible, and schedule monthly maintenance windows for manual updates.";
    }
    
    case "blocklist": {
      const listings = finding.data.listings || [];
      const uniqueLists = [...new Set(listings.map((l: any) => l.list))];
      const affectedIPs = [...new Set(listings.map((l: any) => l.ip))];
      return `Your mail server IP(s) ${affectedIPs.join(", ")} are listed on ${uniqueLists.length} blocklist(s): ${uniqueLists.join(", ")}. Your legitimate email to customers is likely landing in spam. Fix: Request delisting at each blocklist's website, investigate why you were listed (compromised accounts? open relay?), fix the root cause, then improve your email authentication (SPF, DKIM, DMARC).`;
    }
    
    case "email_extras": {
      const issues = [];
      if (!finding.data.mtaSts) issues.push("MTA-STS (encrypts email in transit)");
      if (!finding.data.tlsRpt) issues.push("TLS-RPT (reports delivery issues)");
      if (!finding.data.bimi) issues.push("BIMI (shows your logo in inboxes)");
      if (finding.data.spfLookups > 10) issues.push(`SPF has ${finding.data.spfLookups} DNS lookups (max 10 - record is broken)`);
      
      return `Missing email hygiene features: ${issues.join("; ")}. These improve deliverability and trust. Fix: Add MTA-STS policy file to your website, add TLS-RPT and BIMI DNS records, and optimize your SPF record if it exceeds 10 lookups.`;
    }
    
    case "web_hygiene": {
      const issues = [];
      if (!finding.data.httpsEnforcement) issues.push("HTTP doesn't redirect to HTTPS (traffic unencrypted)");
      if (finding.data.cookiesBeforeConsent) issues.push("Non-essential cookies set before consent (PECR/GDPR violation)");
      
      return `Web hygiene issues: ${issues.join("; ")}. Fix: Configure your web server to redirect all HTTP traffic to HTTPS with a 301 redirect. Review your cookie banner to ensure no tracking cookies fire until consent is given.`;
    }
    
    case "safebrowsing": {
      const matches = finding.data.matches || [];
      if (matches.length > 0) {
        const threats = matches.map((m: any) => m.threatType).join(", ");
        return `Google Safe Browsing has flagged your site for: ${threats}. Browsers warn users away from your site, destroying traffic and trust. Fix: Identify and remove malicious content, clean any compromised files, update all software, then request a review at https://search.google.com/search-console.`;
      }
      return "Your site is clean on Google Safe Browsing. Maintain this by keeping software updated and monitoring for compromises.";
    }
    
    default:
      return "This finding indicates a potential security or compliance gap worth addressing.";
  }
}

function getHowToFix(finding: CheckResult): string | null {
  switch (finding.id) {
    case "email":
      if (!finding.data.dmarcRecord || finding.data.dmarcRecord.includes("p=none")) {
        return "Add this DNS TXT record to _dmarc.yourdomain.com: v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com. This tells mail servers to reject emails that fail authentication. Start with p=quarantine for a week to test, then move to p=reject.";
      }
      return "Review your SPF and DKIM records. Ensure SPF includes all legitimate sending IPs and DKIM is properly signed by your mail server.";
    
    case "fingerprint":
      if (finding.data.cmsType === "WordPress" && finding.data.version && finding.data.latestVersion) {
        return `Log into WordPress admin → Dashboard → Updates. Click 'Update Now' to go from ${finding.data.version} to ${finding.data.latestVersion}. Backup your site first. After updating WordPress, also update all themes and plugins.`;
      }
      return "Update your CMS to the latest version. Check your CMS admin panel for available updates, or contact your web developer.";
    
    case "headers":
      return "Add these headers to your web server config (Apache .htaccess, nginx.conf, or IIS web.config): Strict-Transport-Security: max-age=31536000; Content-Security-Policy: default-src 'self'; X-Frame-Options: SAMEORIGIN; X-Content-Type-Options: nosniff; Referrer-Policy: strict-origin-when-cross-origin. Test at securityheaders.com.";
    
    case "lookalike": {
      const domains = finding.data.found?.slice(0, 5).map((d: any) => d.domain).join(", ") || "";
      return `Register these lookalike domains yourself to prevent abuse: ${domains}. Use domain monitoring services like DomainTools or MarkMonitor to alert you to new registrations. If domains are being used maliciously, report them to the registrar and consider legal action.`;
    }
    
    case "blocklist": {
      const listings = finding.data.listings || [];
      if (listings.length > 0) {
        const list = listings[0].list;
        const delistUrls: Record<string, string> = {
          "zen.spamhaus.org": "https://www.spamhaus.org/lookup/",
          "bl.spamcop.net": "https://www.spamcop.net/bl.shtml",
          "dnsbl.sorbs.net": "https://www.sorbs.net/delisting/"
        };
        const url = delistUrls[list] || "the blocklist's website";
        return `1) Request delisting at ${url}. 2) Check for compromised email accounts or an open mail relay. 3) Review your SPF, DKIM, and DMARC records. 4) Scan for malware. 5) Monitor your mail server logs for unusual sending patterns. 6) Consider using a reputable email service provider like Microsoft 365 or Google Workspace.`;
      }
      return null;
    }
    
    case "exposure":
      if (finding.data.vulns && finding.data.vulns.length > 0) {
        return `These CVEs were detected: ${finding.data.vulns.join(", ")}. Search each CVE at nvd.nist.gov for patch information. Update the affected software immediately. If patching isn't possible, close the ports or put services behind a VPN.`;
      }
      return "Review each open port and close those that don't need public access. Use a firewall to restrict access to administrative ports (SSH, RDP, database) to known IPs only.";
    
    case "email_extras":
      return "1) MTA-STS: Create a policy file at https://mta-sts.yourdomain.com/.well-known/mta-sts.txt with mode: enforce. 2) TLS-RPT: Add DNS TXT record at _smtp._tls.yourdomain.com: v=TLSRPTv1; rua=mailto:tls-reports@yourdomain.com. 3) BIMI: Add DNS TXT record at default._bimi.yourdomain.com with your logo URL and VMC. 4) Optimize SPF by using ip4: ranges instead of multiple include: statements.";
    
    case "web_hygiene":
      if (!finding.data.httpsEnforcement) {
        return "Configure your web server to redirect HTTP to HTTPS. Apache: Add 'Redirect permanent / https://yourdomain.com/' to .htaccess. nginx: Add 'return 301 https://$host$request_uri;' to your HTTP server block. Also review your cookie consent mechanism to ensure no tracking cookies fire until the user accepts.";
      }
      return null;
    
    case "subdomains": {
      const sensitive = finding.data.sensitive || [];
      if (sensitive.length > 0) {
        return `Review these subdomains: ${sensitive.join(", ")}. If they're development/staging, move them to internal DNS (*.internal.yourdomain.com) or protect them with HTTP basic auth. If they must be public, ensure they have the same security measures as production.`;
      }
      return null;
    }
    
    default:
      return null;
  }
}

function getTrafficLightSummary(results: CheckResult[]): { action: number; review: number; good: number } {
  return {
    action: results.filter(r => r.status === "action").length,
    review: results.filter(r => r.status === "review").length,
    good: results.filter(r => r.status === "good").length
  };
}
