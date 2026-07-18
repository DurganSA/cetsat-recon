export type CheckStatus = "good" | "review" | "action" | "info";

export type CheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  data: any;
  summary: string;
  capability?: string;
};

export type ScanInput = {
  domain: string;
  companyName?: string;
  companiesHouseNumber?: string;
  recipientName?: string;
  preparedBy?: string;
};

export type DomainRole = "primary" | "competitor1" | "competitor2";

// A CheckResult tagged with which domain/role it belongs to, as streamed over NDJSON
export type StreamedCheckResult = CheckResult & {
  domain: string;
  role: DomainRole;
};

export type DomainScan = {
  role: DomainRole;
  domain: string;
  results: CheckResult[];
};

export type ComparisonDomainEntry = {
  role: DomainRole;
  domain: string;
  status: CheckStatus;
  metric?: string;
};

export type ComparisonEntry = {
  checkId: string;
  label: string;
  domains: ComparisonDomainEntry[];
  winner: DomainRole | "tie" | null;
};

export type ComparisonResult = {
  domains: { role: DomainRole; domain: string }[];
  scores: Record<string, number>;
  entries: ComparisonEntry[];
  headlines: string[];
};
