import { Suspense } from "react";

async function Ping() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ping`, { cache: "no-store" });
  const data: { message: string } = await res.json();
  return <>{data.message}</>;
}

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-2xl font-semibold">
        Backend says: <Suspense fallback="...">
          <Ping />
        </Suspense>
      </p>
    </main>
  );
}
