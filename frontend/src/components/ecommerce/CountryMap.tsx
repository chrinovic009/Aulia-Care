// react plugin for creating vector maps
import { VectorMap } from "@react-jvectormap/core";
import { worldMill } from "@react-jvectormap/world";

// Define the component props
interface CountryMapProps {
  mapColor?: string;
  markers?: Array<{
    latLng: [number, number];
    name: string;
    style?: Record<string, any>;
  }>;
}

const defaultMarkers = [
  {
    latLng: [-10.718, 25.468],
    name: "Hôpital Kolwezi - Aéroport",
    style: {
      fill: "#ef4444",
      r: 6,
      stroke: "#ffffff",
      strokeWidth: 2,
    },
  },
  {
    latLng: [-11.672, 27.483],
    name: "Patient - Joli Site (Gouvernorat)",
    style: {
      fill: "#2563eb",
      r: 6,
      stroke: "#ffffff",
      strokeWidth: 2,
    },
  },
];

const CountryMap: React.FC<CountryMapProps> = ({ mapColor, markers }) => {
  return (
    <VectorMap
      map={worldMill}
      backgroundColor="transparent"
      markerStyle={{
        initial: {
          fill: "#465FFF",
          r: 4,
        } as any,
      }}
      markersSelectable={true}
      markers={markers ?? defaultMarkers}
      zoomOnScroll={false}
      zoomMax={12}
      zoomMin={3}
      zoomAnimate={true}
      zoomStep={1.5}
      focusOn={{
        x: 0.55,
        y: 0.62,
        scale: 5,
        animate: false,
      }}

      regionStyle={{
        initial: {
          fill: mapColor || "#D0D5DD",
          fillOpacity: 0.35,
          fontFamily: "Outfit",
          stroke: "none",
          strokeWidth: 0,
          strokeOpacity: 0,
        },
        hover: {
          fillOpacity: 0.7,
          cursor: "pointer",
          fill: "#465fff",
          stroke: "none",
        },
        selected: {
          fill: "#465FFF",
        },
        selectedHover: {},
      }}
      regionLabelStyle={{
        initial: {
          fill: "#35373e",
          fontWeight: 500,
          fontSize: "13px",
          stroke: "none",
        },
        hover: {},
        selected: {},
        selectedHover: {},
      }}
    />
  );
};

export default CountryMap;
