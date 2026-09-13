"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export const userLocationIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,0.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8],
});

export interface MapViewControllerProps {
  center: [number, number];
  zoom?: number;
}

export default function MapViewController({ center, zoom }: MapViewControllerProps) {
  const map = useMap();

  const lat = center ? center[0] : undefined;
  const lng = center ? center[1] : undefined;

  useEffect(() => {
    if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 1.2 });
    }
  }, [lat, lng, zoom, map]);

  return null;
}
