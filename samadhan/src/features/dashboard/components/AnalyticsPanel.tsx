import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Issue } from "@/shared/types/domain/Issue";
import { dashboardService } from "../services/dashboardService";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import {
  BarChart3,
  TrendingUp,
  Map,
  PieChart as PieIcon,
  MapPin,
  Clock,
  Sparkles,
  BrainCircuit,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AnalyticsPanelProps {
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Shared chart styling
// ---------------------------------------------------------------------------
const TICK = { fill: "#9ca3af", fontSize: 11 };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-2xl text-xs font-sans">
      {label && <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 font-medium text-foreground mt-0.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: p.color ?? p.stroke ?? p.fill }} />
          <span>{p.name || "Value"}:</span>
          <span className="font-bold ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function parseBoldText(text: string) {
  if (!text) return { __html: "" };
  const html = text.replace(/\*\*(.*?)\*\*/g, "<strong class='font-bold text-foreground'>$1</strong>");
  return { __html: html };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AnalyticsPanel({ issues }: AnalyticsPanelProps) {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const analytics = useMemo(
    () => dashboardService.computeAnalytics(issues),
    [issues]
  );

  if (issues.length === 0) return null;

  const handleCategoryClick = (category: string) =>
    navigate(`${ROUTES.CIVIC_MAP}?category=${encodeURIComponent(category)}`);

  const handleCityClick = (city: string) =>
    navigate(`${ROUTES.CIVIC_MAP}?city=${encodeURIComponent(city)}`);

  return (
    <div className="space-y-6">
      {/* Panel Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {language === "en" ? "Civic Analytics" : "नागरिक विश्लेषण"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {language === "en"
              ? `${analytics.totalIssues} issues · ${analytics.geoTaggedCount} geo-tagged${analytics.avgResolutionDays !== null ? ` · ~${analytics.avgResolutionDays}d avg. resolution` : ""}`
              : `${analytics.totalIssues} समस्याएं · ${analytics.geoTaggedCount} जियो-टैग`}
          </p>
        </div>
      </div>

      {/* Row 1: Category Donut + Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Category Donut ───────────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <PieIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {language === "en" ? "Issues by Category" : "श्रेणी अनुसार समस्याएं"}
            </h3>
            <span className="ml-auto text-[10px] text-muted-foreground italic">
              {language === "en" ? "click → filter map" : "क्लिक → मानचित्र"}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={analytics.categoryData}
                cx="50%"
                cy="48%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
                dataKey="count"
                nameKey="name"
                onClick={(d) => handleCategoryClick(d.name)}
                cursor="pointer"
              >
                {analytics.categoryData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(v) => (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{v}</span>
                )}
                iconSize={8}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ── Status Bar ───────────────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {language === "en" ? "Status Distribution" : "स्थिति वितरण"}
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={analytics.statusData}
              layout="vertical"
              margin={{ left: 4, right: 20, top: 12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={TICK}
                axisLine={false}
                tickLine={false}
                width={78}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(99,102,241,0.07)" }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {analytics.statusData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Monthly Reports Trend (full width) */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {language === "en" ? "Monthly Reports Trend" : "मासिक रिपोर्ट ट्रेंड"}
          </h3>
          <span className="ml-auto text-[10px] text-muted-foreground italic">
            {language === "en" ? "Last 6 months" : "पिछले 6 महीने"}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart
            data={analytics.monthlyTrend}
            margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="#374151" opacity={0.3} />
            <XAxis
              dataKey="month"
              tick={TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "rgba(99,102,241,0.2)", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="count"
              name={language === "en" ? "Issues Reported" : "दर्ज मुद्दे"}
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ fill: "#6366f1", strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: "#6366f1", stroke: "white", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly Summary & AI Insights Card */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-6 bg-gradient-to-br from-card via-muted/5 to-card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
            {language === "en" ? "Smart Civic Summary" : "स्मार्ट नागरिक विवरण"}
          </h3>
        </div>
        <p 
          className="text-sm text-foreground leading-relaxed mb-4 whitespace-pre-wrap text-left"
          dangerouslySetInnerHTML={parseBoldText(language === "en" ? analytics.weeklySummary.summaryTextEn : analytics.weeklySummary.summaryTextHi)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/40 text-left">
          {(language === "en" ? analytics.weeklySummary.insightsEn : analytics.weeklySummary.insightsHi).map((insight, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground text-left">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span dangerouslySetInnerHTML={parseBoldText(insight)} />
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Enhanced Top Affected Cities + Department Leaderboard */}
      {analytics.cityRanking.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Affected Cities */}
          <div className="bg-card rounded-2xl border border-border shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Map className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                {language === "en" ? "Top Affected Cities & Risk Hotspots" : "प्रभावित शहर और जोखिम हॉटस्पॉट"}
              </h3>
              <span className="ml-auto text-[10px] text-muted-foreground italic">
                {language === "en" ? "click → zoom map" : "क्लिक → मानचित्र ज़ूम"}
              </span>
            </div>
            <div className="space-y-4">
              {analytics.cityRanking.map((entry, idx) => (
                <button
                  key={entry.city}
                  onClick={() => handleCityClick(entry.city)}
                  className="w-full flex items-center gap-3 group text-left border-b border-border/20 pb-3 last:border-0 last:pb-0"
                >
                  {/* Rank badge */}
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </div>

                  {/* City info + progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {entry.city}
                        </p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          entry.riskLevel === "High"
                            ? "bg-red-500/10 text-red-500 border border-red-500/20"
                            : entry.riskLevel === "Medium"
                            ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                            : "bg-green-500/10 text-green-500 border border-green-500/20"
                        }`}>
                          {entry.riskLevel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2 text-xs">
                        <span className="text-muted-foreground font-semibold">{entry.count} {language === "en" ? "issues" : "मामले"}</span>
                        <span className="text-green-500 font-bold">
                          {entry.resolutionRate}% ✓
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${entry.resolutionRate}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                      <span>{language === "en" ? `Top Issue: ${entry.topCategory}` : `मुख्य समस्या: ${entry.topCategory}`}</span>
                      <span>Density: {entry.density}%</span>
                    </div>
                  </div>

                  {/* Map icon */}
                  <MapPin className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Department Performance Leaderboard */}
          <div className="bg-card rounded-2xl border border-border shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                {language === "en" ? "Department Performance Leaderboard" : "विभाग कार्यप्रदर्शन लीडरबोर्ड"}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground pb-2">
                    <th className="py-2 font-semibold text-left">{language === "en" ? "Department" : "विभाग"}</th>
                    <th className="py-2 text-center font-semibold">{language === "en" ? "Active" : "सक्रिय"}</th>
                    <th className="py-2 text-center font-semibold">{language === "en" ? "Success" : "सफलता"}</th>
                    <th className="py-2 text-center font-semibold">{language === "en" ? "Status" : "स्थिति"}</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.departmentPerformance.map((dept) => (
                    <tr key={dept.department} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                      <td className="py-3 font-medium text-foreground max-w-[150px] truncate text-left" title={dept.department}>
                        {dept.department}
                      </td>
                      <td className="py-3 text-center text-muted-foreground font-medium">{dept.activeCount}</td>
                      <td className="py-3 text-center text-green-500 font-bold">{dept.resolutionRate}%</td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          dept.status === "Excellent" 
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : dept.status === "Average"
                            ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            dept.status === "Excellent" ? "bg-green-500" : dept.status === "Average" ? "bg-yellow-500" : "bg-red-500"
                          }`} />
                          {dept.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Row 4: AI Recommendations & Projections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recommendations */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground text-left">
                {language === "en" ? "Predictive Actions & Recommendations" : "पूर्वानुमानित कार्रवाई और सिफारिशें"}
              </h3>
            </div>
            <div className="space-y-3">
              {analytics.categoryData.slice(0, 3).map((cat, idx) => {
                let recText = "";
                const city = analytics.cityRanking[0]?.city || "Indore";
                if (cat.name.includes("Road") || cat.name.includes("सड़क")) {
                  recText = language === "en" 
                    ? `Increase road maintenance schedules and asphalt allocation in ${city} to resolve potholes.`
                    : `${city} में गड्ढों को ठीक करने के लिए सड़क मरम्मत अनुसूची और डामर आवंटन बढ़ाएं।`;
                } else if (cat.name.includes("Sanitation") || cat.name.includes("स्वच्छता")) {
                  recText = language === "en"
                    ? `Deploy additional waste collection trucks and sanitation personnel in ${city} to clear waste hotspots.`
                    : `कचरा संचय हॉटस्पॉट साफ करने के लिए ${city} में कचरा संग्रहण वाहनों और स्वच्छता कर्मियों की तैनाती बढ़ाएं।`;
                } else if (cat.name.includes("Water") || cat.name.includes("जल")) {
                  recText = language === "en"
                    ? `Conduct pipeline pressure reviews and repair leakages in ${city} to address water complaints.`
                    : `पानी की शिकायतों के समाधान के लिए ${city} में पाइपलाइन दबाव समीक्षा और लीकेज मरम्मत कराएं।`;
                } else {
                  recText = language === "en"
                    ? `Allocate priority infrastructure funding for ${cat.name} mitigation in high-complaint areas.`
                    : `उच्च शिकायत वाले क्षेत्रों में ${cat.name} शमन के लिए प्राथमिकता बुनियादी ढांचा निधि आवंटित करें।`;
                }

                return (
                  <div key={idx} className="flex gap-2.5 items-start bg-muted/10 border border-border/30 rounded-xl p-3 text-left">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{recText}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Projections / Forecasts */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground text-left">
                {language === "en" ? "Civic Resolution Forecast" : "नागरिक समाधान पूर्वानुमान"}
              </h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4 text-left">
              <div className="p-3 bg-muted/30 border border-border/40 rounded-xl">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                  {language === "en" ? "Expected Growth" : "अपेक्षित वृद्धि"}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-bold ${
                    analytics.forecasting.expectedGrowthPercent > 0 ? "text-red-500" : "text-green-500"
                  }`}>
                    {analytics.forecasting.expectedGrowthPercent > 0 ? "+" : ""}{analytics.forecasting.expectedGrowthPercent}%
                  </span>
                </div>
              </div>

              <div className="p-3 bg-muted/30 border border-border/40 rounded-xl">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                  {language === "en" ? "Est. Reports Next Week" : "अगले सप्ताह अनुमानित मामले"}
                </p>
                <span className="text-lg font-bold text-foreground">
                  {analytics.forecasting.estimatedReportsNextWeek}
                </span>
              </div>
            </div>

            <div className="bg-muted/10 border border-border/40 rounded-xl p-3 text-xs leading-relaxed text-muted-foreground text-left">
              <p className="font-semibold text-foreground mb-1">
                {language === "en" ? "💡 Trend Prediction:" : "💡 ट्रेंड भविष्यवाणी:"}
              </p>
              {language === "en" 
                ? `Complaints for **${analytics.forecasting.topCategoryLikelyToIncrease}** are predicted to increase next week. We recommend proactive inspection in high-density hotspots.`
                : `अगले सप्ताह **${analytics.forecasting.topCategoryLikelyToIncrease}** से संबंधित शिकायतों में वृद्धि होने का अनुमान है। हम उच्च-घनत्व वाले हॉटस्पॉट में सक्रिय निरीक्षण की सलाह देते हैं।`
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
