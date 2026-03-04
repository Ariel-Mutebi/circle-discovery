export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Circle {
  center: LatLng;
  radius: number;
};

export interface Place {
  location?: LatLng;
}
