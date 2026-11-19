import type { AreaCoverage } from "@/lib/content/review";

const TARGET = 8;

/** How many entries each area has, so thin areas are easy to spot. */
export default function CoverageTable({ areas }: { areas: AreaCoverage[] }) {
  return (
    <table className="table coverage" data-testid="coverage">
      <caption className="visually-hidden">Entries per area</caption>
      <thead>
        <tr>
          <th scope="col">Area</th>
          <th scope="col">Published</th>
          <th scope="col">Draft</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {areas.map((a) => (
          <tr key={a.slug}>
            <th scope="row">{a.name}</th>
            <td>{a.published}</td>
            <td>{a.draft}</td>
            <td>
              {a.total}
              {a.total < TARGET && <span className="thin"> under {TARGET}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
