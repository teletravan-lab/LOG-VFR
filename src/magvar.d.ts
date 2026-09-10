declare module 'magvar' {
  export function magvar(latitude: number, longitude: number, altitudeKm?: number): number;
  export function magneticField(latitude: number, longitude: number, altitudeKm?: number): Record<string, number>;
  export const MODEL_EPOCH: number;
  export const MODEL_VALID_UNTIL: number;
}
