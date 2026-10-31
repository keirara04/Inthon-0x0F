import { Suspense } from "react";

async function Ping() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ping`, { cache: "no-store" });
  const data: { message: string } = await res.json();
  return <>{data.message}</>;
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-5xl font-bold">Inthon 2026</h1>
      <p className="text-2xl font-semibold">
        Backend says: <Suspense fallback="...">
          <Ping />
        </Suspense>
      </p>
    </main>
  );
}
