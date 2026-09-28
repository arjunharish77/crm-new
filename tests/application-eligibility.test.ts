import { describe,it,expect } from 'vitest';
import {eligibilityFactsSchema,evaluateApplicationEligibility} from '../src/lib/application-eligibility';
const empty=eligibilityFactsSchema.parse({});const rule={id:'r',name:'Entry',minEducationLevel:'CLASS_12',minPercentage:'60',requiredEntranceExam:'Exam A',criteria:{}};
const facts=eligibilityFactsSchema.parse({educationLevel:'BACHELORS',percentage:60,entranceExams:[' exam a '],examInformationProvided:true});
describe('explainable eligibility',()=>{
 it('does not pass absent rules',()=>expect(evaluateApplicationEligibility(empty,[]).status).toBe('NOT_CONFIGURED'));
 it('requires missing facts',()=>expect(evaluateApplicationEligibility(empty,[rule]).checks.map(c=>c.status)).toEqual(['NEEDS_INFO','NEEDS_INFO','NEEDS_INFO']));
 it('passes exact marks boundary and case-insensitive exam names',()=>expect(evaluateApplicationEligibility(facts,[rule]).status).toBe('MET'));
 it('fails below the marks boundary',()=>expect(evaluateApplicationEligibility({...facts,percentage:59.99},[rule]).status).toBe('NOT_MET'));
 it('fails education below the configured minimum',()=>expect(evaluateApplicationEligibility({...facts,educationLevel:'CLASS_10'},[rule]).checks[0].status).toBe('NOT_MET'));
 it('distinguishes unknown exams from confirmed none',()=>{expect(evaluateApplicationEligibility({...facts,entranceExams:[],examInformationProvided:false},[rule]).status).toBe('NEEDS_INFO');expect(evaluateApplicationEligibility({...facts,entranceExams:[]},[rule]).status).toBe('NOT_MET');});
 it('requires manual review for unknown qualifications',()=>expect(evaluateApplicationEligibility(facts,[{...rule,minEducationLevel:'Diploma'}]).status).toBe('MANUAL_REVIEW'));
 it('does not ignore custom criteria',()=>expect(evaluateApplicationEligibility(facts,[{...rule,criteria:{nationality:'IN'}}]).status).toBe('MANUAL_REVIEW'));
 it('does not pass an empty rule',()=>expect(evaluateApplicationEligibility(facts,[{id:'empty',name:'Empty',criteria:{}}]).status).toBe('MANUAL_REVIEW'));
 it.each([-1,101,'invalid'])('requires review for invalid configured percentage %s',minPercentage=>expect(evaluateApplicationEligibility(facts,[{...rule,minPercentage}]).status).toBe('MANUAL_REVIEW'));
 it('does not treat zero marks as missing',()=>expect(evaluateApplicationEligibility({...facts,percentage:0},[{id:'r',name:'Zero',minPercentage:0}]).status).toBe('MET'));
 it.each([-1,101,Infinity])('rejects invalid entered percentage %s',percentage=>expect(eligibilityFactsSchema.safeParse({percentage}).success).toBe(false));
});
