import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, ArrowUpRight, Database, Eye, Filter, Loader2, Radar, RefreshCw, Save, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Filters = { minLiquidity: number; minVolume: number; maxAgeHours: number; maxRisk: number };
type Candidate = {
  pairAddress: string; baseAddress: string; symbol: string; name: string; dexId: string; sourceUrl: string; priceUsd: number | null;
  liquidityUsd: number; volumeH1: number; volumeH24: number; transactionsH1: number; priceChangeM5: number; priceChangeH1: number;
  ageHours: number | null; opportunityScore: number; riskScore: number; scoreDelta: number; factors: string[]; warnings: string[];
};

type ScanView = {
  scanId?: number | null; source: string; fetchedAt: Date | string; totalCandidates: number; filters: Filters;
  persistenceAvailable: boolean; candidates: Candidate[];
};

const DEFAULT_FILTERS: Filters = { minLiquidity: 0, minVolume: 0, maxAgeHours: 168, maxRisk: 100 };

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function formatAge(hours: number | null) {
  if (hours === null) return "غير متاح";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} د`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} س`;
  return `${(hours / 24).toFixed(1)} ي`;
}

function RiskBadge({ score }: { score: number }) {
  const tone = score >= 60 ? "danger" : score >= 30 ? "warn" : "safe";
  const label = score >= 60 ? "مرتفع" : score >= 30 ? "متوسط" : "أدنى";
  return <span className={`risk-badge ${tone}`}><span className="risk-dot" />{label} {Math.round(score)}</span>;
}

export default function Home() {
  const utils = trpc.useUtils();
  const dashboardQuery = trpc.scanner.dashboard.useQuery();
  const savedFiltersQuery = trpc.scanner.filters.get.useQuery();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [liveScan, setLiveScan] = useState<ScanView | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);

  useEffect(() => {
    if (savedFiltersQuery.data?.filters) setFilters(savedFiltersQuery.data.filters);
  }, [savedFiltersQuery.data]);

  const refresh = trpc.scanner.refresh.useMutation({
    onSuccess: (data) => {
      setLiveScan(data);
      void utils.scanner.dashboard.invalidate();
      toast.success(`اكتمل الفحص: ${data.candidates.length} نتيجة ظاهرة`);
    },
    onError: (error) => toast.error(error.message || "تعذر تحديث البيانات"),
  });
  const saveFilters = trpc.scanner.filters.save.useMutation({ onSuccess: () => toast.success("تم حفظ إعدادات المرشحات") });

  const scan: ScanView | null = liveScan ?? (dashboardQuery.data ? {
    ...dashboardQuery.data,
    candidates: dashboardQuery.data.candidates as Candidate[],
  } : null);
  const candidates = (scan?.candidates ?? []) as Candidate[];
  const metrics = useMemo(() => ({
    visible: candidates.length,
    highRisk: candidates.filter((candidate) => candidate.riskScore >= 60).length,
    avgOpportunity: candidates.length ? candidates.reduce((sum, candidate) => sum + candidate.opportunityScore, 0) / candidates.length : 0,
    latestAge: candidates.length ? Math.min(...candidates.map((candidate) => candidate.ageHours ?? 999)) : null,
  }), [candidates]);
  const updating = refresh.isPending;

  const setNumber = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  const lastFetched = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "لم يتم الجلب بعد";

  return (
    <div dir="rtl" className="scanner-shell">
      <div className="grid-noise" aria-hidden="true" />
      <header className="scanner-header">
        <div className="brand-block">
          <div className="brand-mark"><Radar size={22} /></div>
          <div>
            <p className="eyebrow">SOLANA // SIGNAL INTELLIGENCE</p>
            <h1>ماسح <span>الإشارات</span></h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="source-state"><span className="pulse-dot" />مصدر عام · DEX Screener</div>
          <Button className="scan-button" onClick={() => refresh.mutate(filters)} disabled={updating}>
            {updating ? <Loader2 className="animate-spin" /> : <RefreshCw />} {updating ? "جارٍ الفحص…" : "تحديث يدوي"}
          </Button>
        </div>
      </header>

      <main className="scanner-main">
        <section className="alert-banner hud-panel" aria-label="تنبيه مخاطر">
          <ShieldAlert size={24} />
          <div><strong>تنبيه عالي المخاطر</strong><p>هذه النتائج تحليل آلي للبيانات العامة وليست توصية شراء أو ضمان ربح. لا توجد محافظ، أو أوامر تداول، أو تنفيذ معاملات في هذا التطبيق.</p></div>
          <span className="alert-code">NO-TRADE // READ-ONLY</span>
        </section>

        <section className="status-grid" aria-label="مؤشرات الفحص">
          <StatusCard icon={<Eye />} label="نتائج ظاهرة" value={number.format(metrics.visible)} note="بعد المرشحات" accent="cyan" />
          <StatusCard icon={<Sparkles />} label="متوسط الفرصة" value={metrics.avgOpportunity ? metrics.avgOpportunity.toFixed(1) : "—"} note="من 100" accent="pink" />
          <StatusCard icon={<AlertTriangle />} label="مخاطر مرتفعة" value={number.format(metrics.highRisk)} note="درجة ≥ 60" accent="orange" />
          <StatusCard icon={<Activity />} label="أحدث زوج" value={formatAge(metrics.latestAge)} note="عمر تقريبي" accent="purple" />
        </section>

        <section className="workspace">
          <aside className="filter-panel hud-panel">
            <div className="panel-title"><Filter size={17} /><span>مرشحات الإشارة</span><span className="panel-id">F-01</span></div>
            <p className="panel-copy">تُطبّق المرشحات على نتائج كل فحص، ويمكن حفظ آخر إعداد للاستخدام اللاحق.</p>
            <FilterField label="أدنى سيولة بالدولار" value={filters.minLiquidity} min={0} step={1000} onChange={(value) => setNumber("minLiquidity", value)} />
            <FilterField label="أدنى حجم خلال ساعة" value={filters.minVolume} min={0} step={500} onChange={(value) => setNumber("minVolume", value)} />
            <FilterField label="أقصى عمر بالساعات" value={filters.maxAgeHours} min={1} max={720} step={1} onChange={(value) => setNumber("maxAgeHours", value)} />
            <FilterField label="أقصى درجة مخاطرة" value={filters.maxRisk} min={0} max={100} step={1} onChange={(value) => setNumber("maxRisk", value)} />
            <Button variant="outline" className="save-filter" onClick={() => saveFilters.mutate(filters)} disabled={saveFilters.isPending}><Save />حفظ الإعدادات</Button>
            <div className="filter-foot"><Database size={14} />{scan?.persistenceAvailable ? "تُحفظ اللقطات والإعدادات في قاعدة البيانات" : "ستُستخدم النتائج الحية؛ التخزين غير متاح حالياً"}</div>
          </aside>

          <section className="results-panel hud-panel">
            <div className="results-header">
              <div><p className="eyebrow">LIVE SCAN / MANUAL REFRESH</p><h2>أحدث الأزواج <span>المكتشفة</span></h2></div>
              <div className="fetch-state"><span>آخر جلب</span><strong>{lastFetched}</strong><small>{scan?.totalCandidates ? `${scan.totalCandidates} مرشح من المصدر` : "اضغط تحديث لبدء الفحص"}</small></div>
            </div>
            {dashboardQuery.isLoading && !liveScan ? <div className="empty-state"><Loader2 className="animate-spin" />جارٍ استعادة آخر لقطة…</div> : candidates.length === 0 ? <EmptyState loading={updating} onScan={() => refresh.mutate(filters)} /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>التوكن / DEX</th><th>السيولة</th><th>حجم 1س</th><th>العمر</th><th>السعر 1س</th><th>الفرصة</th><th>المخاطرة</th><th aria-label="تفاصيل" /></tr></thead>
                  <tbody>{candidates.map((candidate) => <tr key={`${candidate.pairAddress}-${candidate.baseAddress}`}>
                    <td><div className="token-cell"><span className="token-orb">{candidate.symbol.slice(0, 1)}</span><div><strong>{candidate.symbol}</strong><small>{candidate.name} · {candidate.dexId}</small></div></div></td>
                    <td className="ltr">{currency.format(candidate.liquidityUsd)}</td><td className="ltr">{currency.format(candidate.volumeH1)}</td><td>{formatAge(candidate.ageHours)}</td>
                    <td className={`ltr change ${candidate.priceChangeH1 > 0 ? "up" : candidate.priceChangeH1 < 0 ? "down" : ""}`}>{candidate.priceChangeH1 > 0 ? "+" : ""}{candidate.priceChangeH1.toFixed(1)}%</td>
                    <td><div className="score-cell"><strong>{candidate.opportunityScore.toFixed(1)}</strong><div className="score-track"><i style={{ width: `${candidate.opportunityScore}%` }} /></div>{candidate.scoreDelta !== 0 && <small className={candidate.scoreDelta > 0 ? "up" : "down"}>{candidate.scoreDelta > 0 ? "+" : ""}{candidate.scoreDelta.toFixed(1)}</small>}</div></td>
                    <td><RiskBadge score={candidate.riskScore} /></td><td><button className="icon-action" onClick={() => setSelected(candidate)} aria-label={`تفاصيل ${candidate.symbol}`}><ArrowUpRight size={17} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="token-dialog" dir="rtl">
          {selected && <><DialogHeader><p className="eyebrow">PAIR INTELLIGENCE // READ ONLY</p><DialogTitle>{selected.symbol} <span>{selected.name}</span></DialogTitle><DialogDescription>تفصيل الإشارات المتاحة من آخر لقطة محفوظة.</DialogDescription></DialogHeader>
            <div className="detail-scores"><div><span>الفرصة</span><strong>{selected.opportunityScore.toFixed(1)}</strong><small>من 100</small></div><div><span>المخاطرة</span><strong>{selected.riskScore.toFixed(1)}</strong><RiskBadge score={selected.riskScore} /></div><div><span>المعاملات / 1س</span><strong>{number.format(selected.transactionsH1)}</strong><small>إشارة نشاط</small></div></div>
            <div className="detail-grid"><DetailMetric label="السيولة" value={currency.format(selected.liquidityUsd)} /><DetailMetric label="حجم 24س" value={currency.format(selected.volumeH24)} /><DetailMetric label="عمر الزوج" value={formatAge(selected.ageHours)} /><DetailMetric label="تغير 5د" value={`${selected.priceChangeM5 > 0 ? "+" : ""}${selected.priceChangeM5.toFixed(1)}%`} /></div>
            <div className="signal-columns"><div><h3><Zap size={16} /> عوامل رفعت التقييم</h3>{selected.factors.length ? selected.factors.map((factor) => <p key={factor}>{factor}</p>) : <p>لا تتوفر عوامل إيجابية كافية.</p>}</div><div className="warnings"><h3><AlertTriangle size={16} /> علامات تحذير</h3>{selected.warnings.length ? selected.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>لا توجد تحذيرات آلية إضافية في هذه اللقطة.</p>}</div></div>
            <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">فتح مصدر الزوج على DEX Screener <ArrowUpRight size={16} /></a>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusCard({ icon, label, value, note, accent }: { icon: React.ReactNode; label: string; value: string; note: string; accent: string }) {
  return <article className={`status-card ${accent} hud-panel`}><div className="status-icon">{icon}</div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

function FilterField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max?: number; step: number; onChange: (value: string) => void }) {
  return <label className="filter-field"><span>{label}</span><div><Input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} /><em>{label.includes("دولار") || label.includes("حجم") ? "$" : label.includes("مخاطرة") ? "/100" : "ساعة"}</em></div></label>;
}

function EmptyState({ loading, onScan }: { loading: boolean; onScan: () => void }) {
  return <div className="empty-state"><Radar size={34} /><h3>{loading ? "يتم مسح المصدر العام…" : "لا توجد لقطة مطابقة بعد"}</h3><p>{loading ? "نحلل أحدث ملفات توكنات سولانا والأزواج المرتبطة بها." : "ابدأ فحصاً يدوياً. لن تظهر أي بيانات تجريبية أو توصيات تداول داخل هذه اللوحة."}</p>{!loading && <Button className="scan-button" onClick={onScan}><RefreshCw />ابدأ الفحص</Button>}</div>;
}

function DetailMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong className="ltr">{value}</strong></div>; }
