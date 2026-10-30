import L from "leaflet"
import "leaflet/dist/leaflet.css"

const tilesetOpenStreetMap = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tilesetPdok = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png'

export function render() {
    const map = L.map('map').setView([51.4903637,3.6345316], 14);

    const tiles = L.tileLayer(tilesetPdok, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-">Basisregistratie Topografie</a>'
    }).addTo(map);
}