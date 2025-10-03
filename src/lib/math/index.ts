import { RatingCurveParams } from '@/types/math';
import LM from 'ml-levenberg-marquardt';

export function calibrateRatingCurve(H: number[], Q: number[]): RatingCurveParams {
  // Rating curve function
  const ratingCurve = (H: number, [a, b, h0]: number[]) => {
    return a * Math.pow(Math.max(H - h0, 0), b);
  };

  // Levenberg-Marquardt options
  const options = {
    damping: 1.5,
    initialValues: [50, 1.5, 0], // initial guess for a, b, h0
    gradientDifference: 1e-6,
    maxIterations: 100,
    errorTolerance: 1e-3,
  };

  // Fit the curve
  const fittedParams = LM(
    { x: H, y: Q },
    function ([a, b, h0]: number[]) {
      return (H: number) => a * Math.pow(Math.max(H - h0, 0), b);
    },
    options,
  );

  const [a, b, h0] = fittedParams.parameterValues;
  return { a, b, h0 };
}
