"use client";

import { useState, FormEvent } from "react";
import { CheckResult, ComparisonResult, DomainRole, StreamedCheckResult } from "@/lib/types";
import { normalizeDomain } from "@/lib/domain";

type StreamLine = StreamedCheckResult | { type: "comparison"; comparison: ComparisonResult };

export default function Home() {
  const [domain, setDomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companiesHouseNumber, setCompaniesHouseNumber] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [competitor1, setCompetitor1] = useState("");
  const [competitor2, setCompetitor2] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [competitor1Results, setCompetitor1Results] = useState<CheckResult[]>([]);
  const [competitor2Results, setCompetitor2Results] = useState<CheckResult[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState("");

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    setResults([]);
    setCompetitor1Results([]);
    setCompetitor2Results([]);
    setComparison(null);
    setError("");

    // Normalize (strip protocol/www./path) up front and keep state in sync with what
    // the server actually scans - otherwise the JSON export, report, and filename would
    // echo back the raw "www.example.com" the user typed while every check result
    // underneath uses the canonical "example.com".
    const normalizedDomain = normalizeDomain(domain);
    const normalizedCompetitor1 = competitor1 ? normalizeDomain(competitor1) : "";
    const normalizedCompetitor2 = competitor2 ? normalizeDomain(competitor2) : "";
    setDomain(normalizedDomain);
    setCompetitor1(normalizedCompetitor1);
    setCompetitor2(normalizedCompetitor2);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: normalizedDomain,
          companyName,
          companiesHouseNumber,
          recipientName,
          preparedBy,
          competitor1: normalizedCompetitor1,
          competitor2: normalizedCompetitor2
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Scan failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line) as StreamLine;

              if ("type" in parsed && parsed.type === "comparison") {
                setComparison(parsed.comparison);
                continue;
              }

              const result = parsed as StreamedCheckResult;
              if (result.role === "competitor1") {
                setCompetitor1Results(prev => [...prev, result]);
              } else if (result.role === "competitor2") {
                setCompetitor2Results(prev => [...prev, result]);
              } else {
                setResults(prev => [...prev, result]);
              }
            } catch (e) {
              console.error("Failed to parse line:", line, e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results,
          input: {
            domain,
            companyName,
            recipientName,
            preparedBy
          },
          competitors: [
            competitor1 ? { domain: competitor1, results: competitor1Results } : null,
            competitor2 ? { domain: competitor2, results: competitor2Results } : null
          ].filter(Boolean),
          comparison
        })
      });

      if (!response.ok) {
        throw new Error("Report generation failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security-review-${domain}-${new Date().toISOString().split("T")[0]}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownloadJSON = () => {
    // Extract distinct capabilities across all checks
    const capabilities = Array.from(
      new Set(results.filter(r => r.capability).map(r => r.capability))
    );

    const competitors = [
      competitor1 ? { domain: competitor1, results: competitor1Results } : null,
      competitor2 ? { domain: competitor2, results: competitor2Results } : null
    ].filter(Boolean);

    const exportData = {
      scan_date: new Date().toISOString(),
      domain,
      company_name: companyName,
      companies_house_number: companiesHouseNumber,
      recipient_name: recipientName,
      prepared_by: preparedBy,
      results,
      summary: {
        action: results.filter(r => r.status === "action").length,
        review: results.filter(r => r.status === "review").length,
        good: results.filter(r => r.status === "good").length,
        info: results.filter(r => r.status === "info").length
      },
      capabilities,
      competitors,
      comparison
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${domain}-scan-data-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const statusColors: Record<string, string> = {
    good: "bg-green-100 text-green-800 border-green-300",
    review: "bg-yellow-100 text-yellow-800 border-yellow-300",
    action: "bg-red-100 text-red-800 border-red-300",
    info: "bg-blue-100 text-blue-800 border-blue-300"
  };

  const statusIcons: Record<string, string> = {
    good: "🟢",
    review: "🟡",
    action: "🔴",
    info: "🔵"
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Log out
          </button>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Cetsat Recon
          </h1>
          <p className="text-lg text-gray-600">
            Prospect security review tool - passive checks only
          </p>
        </div>

        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
                Domain <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                required
                disabled={isScanning}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                  Company name
                </label>
                <input
                  type="text"
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="For Companies House search"
                  disabled={isScanning}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="companiesHouseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Companies House number
                </label>
                <input
                  type="text"
                  id="companiesHouseNumber"
                  value={companiesHouseNumber}
                  onChange={(e) => setCompaniesHouseNumber(e.target.value)}
                  placeholder="Optional"
                  disabled={isScanning}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="recipientName" className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient name
                </label>
                <input
                  type="text"
                  id="recipientName"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="For report cover"
                  disabled={isScanning}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="preparedBy" className="block text-sm font-medium text-gray-700 mb-1">
                  Prepared by
                </label>
                <input
                  type="text"
                  id="preparedBy"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  placeholder="Your name"
                  disabled={isScanning}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Competitor benchmarking (optional)
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Run the same checks against up to 2 competitor domains for a side-by-side comparison. Uses a faster check subset (skips TLS/Shodan) to keep scan time down.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="competitor1" className="block text-sm font-medium text-gray-700 mb-1">
                    Competitor 1 domain
                  </label>
                  <input
                    type="text"
                    id="competitor1"
                    value={competitor1}
                    onChange={(e) => setCompetitor1(e.target.value)}
                    placeholder="competitor1.com"
                    disabled={isScanning}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="competitor2" className="block text-sm font-medium text-gray-700 mb-1">
                    Competitor 2 domain
                  </label>
                  <input
                    type="text"
                    id="competitor2"
                    value={competitor2}
                    onChange={(e) => setCompetitor2(e.target.value)}
                    placeholder="competitor2.com"
                    disabled={isScanning}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isScanning || !domain}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isScanning ? "Scanning..." : "Run Scan"}
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="bg-white shadow-md rounded-lg p-6 mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Results ({results.length})
                </h2>
                {!isScanning && (
                  <div className="flex gap-3">
                    <button
                      onClick={handleDownloadReport}
                      className="bg-green-600 text-white py-2 px-6 rounded-md font-medium hover:bg-green-700 transition-colors"
                    >
                      📄 Download Report (.docx)
                    </button>
                    <button
                      onClick={handleDownloadJSON}
                      className="bg-blue-600 text-white py-2 px-6 rounded-md font-medium hover:bg-blue-700 transition-colors"
                      title="Download technical data for AI report generation"
                    >
                      🤖 Download Data (JSON)
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {results.map((result) => (
                  <div
                    key={result.id}
                    className={`border-2 rounded-lg p-4 ${statusColors[result.status]}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{statusIcons[result.status]}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1">
                          {result.label}
                        </h3>
                        <p className="text-sm mb-2">{result.summary}</p>
                        {result.capability && (
                          <span className="inline-block text-xs bg-white bg-opacity-50 px-2 py-1 rounded">
                            Opportunity: {result.capability.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {competitor1Results.length > 0 && (
              <div className="bg-white shadow-md rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Competitor: {competitor1} ({competitor1Results.length})
                </h2>
                <div className="space-y-3">
                  {competitor1Results.map((result) => (
                    <div
                      key={result.id}
                      className={`border-2 rounded-lg p-3 ${statusColors[result.status]}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{statusIcons[result.status]}</span>
                        <div className="flex-1">
                          <h4 className="font-semibold">{result.label}</h4>
                          <p className="text-sm">{result.summary}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {competitor2Results.length > 0 && (
              <div className="bg-white shadow-md rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Competitor: {competitor2} ({competitor2Results.length})
                </h2>
                <div className="space-y-3">
                  {competitor2Results.map((result) => (
                    <div
                      key={result.id}
                      className={`border-2 rounded-lg p-3 ${statusColors[result.status]}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{statusIcons[result.status]}</span>
                        <div className="flex-1">
                          <h4 className="font-semibold">{result.label}</h4>
                          <p className="text-sm">{result.summary}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {comparison && comparison.entries.length > 0 && (
              <div className="bg-white shadow-md rounded-lg p-6 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">How You Compare</h2>

                {comparison.headlines.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {comparison.headlines.map((headline, i) => (
                      <p key={i} className="text-sm bg-gray-50 border border-gray-200 rounded p-2">
                        {headline}
                      </p>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="py-2 pr-4">Check</th>
                        {comparison.domains.map((d) => (
                          <th key={d.role} className="py-2 pr-4">{d.domain}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.entries.map((entry) => (
                        <tr key={entry.checkId} className="border-b border-gray-100">
                          <td className="py-2 pr-4 font-medium">{entry.label}</td>
                          {entry.domains.map((d) => (
                            <td
                              key={d.role}
                              className={`py-2 pr-4 ${entry.winner === d.role ? "font-semibold" : ""}`}
                            >
                              {statusIcons[d.status]} {d.metric ?? d.status}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white shadow-md rounded-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">
                    {results.filter(r => r.status === "action").length}
                  </div>
                  <div className="text-sm text-gray-600">Action Required</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-3xl font-bold text-yellow-600">
                    {results.filter(r => r.status === "review").length}
                  </div>
                  <div className="text-sm text-gray-600">Review</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">
                    {results.filter(r => r.status === "good").length}
                  </div>
                  <div className="text-sm text-gray-600">Good</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">
                    {results.filter(r => r.status === "info").length}
                  </div>
                  <div className="text-sm text-gray-600">Info</div>
                </div>
              </div>
            </div>
          </>
        )}

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p className="mb-2">
            All checks are passive and public-source only. No active scanning or intrusive testing.
          </p>
          <p>
            Built for Cetsat - prospect security review tool
          </p>
        </footer>
      </div>
    </main>
  );
}
