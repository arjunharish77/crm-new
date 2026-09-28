import { z } from 'zod';
const template = z.string().max(60).refine(value => /^[A-Za-z0-9{}_-]*$/.test(value) && !/\{[^}]*\}/.test(value.replaceAll('{YYYY}', '').replaceAll('{FY}', '')) && !/[{}]/.test(value.replaceAll('{YYYY}', '').replaceAll('{FY}', '')), 'Use letters, digits, hyphens, underscores, {YYYY} and {FY} only');
export const applicationRuleSchema = z.object({
    universityId: z.string().min(1).max(100).nullable().default(null),
    opportunityTypeId: z.string().min(1).max(100).nullable().default(null),
    intakeId: z.string().min(1).max(100).nullable().default(null),
    prefix: template.default('APP-{YYYY}-'), suffix: template.default(''),
    padding: z.number().int().min(1).max(12).default(6),
    financialYearStartMonth: z.number().int().min(1).max(12).default(4),
    timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid timezone').default('Asia/Kolkata'),
});
export type ApplicationNumberRule = z.infer<typeof applicationRuleSchema>;
export const defaultApplicationRule = applicationRuleSchema.parse({});
export function formatApplicationNumber(rule: ApplicationNumberRule, sequence: string, now: Date) {
    if (!/^[1-9][0-9]*$/.test(sequence)) throw new Error('Invalid application sequence');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: rule.timezone, year: 'numeric', month: 'numeric' }).formatToParts(now);
    const year = Number(parts.find(p => p.type === 'year')!.value);
    const month = Number(parts.find(p => p.type === 'month')!.value);
    const start = month < rule.financialYearStartMonth ? year - 1 : year;
    const expand = (text: string) => text.replaceAll('{YYYY}', String(year)).replaceAll('{FY}', `${start}-${String(start + 1).slice(-2)}`);
    return `${expand(rule.prefix)}${sequence.padStart(rule.padding, '0')}${expand(rule.suffix)}`;
}
