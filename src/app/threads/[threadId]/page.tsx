import { ThreadDetailView } from "@/components/threads/ThreadDetailView";

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default async function ThreadDetailPage({ params }: PageProps) {
  const { threadId } = await params;

  return <ThreadDetailView threadId={threadId} />;
}
