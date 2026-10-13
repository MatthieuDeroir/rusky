export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-sunk" />
      <div className="h-24 animate-pulse rounded-2xl bg-sunk" />
      <div className="h-40 animate-pulse rounded-2xl bg-sunk" />
    </div>
  );
}
