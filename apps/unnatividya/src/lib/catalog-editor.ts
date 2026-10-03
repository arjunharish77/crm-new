export const editorialListFields = ["specializations", "careerRoles", "approvals", "sourceUrls"] as const;

// Normalize exposed line lists and curriculum subjects; preserve other structured fields.
export function normalizeEditorialContent(value:Record<string,unknown>) {
  if(!value || typeof value!=="object" || Array.isArray(value)) return value;
  if(!value.data || typeof value.data!=="object" || Array.isArray(value.data)) return value;
  const data={...value.data as Record<string,unknown>};
  for(const key of editorialListFields) if(Array.isArray(data[key])) {
    data[key]=(data[key] as unknown[]).map(item=>typeof item==="string"?item.trim():item).filter(item=>item!=="");
  }
  if(Array.isArray(data.curriculum)) data.curriculum=data.curriculum.map(item=>{
    if(!item || typeof item!=="object" || Array.isArray(item)) return item;
    const term=item as Record<string,unknown>;
    return {...term,...(typeof term.term==="string"?{term:term.term.trim()}:{}),
      ...(Array.isArray(term.subjects)?{subjects:term.subjects.map(subject=>typeof subject==="string"?subject.trim():subject).filter(subject=>subject!=="")}:{})};
  });
  return {...value,data};
}

const labels:Record<string,string>={dataQuality:"Verification status",name:"Name",short_name:"Short name",fee_inr:"Total tuition fee (INR)",duration:"Duration",stream:"Stream",city:"City",
  eligibility:"Eligibility",specializations:"Specializations",careerRoles:"Career roles",sourceUrls:"Source links",about:"About the university",established:"Year established",
  approvals:"Approvals",overview:"Overview",emi:"EMI information",applicationFee:"Application fee",lastAdmissionDate:"Admission deadline",feePlans:"Payment plans",highlights:"Highlights",curriculum:"Curriculum"};
export function editorialFieldLabel(key:string) { return labels[key] || key.replaceAll("_"," "); }
export function editorialChanges(before:Record<string,unknown>,after:Record<string,unknown>) {
  const changes:Array<{key:string;label:string;before:unknown;after:unknown}>=[];
  for(const key of Object.keys(after)) {
    if(key==="data" && after.data && typeof after.data==="object" && !Array.isArray(after.data)) {
      const old=before.data && typeof before.data==="object" && !Array.isArray(before.data)?before.data as Record<string,unknown>:{};
      const next=after.data as Record<string,unknown>;
      for(const nested of new Set([...Object.keys(old),...Object.keys(next)])) if(JSON.stringify(old[nested])!==JSON.stringify(next[nested])) changes.push({key:`data.${nested}`,label:editorialFieldLabel(nested),before:old[nested],after:next[nested]});
    } else if(JSON.stringify(before[key])!==JSON.stringify(after[key])) changes.push({key,label:editorialFieldLabel(key),before:before[key],after:after[key]});
  }
  return changes;
}
export function editorialDisplay(value:unknown):string {
  if(value===undefined||value===null||value==="") return "Not set";
  if(typeof value==="string") return value;
  if(Array.isArray(value)&&value.every(item=>typeof item==="string")) return value.join("\n") || "None";
  if(Array.isArray(value)&&value.every(item=>Array.isArray(item)&&item.every(cell=>typeof cell==="string"))) return value.map(row=>(row as string[]).join(" · ")).join("\n") || "None";
  if(Array.isArray(value)&&value.every(item=>item && typeof item==="object" && typeof item.term==="string" && Array.isArray(item.subjects) && item.subjects.every((subject:unknown)=>typeof subject==="string"))) {
    return value.map(item=>{
      const extra=Object.fromEntries(Object.entries(item).filter(([key])=>key!=="term"&&key!=="subjects"));
      return `${item.term}\n${item.subjects.map((subject:string)=>`• ${subject}`).join("\n")}${Object.keys(extra).length?`\nAdditional fields: ${JSON.stringify(extra,null,2)}`:""}`;
    }).join("\n\n") || "None";
  }
  if(value && typeof value==="object" && !Array.isArray(value) && Object.values(value).length && Object.values(value).every(item=>item==="verified"||item==="generic")) {
    return Object.entries(value).map(([key,item])=>`${editorialFieldLabel(key)}: ${item==="verified"?"Marked verified":"Needs verification"}`).join("\n");
  }
  return JSON.stringify(value,null,2);
}

export function updateEditorialField(content:Record<string,unknown>,key:string,next:unknown,nested=false) {
  if(!nested) return {...content,[key]:next};
  const data={...(content.data as Record<string,unknown>),[key]:next};
  if(["applicationFee","lastAdmissionDate"].includes(key) && next==="") delete data[key];
  if(["eligibility","specializations","careerRoles","lastAdmissionDate","curriculum"].includes(key)) {
    const quality=data.dataQuality && typeof data.dataQuality==="object" && !Array.isArray(data.dataQuality)?data.dataQuality as Record<string,unknown>:{};
    data.dataQuality={...quality,[key]:"generic"};
  }
  return {...content,data};
}
