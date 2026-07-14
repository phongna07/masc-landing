import MailDetail from "./mail-detail";

export default async function AdminMailDetailPage({ params }: { params: Promise<{ mailId: string }> }) {
  const { mailId } = await params;
  return <MailDetail mailId={mailId} />;
}
