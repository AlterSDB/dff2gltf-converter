import { RwBone, RwFrame } from 'rw-parser';

export interface Bone {
  name: string;
  boneData: RwBone;
  frameData: RwFrame;
}

export function normalizeJoints(jointsData: number[], weightsData: number[]): number[] {
  if (jointsData.length != weightsData.length) {
    throw new Error('Length of joints and weights arrays is not equal.');
  }

  let normalizedJoints: number[] = [];
  for (let i = 0; i < jointsData.length; i += 4) {
    const weightsSubArr: number[] = [
      weightsData[i],
      weightsData[i + 1],
      weightsData[i + 2],
      weightsData[i + 3],
    ];
    let jointsSubArr: number[] = [
      jointsData[i],
      jointsData[i + 1],
      jointsData[i + 2],
      jointsData[i + 3],
    ];

    for (let j = 0; j < 4; j++) {
      if (weightsSubArr[j] == 0) {
        jointsSubArr[j] = 0;
      }
    }
    normalizedJoints.push(...jointsSubArr);
  }

  return normalizedJoints;
}

export function normalizeWeights(weightsData: number[]): number[] {
  const [w1, w2, w3, w4] = weightsData;
  const totalWeightSum = w1 + w2 + w3 + w4;
  const zeroThreshold = 0.000001;
  if (Math.abs(totalWeightSum) < zeroThreshold) {
    return [1.0, 0.0, 0.0, 0.0];
  }

  const inverseWeightSum = 1.0 / totalWeightSum;
  
  let normalizedWeight1 = w1 * inverseWeightSum;
  let normalizedWeight2 = w2 * inverseWeightSum;
  let normalizedWeight3 = w3 * inverseWeightSum;
  
  let normalizedWeight4 = 1.0 - (normalizedWeight1 + normalizedWeight2 + normalizedWeight3);

  if (normalizedWeight1 < 0 && normalizedWeight1 > -zeroThreshold) normalizedWeight1 = 0;
  if (normalizedWeight2 < 0 && normalizedWeight2 > -zeroThreshold) normalizedWeight2 = 0;
  if (normalizedWeight3 < 0 && normalizedWeight3 > -zeroThreshold) normalizedWeight3 = 0;
  if (normalizedWeight4 < 0 && normalizedWeight4 > -zeroThreshold) normalizedWeight4 = 0;

  const finalWeightSum = normalizedWeight1 + normalizedWeight2 + normalizedWeight3 + normalizedWeight4;
  const normalizationThreshold = 0.00001;
  
  if (Math.abs(finalWeightSum - 1.0) > normalizationThreshold) {
    const finalInverseSum = 1.0 / finalWeightSum;
    normalizedWeight1 *= finalInverseSum;
    normalizedWeight2 *= finalInverseSum;
    normalizedWeight3 *= finalInverseSum;
    normalizedWeight4 *= finalInverseSum;
  }
  
  return [normalizedWeight1, normalizedWeight2, normalizedWeight3, normalizedWeight4];
}
