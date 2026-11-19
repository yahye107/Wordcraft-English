import Link from "next/link";
import ImportForm from "@/components/notebook/ImportForm";

export const metadata = { title: "Import notes" };

export default function ImportPage() {
  return (
    <div className="reading">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/notebook">Notebook</Link>
      </nav>
      <h1>Import notes</h1>
      <p className="lede">
        Bring in the words you highlighted while reading. Choose an Obsidian note that contains PDF highlights, or paste its text.
        Your spelling and wording are kept exactly as you wrote them.
      </p>
      <ImportForm />
    </div>
  );
}
