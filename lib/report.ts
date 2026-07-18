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
          text: `Mail servers: ${emailInfo.data.mxRecords.slice(0, 3).map((mx: any) => `${mx.exchange.replace(/\.$/, "")} (${mx.priority})`).join(", ")}`
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
      sections.push(
        new Paragraph({
          text: `Finding ${index + 1}: ${finding.label}`,
          heading: HeadingLevel.HEADING_3
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          text: finding.summary
        }),
        new Paragraph({ text: "" })
      );
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

function getTrafficLightSummary(results: CheckResult[]): { action: number; review: number; good: number } {
  return {
    action: results.filter(r => r.status === "action").length,
    review: results.filter(r => r.status === "review").length,
    good: results.filter(r => r.status === "good").length
  };
}
