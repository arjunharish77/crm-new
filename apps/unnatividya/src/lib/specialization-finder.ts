// Wave 5 B5: the specialization finder. A career area matches the specializations and the career
// roles the universities list, by their own names. It never ranks programs or says which is better;
// the page states that matches are by name.

export type CareerArea = { id: string; label: string; specializations: RegExp; roles: RegExp };

export const CAREER_AREAS: CareerArea[] = [
  { id: "finance", label: "Finance, banking and accounting", specializations: /financ|account|bank|bfsi|fintech|acca|tax|insurance/i, roles: /financ|account|audit|tax|bank|fintech/i },
  { id: "marketing", label: "Marketing, sales and e-commerce", specializations: /marketing|sales|e-commerce|retail/i, roles: /marketing|sales|retail|account executive|customer success/i },
  { id: "data", label: "Data, analytics and AI", specializations: /data|analytics|\bai\b|machine learning|artificial|computational|spreadsheet/i, roles: /data|machine learning|business analyst|statistician/i },
  { id: "software", label: "Software, cloud and security", specializations: /software|cloud|cyber|security|systems|information system|information technology|\bit\b|blockchain|emerging tech/i, roles: /software|developer|cloud|cyber|qa analyst|systems analyst|technical support|database|engineer/i },
  { id: "people", label: "People, HR and leadership", specializations: /\bhr\b|hrm|human resource|leadership/i, roles: /\bhr\b|team lead|management trainee/i },
  { id: "operations", label: "Operations, supply chain and projects", specializations: /operations|supply chain|project|production|construction/i, roles: /operations|program associate/i },
  { id: "business", label: "Business, entrepreneurship and international trade", specializations: /entrepreneur|international business|general management|family business|travel|tourism/i, roles: /business|international|product manager/i },
  { id: "healthcare", label: "Healthcare management", specializations: /health|hospital/i, roles: /health|hospital/i },
  { id: "media", label: "Media, writing and languages", specializations: /journalism|mass communication|^english$/i, roles: /content|editor|community manager|public affairs|journalist|pr executive|media planner/i },
  { id: "policy", label: "Public policy, economics and social sciences", specializations: /econom|policy|political|sociology|urban|administrative/i, roles: /policy|econom|social|civil services|research/i },
  { id: "teaching", label: "Teaching, research and mathematics", specializations: /mathematics|econometrics/i, roles: /teacher|research|statistician|actuary/i },
];

// Language-of-instruction options ("Hindi Medium") and "General" are not career specializations.
export const NOT_A_SPECIALIZATION = /\bmedium$|^general$/i;

export type FinderSpecialization = { slug: string; specialization: string; courseLabel: string; level: string; universities: string[] };
export type FinderProgram = { slug: string; name: string; university: string; level: string; roles: string[] };

export function matchArea(area: CareerArea, specializations: FinderSpecialization[], programs: FinderProgram[], level: string) {
  const inLevel = (item: { level: string }) => !level || item.level === level;
  return {
    specializations: specializations.filter(item => inLevel(item) && !NOT_A_SPECIALIZATION.test(item.specialization) && area.specializations.test(item.specialization))
      .sort((a, b) => a.courseLabel.localeCompare(b.courseLabel) || a.specialization.localeCompare(b.specialization)),
    programs: programs.filter(inLevel).map(item => ({ ...item, roles: item.roles.filter(role => area.roles.test(role)) })).filter(item => item.roles.length)
      .sort((a, b) => a.name.localeCompare(b.name) || a.university.localeCompare(b.university)),
  };
}
