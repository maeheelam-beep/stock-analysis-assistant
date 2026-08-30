import { fetchHistoricalPoints } from "@/lib/history-data";
import type { RiskMetrics } from "@/lib/types";

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (index - lower);
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(closes: number[]) {
  if (closes.length < 2) return null;
  let peak = closes[0] ?? 0;
  let worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) worst = Math.min(worst, (close / peak - 1) * 100);
  }
  return worst;
}

function classify(score: number | null): RiskMetrics["riskLevel"] {
  if (score === null) return "未知";
  if (score >= 67) return "高";
  if (score >= 34) return "中";
  return "低";
}

export async function fetchRiskMetrics(code: string): Promise<RiskMetrics> {
  const { name, points, source, verification, deviationPercent } = await fetchHistoricalPoints(code, 520);
  const returns = points.slice(1).map((point) => point.changePercent).filter((value) => Number.isFinite(value) && Math.abs(value) <= 30);
  if (returns.length < 30) throw new Error("历史行情样本不足 30 个交易日，暂不计算风险指标。");

  const volatility = standardDeviation(returns);
  const annualizedVolatility = volatility === null ? null : volatility * Math.sqrt(250);
  const downside = returns.map((value) => Math.min(0, value));
  const downsideDeviation = Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length) * Math.sqrt(250);
  const valueAtRisk95 = percentile(returns, 0.05);
  const winRate = returns.filter((value) => value > 0).length / returns.length;
  let currentStreak = 0;
  let lossStreak = 0;
  for (const value of returns) {
    if (value < 0) { currentStreak += 1; lossStreak = Math.max(lossStreak, currentStreak); } else currentStreak = 0;
  }
  const drawdown = maxDrawdown(points.map((point) => point.close));
  const scoreParts = [
    annualizedVolatility === null ? null : Math.min(100, annualizedVolatility * 3),
    drawdown === null ? null : Math.min(100, Math.abs(drawdown) * 2),
    valueAtRisk95 === null ? null : Math.min(100, Math.abs(valueAtRisk95) * 8),
  ].filter((value): value is number => value !== null);
  const riskScore = scoreParts.length ? Math.round(scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length) : null;

  return {
    code,
    name,
    asOf: points.at(-1)?.date || null,
    observationCount: returns.length,
    annualizedVolatility,
    maxDrawdown: drawdown,
    valueAtRisk95,
    downsideDeviation,
    winRate,
    lossStreak,
    riskScore,
    riskLevel: classify(riskScore),
    source,
    note: `指标基于最近最多 520 个复权交易日，并剔除绝对涨跌幅超过 30% 的特殊或异常交易日；历史源状态为${verification === "verified" ? "多源验证" : verification === "conflict" ? `来源冲突（最新收盘偏差 ${deviationPercent ?? "—"}%）` : "单源可用"}。VaR95 表示单日收益的 5% 分位数，不代表保证损失范围。`,
  };
}
