import { useParams } from "react-router";
import LeafletMap from "../components/leaflet-map";

const DUMMY_COORD: [number, number] = [51.4996239,3.6117399]
const DUMMY_ZOOM = 17

export default function Item() {
  const { id } = useParams();

  return (
    <main>
      <h1>Item {id}</h1>
      <LeafletMap
        center={DUMMY_COORD}
        zoom={DUMMY_ZOOM}
       />
    </main>
  );
}
