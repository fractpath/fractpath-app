import { MyThreadsList } from "@/components/threads/MyThreadsList";

export default function MyThreadsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">My Threads</h1>
      <MyThreadsList />
    </div>
  );
}
