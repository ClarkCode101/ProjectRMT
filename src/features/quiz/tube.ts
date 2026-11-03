// Small helpers shared by the tube pictures on Practice (the rack and the subject popup).
export type TubeStatus = 'low' | 'passing' | 'new'

export function tubeStatus(accuracy: number | null, belowPassing: boolean): TubeStatus {
  return accuracy === null ? 'new' : belowPassing ? 'low' : 'passing'
}
