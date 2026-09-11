export interface YouBikeStation {
  id?: number;
  cityCode: string;
  stationNo: string;
  nameTw: string;
  districtTw: string;
  addressTw: string;
  lat: number;
  lng: number;
  totalSpaces: number;
  availableBikes: number;
  availableEbikes: number;
  emptySpaces: number;
  isActive: number;
  updatedAtSource: string;
  distanceKm?: number;
}
