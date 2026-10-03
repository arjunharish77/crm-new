"use client";
import { loadPreparedFeeCorrection, type PreparedFeeCorrection } from "@/lib/prepared-fee-correction";
import { PreparedEligibilityPanel } from "@/components/prepared-eligibility-panel";
import type { PreparedEligibility } from "@/lib/prepared-eligibility";
import { useState } from "react";
import { loadPreparedCurriculum, type PreparedCurriculumDraft } from "@/lib/prepared-curriculum";
import { updateEditorialField } from "@/lib/catalog-editor";
import type { CatalogEntityType } from "@/lib/catalog-revisions";

export function CatalogContentEditor({entityType,value,onChange,disabled,curriculumDraft,feeCorrection,eligibilityDraft,allowIncomplete=false}:{allowIncomplete?:boolean;eligibilityDraft?:PreparedEligibility;feeCorrection?:PreparedFeeCorrection;curriculumDraft?:PreparedCurriculumDraft;entityType:CatalogEntityType;value:string;onChange:(value:string)=>void;disabled:boolean}) {
  const [feeLoaded,setFeeLoaded]=useState(false);
  const [draftLoaded,setDraftLoaded]=useState(false);
  let content:Record<string,unknown>={};let error="";
  try {
    const parsed=JSON.parse(value);
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||!parsed.data||typeof parsed.data!=="object"||Array.isArray(parsed.data)) error="Content and its data field must be JSON objects. Repair them in Advanced structured content.";
    else content=parsed;
  } catch {error="JSON is invalid. Repair it in Advanced structured content to use the labelled fields.";}
  const data=(content.data||{}) as Record<string,unknown>;
  const update=(key:string,next:unknown,nested=false)=>onChange(JSON.stringify(updateEditorialField(content,key,next,nested),null,2));
  function field(key:string,label:string,options:{nested?:boolean;multiline?:boolean;number?:boolean;required?:boolean;hint?:string}={}) {
    const current=(options.nested?data:content)[key];const id=`editor-${key}`;
    const props={id,value:current==null?"":String(current),required:options.required && (!allowIncomplete || ["name","short_name","stream"].includes(key)),disabled,"aria-describedby":options.hint?`${id}-hint`:undefined,
      onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>update(key,options.number?(event.target.value===""?null:Number(event.target.value)):event.target.value,options.nested)};
    return <div className={`field ${options.multiline?"admin-span-2":""}`} key={key}><label htmlFor={id}>{label}</label>
      {options.multiline?<textarea {...props} rows={3}/>:<input {...props} type={options.number?"number":"text"} min={options.number?1:undefined} step={options.number?1:undefined}/>}
      {options.hint?<small id={`${id}-hint`}>{options.hint}</small>:null}
    </div>;
  }
  function list(key:string,label:string,hint:string) {
    const current=Array.isArray(data[key])?(data[key] as unknown[]).map(String).join("\n"):"";
    return <div className="field admin-span-2" key={key}><label htmlFor={`editor-${key}`}>{label}</label><textarea id={`editor-${key}`} rows={4} value={current} disabled={disabled} aria-describedby={`editor-${key}-hint`} onChange={event=>update(key,event.target.value.split(/\r?\n/),true)}/><small id={`editor-${key}-hint`}>{hint}</small></div>;
  }
  function rows(key:string,label:string,columns:string[]) {
    const current=Array.isArray(data[key])?data[key] as unknown[]:[];
    const replace=(index:number,column:number,next:string)=>update(key,current.map((row,i)=>i===index?columns.map((_,j)=>j===column?next:(Array.isArray(row)?String(row[j]??""):"")):row),true);
    return <section className="editor-rows admin-span-2" aria-label={label}><h4>{label}</h4>
      {current.map((row,index)=><div className="editor-row" key={index}>
        {columns.map((column,j)=><div className="field" key={column}><label htmlFor={`editor-${key}-${index}-${j}`}>{column} {index+1}</label><input id={`editor-${key}-${index}-${j}`} value={Array.isArray(row)?String(row[j]??""):""} disabled={disabled} onChange={event=>replace(index,j,event.target.value)}/></div>)}
        <button type="button" className="btn ghost" disabled={disabled} aria-label={`Remove ${label.toLowerCase()} row ${index+1}`} onClick={()=>update(key,current.filter((_,i)=>i!==index),true)}>Remove</button>
      </div>)}
      <button type="button" className="btn ghost" disabled={disabled} onClick={()=>update(key,[...current,columns.map(()=>"")],true)}>Add {label.toLowerCase()} row</button>
    </section>;
  }
  function curriculum() {
    const terms=Array.isArray(data.curriculum)?data.curriculum as Array<Record<string,unknown>>:[];
    const malformed=(data.curriculum!==undefined && !Array.isArray(data.curriculum)) || terms.some(term=>!term || typeof term!=="object" || Array.isArray(term) || typeof term.term!=="string" || !Array.isArray(term.subjects) || term.subjects.some(subject=>typeof subject!=="string"));
    if(malformed) return <p className="admin-span-2" role="alert">The curriculum has an unsupported structure. Repair it in Advanced structured content before using the semester fields.</p>;
    const edit=(index:number,key:string,next:unknown)=>update("curriculum",terms.map((term,i)=>i===index?{...term,[key]:next}:term),true);
    const move=(index:number,offset:number)=>{
      const next=[...terms];[next[index],next[index+offset]]=[next[index+offset],next[index]];update("curriculum",next,true);
    };
    return <fieldset className="admin-form-grid admin-catalog-fields"><legend>Curriculum</legend>
      {curriculumDraft?<div className="admin-notice admin-span-2">
        <strong>Prepared semester overview</strong>
        <p>Source checked {curriculumDraft.checkedAt}. {curriculumDraft.scope}</p>
        <a href={curriculumDraft.sourceUrl} target="_blank" rel="noopener noreferrer">Open official program source</a>
        {curriculumDraft.notes.map(note=><p key={note}>{note}</p>)}
        <details><summary>Preview prepared outline</summary>{curriculumDraft.curriculum.map(term=><div key={term.term}><h4>{term.term}</h4><ul>{term.subjects.map((subject,index)=><li key={index}>{subject}</li>)}</ul></div>)}</details>
        <p>Loading replaces the outline in this unsaved proposal and adds its source link. Other fields are retained. It does not save, publish or verify the outline.</p>
        <button type="button" className="btn ghost" disabled={disabled||draftLoaded} onClick={()=>{onChange(JSON.stringify(loadPreparedCurriculum(content,curriculumDraft),null,2));setDraftLoaded(true);}}>Load prepared outline</button>
        {draftLoaded?<p role="status">Outline loaded into this proposal. Review all {curriculumDraft.curriculum.length} terms and add a review reason before submitting.</p>:null}
      </div>:null}
      <p className="admin-span-2">Use the official course syllabus and keep its semester order. Editing this outline marks it as needing verification. Add the official source link and explain the change before submitting for review.</p>
      {!terms.length?<p className="admin-span-2">No curriculum sections yet. Add a semester or term to start.</p>:null}
      {terms.map((term,index)=><section className="editor-curriculum-term admin-span-2" key={index} aria-label={`Curriculum section ${index+1}`}>
        <div className="field"><label htmlFor={`editor-term-${index}`}>Semester or term {index+1}</label><input id={`editor-term-${index}`} value={term.term as string} required disabled={disabled} onChange={event=>edit(index,"term",event.target.value)}/></div>
        <div className="field"><label htmlFor={`editor-subjects-${index}`}>Subjects for section {index+1}</label><textarea id={`editor-subjects-${index}`} value={(term.subjects as string[]).join("\n")} rows={4} required disabled={disabled} aria-describedby="curriculum-subjects-hint" onChange={event=>edit(index,"subjects",event.target.value.split(/\r?\n/))}/></div>
        <div className="editor-term-actions">
          <button type="button" className="btn ghost" disabled={disabled||index===0} aria-label={`Move curriculum section ${index+1} up`} onClick={()=>move(index,-1)}>Move up</button>
          <button type="button" className="btn ghost" disabled={disabled||index===terms.length-1} aria-label={`Move curriculum section ${index+1} down`} onClick={()=>move(index,1)}>Move down</button>
          <button type="button" className="btn ghost" disabled={disabled} aria-label={`Remove curriculum section ${index+1}`} onClick={()=>update("curriculum",terms.filter((_,i)=>i!==index),true)}>Remove</button>
        </div>
      </section>)}
      <small id="curriculum-subjects-hint" className="admin-span-2">One subject per line. Blank lines are removed when submitting; unshown fields are preserved.</small>
      <div className="admin-span-2"><button type="button" className="btn ghost" disabled={disabled} onClick={()=>update("curriculum",[...terms,{term:"",subjects:[]}],true)}>Add semester or term</button></div>
    </fieldset>;
  }
  return <div className="catalog-content-editor admin-span-2">
    {error?<p role="alert" className="admin-error">{error}</p>:<>
      <fieldset className="admin-form-grid admin-catalog-fields"><legend>Basic details</legend>
        {field("name",entityType==="course"?"Course name":"University name",{required:true})}
        {field("short_name","Short name",{required:true})}
        {entityType==="course"?<>
          {field("duration","Duration",{required:true,hint:"Use the official duration, for example 24 months."})}
          {field("stream","Stream",{required:true})}
          {eligibilityDraft?<PreparedEligibilityPanel draft={eligibilityDraft} content={content} onChange={onChange} disabled={disabled}/>:null}
          {field("eligibility","Eligibility",{nested:true,multiline:true,required:true})}
          {list("specializations","Specializations","One specialization per line. Blank lines are removed on submission.")}
          {list("careerRoles","Career roles","One role per line. Keep unverified outcome claims out of new content.")}
        </>:<>
          {field("city","Location",{required:true})}
          {field("established","Year established",{nested:true,number:true,required:true})}
          {field("about","About the university",{nested:true,multiline:true,required:true})}
          {list("approvals","Approvals and recognition","One item per line; verify the relevant regulator and admission cycle.")}
        </>}
      </fieldset>
      {entityType==="course"?<fieldset className="admin-form-grid admin-catalog-fields"><legend>Fees and admission</legend>
        {feeCorrection?<div className="admin-notice admin-span-2">
          <strong>Prepared fee correction</strong>
          <p>Source checked {feeCorrection.checkedAt}. Proposed base tuition: ₹{feeCorrection.fee.toLocaleString("en-IN")}.</p>
          <a href={feeCorrection.sourceUrl} target="_blank" rel="noopener noreferrer">Review official fee source</a>
          <ul>{feeCorrection.notes.map(note=><li key={note}>{note}</li>)}</ul>
          <button type="button" className="btn ghost" disabled={disabled||feeLoaded||content.fee_inr!==feeCorrection.expectedFee} onClick={()=>{onChange(JSON.stringify(loadPreparedFeeCorrection(content,feeCorrection),null,2));setFeeLoaded(true);}}>Load coordinated fee correction</button>
          {feeLoaded?<p role="status">Fee correction loaded into this proposal. Review the payment terms before submitting.</p>:content.fee_inr!==feeCorrection.expectedFee?<p>The proposed fee differs from this correction’s baseline. Review the fee manually.</p>:null}
        </div>:null}
        <p className="admin-span-2">Use official fee information. Changing tuition does not calculate discounts or financing terms; review the payment plans and highlights below too.</p>
        {field("fee_inr","Total tuition fee (INR)",{number:true,required:true})}
        {field("emi","EMI information",{nested:true,required:true})}
        {field("applicationFee","Application fee",{nested:true})}
        {field("lastAdmissionDate","Admission deadline",{nested:true,hint:"Use a sourced date or state that the current cycle needs checking."})}
        {rows("feePlans","Payment plans",["Plan name","Total fee","Payment terms"])}
        {rows("highlights","Highlights",["Label","Value"])}
      </fieldset>:null}
      {entityType==="course"?curriculum():null}
      <fieldset className="admin-form-grid admin-catalog-fields"><legend>Sources</legend>
        <p className="admin-span-2">Changing curriculum, eligibility, specializations, career roles or the admission deadline clears that section’s earlier verified marker. Review the new information against its sources.</p>
        {list("sourceUrls","Official source links","One complete https:// URL per line. Saving a URL does not mark the content as verified.")}
      </fieldset>
    </>}
    <details className="editor-advanced" open={error?true:undefined}><summary>Advanced structured content</summary>
      <p>Use this for FAQs and other fields not shown above. Unchanged fields are preserved. Identity and publication status are controlled separately.</p>
      <div className="field"><label htmlFor="revision-content">Proposed content (JSON)</label><textarea id="revision-content" rows={18} value={value} onChange={event=>onChange(event.target.value)} required disabled={disabled}/></div>
    </details>
  </div>;
}
