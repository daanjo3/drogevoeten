import { useEffect, type CSSProperties, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type MapProps = {
    center?: [number, number];
    zoom?: number;
    className?: string;
    style?: CSSProperties;
    // react-leaflet children such as <Marker>, <GeoJSON>, <Popup>
    children?: ReactNode;
};

const tilesetOpenStreetMap = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tilesetPdok = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png'

// MapContainer only reads center/zoom on mount; this keeps the view in sync with props.
function SyncView({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [map, center[0], center[1], zoom]);
    return null;
}

export default function LeafletMap({ center, zoom, className, style = { height: 400 }, children }: Required<Pick<MapProps, "center" | "zoom">> & MapProps) {
    return (
        <MapContainer center={center} zoom={zoom} className={className} style={style}>
            <TileLayer
                url={tilesetPdok}
                maxZoom={19}
                attribution='&copy; <a href="https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-">Basisregistratie Topografie</a>'
            />
            <SyncView center={center} zoom={zoom} />
            {children}
        </MapContainer>
    );
}
