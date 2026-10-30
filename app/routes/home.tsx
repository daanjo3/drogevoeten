import { Link } from "react-router";

export default function Home() {
  return (
    <main>
      <h1>Droge Voeten</h1>
      <Link to="/item/example">Voorbeeld</Link>
    </main>
  );
}
