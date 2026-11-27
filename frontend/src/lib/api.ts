const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8899/api";

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("daha_bi_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem("daha_bi_token", token);
  } else {
    window.localStorage.removeItem("daha_bi_token");
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      data?.message ?? `Request failed with status ${res.status}`,
      res.status,
      data?.errors
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /**
   * One silent retry before giving up — for GETs on mount, where a rare
   * transient 500 (server-side blip) shouldn't crash the page when a
   * near-instant retry would just work.
   */
  getRetrying: <T>(path: string) => request<T>(path).catch(() => request<T>(path)),
  /**
   * For binary file responses (exports) — plain fetch's res.json() would fail on these, so this
   * bypasses request() entirely and triggers a browser save via a Blob, same auth header as everything else.
   */
  download: async (path: string, filename: string) => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.message ?? `Request failed with status ${res.status}`, res.status, data?.errors);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

export type Plan = "free" | "growth" | "business";
export type PlanStatus = "active" | "trialing" | "past_due" | "canceled";

export type User = {
  id: number;
  name: string;
  email: string;
  referral_code?: string;
  is_admin?: boolean;
  low_bandwidth_mode?: boolean;
  current_organization_id?: number;
  /** The org is the paying account, not the individual user — see OrganizationBilling. */
  current_organization?: OrganizationBilling;
};

export type CommentReply = {
  id: number;
  body: string;
  mentions: number[];
  user: { id: number; name: string } | null;
  created_at: string;
  edited_at: string | null;
  can_edit: boolean;
  can_delete: boolean;
};

/** A partner company's conversation on a shared dashboard (null space = internal). */
export type CommentSpace = { id: number; name: string | null };

/** A top-level comment (thread) on a dashboard, optionally pinned to one chart. */
export type CommentThread = CommentReply & {
  chart_id: number | null;
  space: CommentSpace | null;
  resolved_at: string | null;
  resolved_by: string | null;
  can_resolve: boolean;
  replies: CommentReply[];
};

export type Mentionable = { id: number; name: string; email: string };

export type CommentsResponse = {
  threads: CommentThread[];
  /** Owner side only: partner companies it can talk to on this dashboard. */
  spaces: CommentSpace[];
  /** Partner viewers: their company's conversation (fixed). */
  my_space: CommentSpace | null;
};

export type RowFilter = { field: string; operator: "=" | "!=" | "contains" | "in"; value: string | string[] };

/** A dashboard placed in another website through an iframe. */
export type DashboardEmbed = {
  id: number;
  name: string;
  url: string;
  snippet: string;
  allowed_domains: string[];
  row_filters: RowFilter[];
  inherits_share_filters: boolean;
  expires_at: string | null;
  live: boolean;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
};

/** This dashboard shared with another company's workspace. */
export type CompanyShare = {
  id: number;
  email: string;
  company: string | null;
  row_filters: RowFilter[];
  status: "pending" | "active" | "expired";
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  share_url?: string;
  email_sent?: boolean;
};

export type AppNotification = {
  id: string;
  read_at: string | null;
  created_at: string;
  data: {
    kind: "mention" | "reply";
    title: string;
    excerpt: string;
    dashboard_id: number;
    chart_id: number | null;
    comment_id: number;
    actor: string;
  };
};

/** An emailed invitation not yet accepted (the person has no account yet). */
export type PendingInvitation = {
  id: number;
  email: string;
  role: string;
  invited_by: string | null;
  expires_at: string;
  expired: boolean;
  created_at: string;
};

/** Returned (HTTP 202) when inviting an email that has no account: the link to share. */
export type InviteSent = {
  pending: true;
  id: number;
  email: string;
  role: string;
  invite_url: string;
  email_sent: boolean;
};

export type BillingInterval = "monthly" | "yearly";

export type OrgRole = "owner" | "admin" | "analyst" | "viewer";

export type Organization = { id: number; name: string; role: OrgRole };

/** A workspace's white-label settings (public: shown on embeds and shared dashboards). */
export type Branding = {
  name: string;
  color: string | null;
  logo_url: string | null;
  hide_powered_by: boolean;
};

export type OrganizationBilling = {
  id: number;
  name: string;
  branding?: Branding;
  billing_email: string | null;
  plan: Plan;
  plan_status: PlanStatus;
  trial_ends_at: string | null;
  subscribed_at: string | null;
  current_period_end: string | null;
  billing_interval: BillingInterval;
};

export type OrganizationMember = { id: number; name: string; email: string; role: OrgRole };

export type AuditLog = {
  id: number;
  action: string;
  description: string;
  ip_address: string | null;
  created_at: string;
  user: { id: number; name: string; email: string } | null;
};

export type RowFilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains";

export type RowLevelPolicy = {
  id: number;
  dataset_id: number;
  role: "admin" | "analyst" | "viewer";
  field: string;
  operator: RowFilterOperator;
  value: string;
  creator: { id: number; name: string; email: string } | null;
};

export type DataQualityReport = {
  total_rows: number;
  duplicate_row_count: number;
  columns: { name: string; missing_count: number; missing_pct: number }[];
  summary: string | null;
};

export type AdminStats = {
  users: number;
  admins: number;
  referred_users: number;
  dashboards: number;
  shared_dashboards: number;
  data_sources: number;
  mysql_data_sources: number;
  new_users_last_7_days: number;
  free_users: number;
  growth_users: number;
  business_users: number;
  past_due_users: number;
  trialing_users: number;
  total_revenue_ngn_kobo: number;
  total_revenue_usd_cents: number;
  payments_this_month_ngn_kobo: number;
  payments_this_month_usd_cents: number;
  payments_configured: boolean;
};

export type AdminUser = User & {
  created_at: string;
  dashboards_count: number;
  data_sources_count: number;
  referrals_count: number;
  last_active_at?: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
};

export type HealthCheck = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string };

export type AdminAction = {
  id: number;
  action: string;
  description: string;
  target_type: string | null;
  target_id: number | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  admin: { id: number; name: string; email?: string } | null;
};

export type AdminOverview = {
  kpis: {
    users: number;
    users_new_7d: number;
    users_active_7d: number;
    suspended: number;
    workspaces: number;
    paying_workspaces: number;
    dashboards: number;
    data_sources: number;
    rows_stored: number;
    ai_conversations: number;
    company_shares: number;
    embeds: number;
    comments: number;
  };
  signups_30d: { date: string; signups: number }[];
  plan_mix: { plan: Plan; workspaces: number }[];
  recent_users: { id: number; name: string; email: string; created_at: string; last_active_at: string | null; is_admin: boolean; suspended_at: string | null }[];
  recent_actions: AdminAction[];
  health: HealthCheck[];
};

export type AdminUserDetail = {
  user: { id: number; name: string; email: string; is_admin: boolean; created_at: string; last_active_at: string | null; suspended_at: string | null; suspended_reason: string | null };
  workspaces: { id: number; name: string; role: OrgRole; plan: Plan; plan_status: string }[];
  counts: { dashboards: number; data_sources: number; ai_conversations: number; comments: number; active_sessions: number };
  recent_activity: { id: number; action: string; description: string; created_at: string }[];
};

export type AdminWorkspace = {
  id: number;
  name: string;
  brand_name: string | null;
  billing_email: string | null;
  plan: Plan;
  plan_status: string;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  members_count: number;
  dashboards_count: number;
  data_sources_count: number;
  owner: { id: number; name: string; email: string } | null;
};

export type AdminSubscription = OrganizationBilling & {
  members_count: number;
  lifetime_paid_ngn_kobo: number | null;
  lifetime_paid_usd_cents: number | null;
};

export type AdminPayment = {
  id: number;
  plan: Plan;
  amount: number;
  currency: string;
  status: "success" | "failed";
  created_at: string;
  /** null for an automated renewal charge — no human initiated it. */
  user: { id: number; name: string; email: string } | null;
  organization: { id: number; name: string } | null;
};

export type ReferralsSummary = {
  referral_code: string;
  referral_count: number;
  referrals: { id: number; name: string; created_at: string }[];
};

export type LandingHero = {
  headline_prefix: string;
  headline_highlight: string;
  headline_suffix: string;
  subheadline: string;
};

export type LandingStat = { value: string; label: string };
export type LandingStep = { title: string; description: string };
export type LandingFeature = { icon: string; title: string; description: string };
export type LandingFaq = { question: string; answer: string };

export type PricingTier = {
  plan: Plan;
  name: string;
  amount_kobo: number;
  amount_usd_cents: number;
  amount_kobo_yearly: number;
  amount_usd_cents_yearly: number;
  period: string;
  tagline: string;
  highlighted: boolean;
  features: string[];
};

export type SiteSettings = {
  landing_hero: LandingHero;
  landing_stats: LandingStat[];
  landing_steps: LandingStep[];
  landing_features: LandingFeature[];
  landing_faqs: LandingFaq[];
  pricing_tiers: PricingTier[];
};

export type RestApiHeader = { key: string; value: string };
export type RestApiAuthType = "none" | "bearer" | "basic" | "api_key";

export type DataSourceConnection = {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  table?: string | null;
  query?: string | null;
  // REST API fields — present only when type === "rest_api".
  url?: string;
  method?: "GET" | "POST";
  headers?: RestApiHeader[];
  auth_type?: RestApiAuthType;
  auth_header_name?: string;
  basic_username?: string;
  json_path?: string;
  body?: string;
};

export type DatabaseDriver = "mysql" | "postgres" | "sqlserver";

export type DataSource = {
  id: number;
  name: string;
  type: "csv" | DatabaseDriver | "rest_api";
  status: "pending" | "syncing" | "ready" | "failed";
  error_message: string | null;
  last_synced_at: string | null;
  datasets_count?: number;
  connection?: DataSourceConnection | null;
};

export type MysqlTable = { table: string; columns: string[] };

export type DatasetColumn = { name: string; label: string };

export type Dataset = {
  id: number;
  name: string;
  columns: DatasetColumn[];
  row_count: number;
  data_source?: { id: number; name: string; type: string };
};

export type PipelineStepType = "source" | "join" | "filter" | "rename" | "select" | "derive";
export type JoinType = "inner" | "left";
export type DeriveOperator = "+" | "-" | "*" | "/";

export type PipelineStep = {
  type: PipelineStepType;
  dataset_id?: number;
  left_field?: string;
  right_field?: string;
  join_type?: JoinType;
  prefix?: string;
  field?: string;
  operator?: string;
  value?: string;
  fields?: string[];
  from?: string;
  to?: string;
  name?: string;
  constant?: number;
};

export type DataModelSchedule = "manual" | "hourly" | "daily";
export type DataModelStatus = "pending" | "running" | "ready" | "failed";

export type DataModel = {
  id: number;
  name: string;
  pipeline: PipelineStep[];
  schedule: DataModelSchedule;
  status: DataModelStatus;
  error_message: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  output_dataset: { id: number; name: string; row_count: number; columns: DatasetColumn[] } | null;
};

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "kpi"
  | "scatter"
  | "heatmap"
  | "geo_map"
  | "gauge"
  | "list"
  | "funnel"
  | "treemap"
  | "radar"
  | "feed";

/** `in` takes a list (multi-select slicer); every other operator takes a single value. */
export type ChartFilter = { field: string; operator: string; value: string | string[] };

export type BarVariant = "vertical" | "horizontal" | "stacked" | "grouped" | "percent";
export type LineVariant = "straight" | "smooth" | "area";
export type PieVariant = "pie" | "donut";
export type KpiVariant = "number" | "sparkline" | "progress" | "tile";

export type ColorRule = { operator: "gte" | "lte"; value: number; color: string };

export type ChartStyle = {
  x_axis_label?: string;
  y_axis_label?: string;
  show_legend?: boolean;
  show_data_labels?: boolean;
  show_gridlines?: boolean;
  sort?: "none" | "asc" | "desc";
  /** @deprecated use variant: "donut" — kept so charts saved before variants existed still render correctly. */
  donut?: boolean;
  /** @deprecated use variant: "smooth" | "straight" — kept for the same reason. */
  smooth?: boolean;
  show_points?: boolean;
  colors?: string[];
  variant?: BarVariant | LineVariant | PieVariant | KpiVariant;
  /** Bar/line only: overlays a linear-regression trendline. */
  show_trendline?: boolean;
  /** Bar/line only: displays a running total instead of the raw per-category value. */
  transform?: "none" | "cumulative";
  /** Bar (single-series) and KPI: colors the bar/number by which threshold rule it matches, first match wins. */
  color_rules?: ColorRule[];
};

export type Chart = {
  id: number;
  dashboard_id: number;
  dataset_id: number;
  title: string;
  type: ChartType;
  config: {
    x_field?: string;
    y_field?: string;
    agg?: string;
    /** Bar/line/radar: splits each x_field category into several series. Feed: the status shown on each item. */
    series_field?: string;
    /** Table only: which columns to show, in order (absent = all). */
    columns?: string[];
    /** Table only: server-side row order. */
    sort_field?: string;
    sort_dir?: "asc" | "desc";
    /** Feed only: how many items to show. */
    limit?: number;
    /** Buckets a date x_field (or a KPI's trend field) by day/month/quarter/year. */
    x_grain?: "day" | "month" | "quarter" | "year";
    /** Heatmap only: the measured field (y_field is the row dimension there). */
    value_field?: string;
    /** Scatter only: optional field shown in point tooltips. */
    label_field?: string;
    /** KPI only: target value the "progress" variant compares the headline number against. */
    target?: number;
    /** Line only: number of future periods to project via linear regression (0/absent = off). */
    forecast_periods?: number;
    format?: "number" | "currency" | "percent";
    currency?: string;
    style?: ChartStyle;
  };
  filters: ChartFilter[] | null;
  position: { x: number; y: number; w: number; h: number } | null;
  dataset?: Dataset;
};

export type DashboardRole = "owner" | "editor" | "viewer";

export type Dashboard = {
  id: number;
  name: string;
  description: string | null;
  charts?: Chart[];
  charts_count?: number;
  share_token?: string | null;
  is_shared?: boolean;
  role?: DashboardRole;
  /** Presentation settings; slicers are the fields shown in the dashboard's filter panel. */
  settings?: { slicers?: { field: string }[] } | null;
  /** When the freshest dataset behind the dashboard last changed. */
  data_refreshed_at?: string | null;
  /** Set when another company owns this dashboard and shared it with you: that company's name. */
  shared_by?: string | null;
  /** That company's branding (logo shown beside "Shared with you by…"). */
  shared_by_branding?: Branding | null;
  /** Managers, or an admin of a partner company it was shared with, can embed it elsewhere. */
  can_embed?: boolean;
  /** Public pages: the owning company's look. */
  branding?: Branding | null;
  created_at?: string;
  updated_at?: string;
};

export type DashboardTemplate = { key: string; name: string; icon: string; description: string };

export type AiDashboardChart = {
  chart_title: string;
  chart_type: ChartType;
  chart_config: Record<string, string>;
  chart_data: ChartData | null;
};

export type AiMessage = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  response_type: "answer" | "chart" | "dashboard" | null;
  chart_title: string | null;
  chart_type: ChartType | null;
  chart_config: Record<string, string> | null;
  chart_data: ChartData | null;
  analysis: string | null;
  chart_id: number | null;
  dashboard_title: string | null;
  dashboard_charts: AiDashboardChart[] | null;
  dashboard_id: number | null;
  /** Suggested next questions the assistant offers under its reply. */
  follow_ups?: string[] | null;
  created_at: string;
};

export type AiConversation = {
  id: number;
  user_id: number;
  dataset_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages_count?: number;
  dataset?: { id: number; name: string };
  messages?: AiMessage[];
};

export type Collaborator = {
  id: number;
  dashboard_id: number;
  user_id: number;
  role: "viewer" | "editor";
  user: { id: number; name: string; email: string };
};

export type Alert = {
  id: number;
  chart_id: number;
  condition: "above" | "below" | "anomaly";
  threshold: number | null;
  sensitivity: number | null;
  is_active: boolean;
  last_status: "ok" | "breached" | null;
  last_value: number | null;
  last_checked_at: string | null;
  chart?: { id: number; title: string; dashboard_id: number; dashboard?: { id: number; name: string } };
};

export type Goal = {
  id: number;
  chart_id: number;
  name: string;
  direction: "increase" | "decrease";
  starting_value: number | null;
  target_value: number;
  deadline: string | null;
  last_value: number | null;
  last_checked_at: string | null;
  progress_percent: number | null;
  is_achieved: boolean;
  chart?: { id: number; title: string; dashboard_id: number };
};

export type ReportSchedule = {
  id: number;
  dashboard_id: number;
  recipients: string[];
  frequency: "daily" | "weekly";
  day_of_week: number | null;
  time_of_day: string;
  last_sent_at: string | null;
  next_run_at: string | null;
};

export type ChartSeries = { name: string; values: number[] };
export type ScatterPoint = { x: number; y: number; label?: string };
export type HeatmapCell = { x: string; y: string; value: number };

export type ChartData =
  | { labels: string[]; values: number[]; forecast?: { labels: string[]; values: number[] } }
  | { labels: string[]; series: ChartSeries[] }
  | { value: number; trend?: { labels: string[]; values: number[] } }
  | { columns: string[]; rows: Record<string, unknown>[] }
  | { points: ScatterPoint[] }
  | { x_labels: string[]; y_labels: string[]; cells: HeatmapCell[] }
  | { items: FeedItem[] };

/** One row of an activity feed: newest first. */
export type FeedItem = { at: string; title: string; tag?: string; value?: number };
