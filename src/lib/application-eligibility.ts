import { z } from 'zod';
export const educationLevels = [
    {id:'CLASS_10',name:'Class 10'}, {id:'CLASS_12',name:'Class 12'},
    {id:'BACHELORS',name:'Bachelor’s degree'}, {id:'MASTERS',name:'Master’s degree'}, {id:'DOCTORATE',name:'Doctorate'},
];
export const eligibilityFactsSchema=z.object({
    educationLevel:z.enum(['CLASS_10','CLASS_12','BACHELORS','MASTERS','DOCTORATE']).nullable().default(null),
    percentage:z.number().finite().min(0).max(100).nullable().default(null),
    entranceExams:z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    examInformationProvided:z.boolean().default(false),
    notes:z.string().trim().max(2000).default(''),
});
export type EligibilityFacts=z.infer<typeof eligibilityFactsSchema>;
export type EligibilityStatus='MET'|'NOT_MET'|'NEEDS_INFO'|'MANUAL_REVIEW'|'NOT_CONFIGURED';
const normalize=(value:string)=>value.trim().toUpperCase().replace(/[ _-]+/g,'');
function educationRank(value:string){return educationLevels.findIndex(level=>normalize(level.id)===normalize(value));}
export function evaluateApplicationEligibility(facts:EligibilityFacts,rules:any[]) {
    const checks:Array<{ruleId:string;ruleName:string;criterion:string;status:EligibilityStatus;detail:string}>=[];
    const add=(rule:any,criterion:string,status:EligibilityStatus,detail:string)=>checks.push({ruleId:rule.id,ruleName:rule.name,criterion,status,detail});
    for(const rule of rules){
        let supported=0;
        if(rule.minEducationLevel){supported++;const required=educationRank(rule.minEducationLevel);
            if(required<0)add(rule,'Education','MANUAL_REVIEW',`Unrecognized education requirement: ${rule.minEducationLevel}.`);
            else if(!facts.educationLevel)add(rule,'Education','NEEDS_INFO','Enter the qualifying education level.');
            else add(rule,'Education',educationRank(facts.educationLevel)>=required?'MET':'NOT_MET',`Minimum: ${educationLevels[required].name}; provided: ${educationLevels[educationRank(facts.educationLevel)].name}.`);
        }
        if(rule.minPercentage!==null&&rule.minPercentage!==undefined){supported++;const minimum=Number(rule.minPercentage);
            if(!Number.isFinite(minimum)||minimum<0||minimum>100)add(rule,'Marks','MANUAL_REVIEW','The configured minimum percentage is invalid.');
            else if(facts.percentage===null)add(rule,'Marks','NEEDS_INFO','Enter qualifying marks as a percentage.');
            else add(rule,'Marks',facts.percentage>=minimum?'MET':'NOT_MET',`Minimum: ${minimum}%; provided: ${facts.percentage}%.`);
        }
        if(rule.requiredEntranceExam){supported++;if(!facts.examInformationProvided)add(rule,'Entrance exam','NEEDS_INFO','Confirm the completed entrance-exam information.');
            else add(rule,'Entrance exam',facts.entranceExams.some(exam=>exam.trim().toLowerCase()===rule.requiredEntranceExam.trim().toLowerCase())?'MET':'NOT_MET',`Required completed exam: ${rule.requiredEntranceExam}.`);
        }
        const criteria=rule.criteria;
        if(criteria && (typeof criteria!=='object'||Array.isArray(criteria)||Object.keys(criteria).length))add(rule,'Additional conditions','MANUAL_REVIEW','This rule contains additional conditions that require manual review.');
        if(!supported)add(rule,'Rule configuration','MANUAL_REVIEW','No supported education, marks or entrance-exam requirement is configured.');
    }
    const status:EligibilityStatus=!rules.length?'NOT_CONFIGURED':checks.some(c=>c.status==='NOT_MET')?'NOT_MET':checks.some(c=>c.status==='MANUAL_REVIEW')?'MANUAL_REVIEW':checks.some(c=>c.status==='NEEDS_INFO')?'NEEDS_INFO':'MET';
    return {status,checks,ruleCount:rules.length};
}
