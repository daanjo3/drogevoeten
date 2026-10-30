import type { Route } from "./+types/item";

export default function Item({ params }: Route.ComponentProps) {
  return (
    <main>
      <h1>Item {params.id}</h1>
    </main>
  );
}
