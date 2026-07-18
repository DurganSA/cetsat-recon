"use client";

import { useState, FormEvent } from "react";
import { CheckResult } from "@/lib/types";

export default function Home() {
  const [domain, setDomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companiesHouseNumber, setCompaniesHouseNumber] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsScanning(true);
    setResults([]);
    setError("");

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          companyName,
          companiesHouseNumber,
          recipientName,
          preparedBy
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
              const result = JSON.parse(line) as CheckResult;
              setResults(prev => [...prev, result]);
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
          }
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
                  <button
                    onClick={handleDownloadReport}
                    className="bg-green-600 text-white py-2 px-6 rounded-md font-medium hover:bg-green-700 transition-colors"
                  >
                    Download Report (.docx)
                  </button>
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
