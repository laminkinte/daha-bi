import DashboardView from "./DashboardView";

export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DashboardView dashboardId={Number(id)} />;
}
