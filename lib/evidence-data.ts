import { buildAnalysisCoverage, collectComprehensiveAnalysisContext } from "@/lib/analysis-context";
import { listHoldings } from "@/lib/holdings-store";
import { listTransactions, summarizeTransactions } from "@/lib/transactions-store";

export async function buildEvidencePackage(ownerKey: string) {
  const holdings = await listHoldings(ownerKey);
  const transactions = await listTransactions(ownerKey);
  const context = await collectComprehensiveAnalysisContext(holdings);
  const { coverage, missingCategories, sources } = buildAnalysisCoverage(context, holdings);
  const researchById = new Map(context.holdingResearch.map((item) => [item.holdingId, item]));
  const fundProducts = new Map((context.fundResearch?.products ?? []).map((item) => [item.code, item]));

  return {
    packageVersion: "2.0",
    generatedAt: new Date().toISOString(),
    scope: "当前账号私有研究数据；此完整明细不会发送给外部 AI",
    holdings: holdings.map((holding) => {
      const research = researchById.get(holding.id);
      const fundProduct = fundProducts.get(holding.code);
      return {
        code: holding.code,
        name: holding.name,
        type: holding.type,
        quote: context.market.quotes.find((quote) => quote.key === `${holding.type}:${holding.code}`) ?? null,
        fundamentals: research?.fundamentals ?? null,
        marketHistory: research?.marketHistory ? { asOf: research.marketHistory.asOf, sampleSize: research.marketHistory.sampleSize, status: research.marketHistory.status, stats: research.marketHistory.stats, source: research.marketHistory.source } : null,
        fundHistory: research?.fundHistory ? { asOf: research.fundHistory.asOf, sampleSize: research.fundHistory.sampleSize, status: research.fundHistory.status, stats: research.fundHistory.stats, riskMetrics: research.fundHistory.riskMetrics, source: research.fundHistory.source } : null,
        riskMetrics: research?.riskMetrics ?? research?.fundHistory?.riskMetrics ?? null,
        fundResearch: fundProduct ? { fundType: fundProduct.fundType, manager: fundProduct.manager, reportDate: fundProduct.reportDate, disclosedHoldings: fundProduct.holdings, verification: fundProduct.verification, sources: fundProduct.sources } : null,
        errors: research?.errors ?? [],
      };
    }),
    transactions: { count: transactions.length, byAsset: summarizeTransactions(transactions) },
    market: {
      retrievedAt: context.market.retrievedAt,
      indices: context.indices.quotes,
      breadth: context.market.aMarket,
    },
    news: {
      count: context.marketNews?.items.length ?? 0,
      sources: context.marketNews?.sources ?? [],
      retrievedAt: context.marketNews?.retrievedAt ?? null,
    },
    notices: {
      count: context.notices.items.length,
      sources: [...new Set(context.notices.items.map((item) => item.source))],
      retrievedAt: context.notices.retrievedAt,
    },
    coverage,
    missingCategories,
    sources,
    disclaimer: "仅供个人研究参考，不构成投资建议或交易指令；证券代码、名称、成本、数量、金额、设备信息和流水明细不会发送给外部 AI 服务。",
  };
}
