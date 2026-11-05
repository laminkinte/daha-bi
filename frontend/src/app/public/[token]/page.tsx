import PublicDashboardView from "./PublicDashboardView";

export default async function PublicDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicDashboardView token={token} />;
}
