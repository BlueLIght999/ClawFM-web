import { attributeBadCases } from '../domain/evaluation/badCaseAttribution.js';
import { badCaseEvalSet } from './badCaseEvalSet.js';

const report = attributeBadCases(badCaseEvalSet);

console.log(JSON.stringify(report, null, 2));
