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
      text: "1. Your business, as we see it",
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

  const companyInfo = results.find(r => r.id === "companies_house");
  if (companyInfo && companyInfo.data.companyName) {
    sections.push(
      new Paragraph({
        text: `Company: ${companyInfo.data.companyName}`
      }),
      new Paragraph({
        text: `Status: ${companyInfo.data.status}`
      }),
      new Paragraph({
        text: `Incorporated: ${companyInfo.data.dateOfCreation}`
      }),
      new Paragraph({ text: "" })
    );
  }

  const emailInfo = results.find(r => r.id === "email");
  if (emailInfo && emailInfo.data.provider) {
    sections.push(
      new Paragraph({
        text: `Email provider: ${emailInfo.data.provider}`
      }),
      new Paragraph({ text: "" })
    );
  }

  sections.push(
    new Paragraph({
      text: "2. What the outside world can see",
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
          text: getWhyItMatters(finding)
        }),
        new Paragraph({ text: "" })
      );
    });
  }

  sections.push(
    new Paragraph({
      text: "3. What good looks like",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "For a business of your size and sector, good security hygiene means: DMARC at enforcement (p=reject), security headers in place, no known vulnerabilities exposed to the internet, and systems kept current. These are the baseline measures that keep you out of the low-hanging fruit category."
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "Two numbers worth knowing:", bold: true })]
    }),
    new Paragraph({
      text: "• The average cost of a data breach for UK SMEs is £4,200 (UK Government Cyber Security Breaches Survey 2023)."
    }),
    new Paragraph({
      text: "• Many public sector and enterprise tenders now require Cyber Essentials certification as a minimum."
    }),
    new Paragraph({ text: "" })
  );

  if (capabilities.size > 0) {
    sections.push(
      new Paragraph({
        text: "4. Where we could help",
        heading: HeadingLevel.HEADING_2
      }),
      new Paragraph({ text: "" })
    );

    Array.from(capabilities).forEach(capKey => {
      const cap = CAPABILITIES[capKey];
      if (cap) {
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: cap.name, bold: true })]
          }),
          new Paragraph({
            text: cap.pitch
          }),
          new Paragraph({ text: "" })
        );
      }
    });
  }

  sections.push(
    new Paragraph({
      text: "5. Where this leaves you",
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
      text: "6. About Cetsat, and the next step",
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Cetsat provides managed security and IT services to UK businesses. We focus on practical, proportionate measures that fit your risk profile and budget."
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "Next step:", bold: true })]
    }),
    new Paragraph({
      text: "A 30-minute call to walk through these findings and answer your questions. No obligation, no sales pitch until you ask for one."
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [new TextRun({ text: "If you do one thing:", bold: true })]
    }),
    new Paragraph({
      text: "Fix your DMARC record. It's free, it takes 10 minutes, and it stops criminals impersonating you in email to your customers."
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

function getWhyItMatters(finding: CheckResult): string {
  const templates: Record<string, string> = {
    email: "Without proper email authentication, criminals can impersonate your domain in phishing emails to your customers. DMARC tells receiving mail servers to reject these fakes.",
    headers: "Security headers are instructions your website sends to browsers, telling them how to handle your content safely. Missing headers leave users vulnerable to attacks.",
    tls: "A weak TLS configuration means an attacker could intercept traffic between your site and your customers, reading passwords and payment details.",
    lookalike: "Lookalike domains are registered by attackers to impersonate you in phishing campaigns. Customers who trust your brand may be fooled.",
    exposure: "Services exposed to the internet with known vulnerabilities are actively scanned and exploited by automated tools.",
    subdomains: "Development and staging subdomains often have weaker security than production. If they're visible to the internet, they're an entry point.",
    fingerprint: "Outdated software has known vulnerabilities that attackers exploit. Keeping your stack current is the first line of defense.",
    blocklist: "If your mail server IP is on a blocklist, your legitimate email to customers may land in their spam folder, hurting deliverability.",
    web_hygiene: "Not enforcing HTTPS leaves traffic unencrypted. Setting cookies before consent violates UK PECR and GDPR.",
    safebrowsing: "A Safe Browsing flag means Google is warning users away from your site, which destroys trust and traffic."
  };

  return templates[finding.id] || "This finding indicates a potential security or compliance gap worth addressing.";
}

function getTrafficLightSummary(results: CheckResult[]): { action: number; review: number; good: number } {
  return {
    action: results.filter(r => r.status === "action").length,
    review: results.filter(r => r.status === "review").length,
    good: results.filter(r => r.status === "good").length
  };
}
