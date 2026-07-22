import { AddWord } from "@/components/add-word";

export default function AddPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ajouter un mot</h1>
        <p className="text-sm text-foreground/55">
          Saisis un mot tel que tu l’as lu — fléchi ou non, avec ou sans accent — ou dicte une
          phrase à la voix.
        </p>
      </div>
      <AddWord />
    </div>
  );
}
