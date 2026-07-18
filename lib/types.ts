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
