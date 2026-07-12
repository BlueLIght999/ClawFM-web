import { evaluateProductEffect } from '../domain/evaluation/productEffectMetrics.js';
import { productEffectEvalSet } from './productEffectEvalSet.js';

const report = evaluateProductEffect(productEffectEvalSet);

console.log(JSON.stringify(report, null, 2));
