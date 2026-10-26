"use client";
import { loadPreparedFeeCorrection, type PreparedFeeCorrection } from "@/lib/prepared-fee-correction";
import { formatCategoryFee, loadPreparedCategoryFees, type PreparedCategoryFees } from "@/lib/prepared-category-fees";
import { loadPreparedRecognition, type PreparedRecognition } from "@/lib/prepared-recognition";
import { PreparedEligibilityPanel } from "@/components/prepared-eligibility-panel";
import type { PreparedEligibility } from "@/lib/prepared-eligibility";
import type { PreparedEligibilityRules } from "@/lib/prepared-eligibility-rules";
import { EligibilityRuleEditor } from "@/components/eligibility-rule-editor";
import { useState } from "react";
import { loadPreparedCurriculum, type PreparedCurriculumDraft } from "@/lib/prepared-curriculum";
import { loadPreparedProgramDetails, type PreparedProgramDetails } from "@/lib/prepared-program-details";
import { updateEditorialField } from "@/lib/catalog-editor";
import type { CatalogEntityType } from "@/lib/catalog-revisions";

export function CatalogContentEditor({entityType,value,onChange,disabled,curriculumDraft,programDetailsDraft,feeCorrection,categoryFeeDraft,recognitionDraft,eligibilityDraft,eligibilityRuleDraft,allowIncomplete=false}:{allowIncomplete?:boolean;categoryFeeDraft?:PreparedCategoryFees;recognitionDraft?:PreparedRecognition;eligibilityDraft?:PreparedEligibility;eligibilityRuleDraft?:PreparedEligibilityRules;feeCorrection?:PreparedFeeCorrection;curriculumDraft?:PreparedCurriculumDraft;programDetailsDraft?:PreparedProgramDetails;entityType:CatalogEntityType;value:string;onChange:(value:string)=>void;disabled:boolean}) {
  const [feeLoaded,setFeeLoaded]=useState(false);
  const [categoryLoaded,setCategoryLoaded]=useState(false);
  const [recognitionLoaded,setRecognitionLoaded]=useState(false);
  const [draftLoaded,setDraftLoaded]=useState(false);
  const [programDetailsLoaded,setProgramDetailsLoaded]=useState(false);
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
  // Wave 5 E1 (decision V11): student-category fees entered by hand, for example Amity's
  // international fees, which only show to visitors outside India. The catalog validator still
  // requires an INR row to equal the course fee; amounts are never converted between currencies.
  function categoryFeesEditor() {
    const current=data.categoryFees&&typeof data.categoryFees==="object"&&!Array.isArray(data.categoryFees)?data.categoryFees as Record<string,unknown>:null;
    const feeRows=Array.isArray(current?.rows)?current!.rows as Array<Record<string,unknown>>:[];
    const save=(next:Record<string,unknown>|null)=>update("categoryFees",next&&Array.isArray(next.rows)&&next.rows.length?next:undefined,true);
    const base=()=>current||{checkedAt:new Date().toISOString().slice(0,10),sourceUrl:"",sourceLabel:"",rows:[]};
    const editRow=(index:number,key:string,next:unknown)=>save({...base(),rows:feeRows.map((row,i)=>i===index?{...row,[key]:next}:row)});
    const num=(value:string)=>value===""?null:Number(value);
    return <section className="editor-rows admin-span-2" aria-label="Student-category fees"><h4>Student-category fees</h4>
      <p>Base tuition per applicant category, in the university&apos;s own currency, from an official page or prospectus. An Indian-applicant (INR) row must match the total tuition fee above. Visitors outside India see the NRI or international row first.</p>
      {current?<div className="editor-row">
        <div className="field"><label htmlFor="editor-cf-source">Official source URL</label><input id="editor-cf-source" type="url" value={String(current.sourceUrl??"")} disabled={disabled} onChange={event=>save({...base(),sourceUrl:event.target.value})} placeholder="https://…"/></div>
        <div className="field"><label htmlFor="editor-cf-label">Source label</label><input id="editor-cf-label" value={String(current.sourceLabel??"")} disabled={disabled} onChange={event=>save({...base(),sourceLabel:event.target.value})} placeholder="Amity international fee page, read 24 October 2026"/></div>
        <div className="field"><label htmlFor="editor-cf-checked">Checked on</label><input id="editor-cf-checked" type="date" value={String(current.checkedAt??"")} disabled={disabled} onChange={event=>save({...base(),checkedAt:event.target.value})}/></div>
      </div>:null}
      {feeRows.map((row,index)=><div className="editor-row" key={index}>
        <div className="field"><label htmlFor={`editor-cf-${index}-category`}>Applicant category {index+1}</label><input id={`editor-cf-${index}-category`} value={String(row.category??"")} disabled={disabled} onChange={event=>editRow(index,"category",event.target.value)} placeholder="International applicants"/></div>
        <div className="field"><label htmlFor={`editor-cf-${index}-currency`}>Currency {index+1}</label><select id={`editor-cf-${index}-currency`} value={String(row.currency??"USD")} disabled={disabled} onChange={event=>editRow(index,"currency",event.target.value)}><option value="INR">INR (₹)</option><option value="USD">USD (US$)</option></select></div>
        <div className="field"><label htmlFor={`editor-cf-${index}-total`}>Total {index+1}</label><input id={`editor-cf-${index}-total`} type="number" min={1} step={1} value={row.total==null?"":String(row.total)} disabled={disabled} onChange={event=>editRow(index,"total",num(event.target.value))}/></div>
        <div className="field"><label htmlFor={`editor-cf-${index}-semester`}>Per semester {index+1}</label><input id={`editor-cf-${index}-semester`} type="number" min={1} step={1} value={row.perSemester==null?"":String(row.perSemester)} disabled={disabled} onChange={event=>editRow(index,"perSemester",num(event.target.value))}/></div>
        <div className="field"><label htmlFor={`editor-cf-${index}-semesters`}>Semesters {index+1}</label><input id={`editor-cf-${index}-semesters`} type="number" min={1} step={1} value={row.semesters==null?"":String(row.semesters)} disabled={disabled} onChange={event=>editRow(index,"semesters",num(event.target.value))}/></div>
        <button type="button" className="btn ghost" disabled={disabled} aria-label={`Remove category fee row ${index+1}`} onClick={()=>save({...base(),rows:feeRows.filter((_,i)=>i!==index)})}>Remove</button>
      </div>)}
      <button type="button" className="btn ghost" disabled={disabled} onClick={()=>save({...base(),rows:[...feeRows,{category:"",currency:"USD",total:null,perSemester:null,semesters:null}]})}>Add category fee row</button>
    </section>;
  }
  // Confirmed intakes only (next-phase plan §3, UV01). Each one stops showing on the public page
  // the day after its application deadline, so no stale "last date" banner can linger.
  function intakes() {
    const current=Array.isArray(data.intakes)?data.intakes as Array<Record<string,unknown>>:[];
    const columns:Array<[string,string,string]>=[["label","Intake name","text"],["applicationDeadline","Apply by","date"],["sourceUrl","Official source URL","url"],["checkedAt","Checked on","date"]];
    const edit=(index:number,key:string,next:string)=>update("intakes",current.map((row,i)=>i===index?{...row,[key]:next}:row),true);
    return <section className="editor-rows admin-span-2" aria-label="Confirmed intakes"><h4>Confirmed intakes</h4>
      <p>Add an intake only when the university has published it. Without one, the course page says the next intake is not yet announced.</p>
      {current.map((row,index)=><div className="editor-row" key={index}>
        {columns.map(([key,label,type])=><div className="field" key={key}><label htmlFor={`editor-intake-${index}-${key}`}>{label} {index+1}</label><input id={`editor-intake-${index}-${key}`} type={type} value={String(row[key]??"")} required disabled={disabled} onChange={event=>edit(index,key,event.target.value)}/></div>)}
        <button type="button" className="btn ghost" disabled={disabled} aria-label={`Remove intake ${index+1}`} onClick={()=>update("intakes",current.filter((_,i)=>i!==index),true)}>Remove</button>
      </div>)}
      <button type="button" className="btn ghost" disabled={disabled} onClick={()=>update("intakes",[...current,{label:"",applicationDeadline:"",sourceUrl:"",checkedAt:""}],true)}>Add intake</button>
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
  function programDetails() {
    const labels = { study: "Classes and learning platform", assessment: "Assessment and exams", additionalCharges: "Charges beyond tuition", specialization: "Specialization choice" } as const;
    const current = data.programDetails && typeof data.programDetails === "object" && !Array.isArray(data.programDetails) ? data.programDetails as Record<string, unknown> : {};
    const malformed = Object.values(current).some(block => !block || typeof block !== "object" || Array.isArray(block));
    if (malformed) return <p className="admin-span-2" role="alert">Program detail blocks have an unsupported structure. Repair them in Advanced structured content.</p>;
    const edit = (key: keyof typeof labels, field: string, next: unknown) => {
      const block = current[key] as Record<string, unknown> | undefined;
      update("programDetails", { ...current, [key]: { ...block, [field]: next } }, true);
    };
    const remove = (key: keyof typeof labels) => {
      const next = { ...current }; delete next[key]; update("programDetails", next, true);
    };
    return <fieldset className="admin-form-grid admin-catalog-fields"><legend>Program-specific study and charges</legend>
      <p className="admin-span-2">Add only statements supported for this exact program. Each block needs its own official source, checked date and scope. Leave unknown details blank; the public page will show questions instead.</p>
      {programDetailsDraft ? <div className="admin-notice admin-span-2">
        <strong>Prepared online MBA details for review</strong>
        <p>{Object.keys(programDetailsDraft.programDetails).length} sourced blocks are available. Loading copies them into this unsaved proposal; it does not verify or publish them.</p>
        <ul>{programDetailsDraft.notes.map(note => <li key={note}>{note}</li>)}</ul>
        <button type="button" className="btn ghost" disabled={disabled || programDetailsLoaded} onClick={() => { onChange(JSON.stringify(loadPreparedProgramDetails(content, programDetailsDraft), null, 2)); setProgramDetailsLoaded(true); }}>Load prepared program details</button>
        {programDetailsLoaded ? <p role="status">Details loaded. Compare every statement with its linked official page before submitting.</p> : null}
      </div> : null}
      {(Object.entries(labels) as Array<[keyof typeof labels, string]>).map(([key, label]) => {
        const block = current[key] as Record<string, unknown> | undefined;
        return block ? <section className="editor-curriculum-term admin-span-2" key={key} aria-label={label}>
          <h4>{label}</h4>
          <div className="field"><label htmlFor={`editor-program-${key}-scope`}>Applies to</label><input id={`editor-program-${key}-scope`} value={String(block.scope || "")} required disabled={disabled} onChange={event => edit(key, "scope", event.target.value)} /></div>
          <div className="field"><label htmlFor={`editor-program-${key}-date`}>Source checked (YYYY-MM-DD)</label><input id={`editor-program-${key}-date`} type="date" value={String(block.checkedAt || "")} required disabled={disabled} onChange={event => edit(key, "checkedAt", event.target.value)} /></div>
          <div className="field admin-span-2"><label htmlFor={`editor-program-${key}-source`}>Official source URL</label><input id={`editor-program-${key}-source`} type="url" value={String(block.sourceUrl || "")} required disabled={disabled} onChange={event => edit(key, "sourceUrl", event.target.value)} /></div>
          <div className="field admin-span-2"><label htmlFor={`editor-program-${key}-points`}>Verified points, one per line</label><textarea id={`editor-program-${key}-points`} rows={4} value={Array.isArray(block.points) ? block.points.join("\n") : ""} required disabled={disabled} onChange={event => edit(key, "points", event.target.value.split(/\r?\n/).map(point => point.trim()).filter(Boolean))} /></div>
          <button type="button" className="btn ghost" disabled={disabled} onClick={() => remove(key)}>Remove block</button>
        </section> : <div className="admin-span-2" key={key}><button type="button" className="btn ghost" disabled={disabled} onClick={() => update("programDetails", { ...current, [key]: { scope: "", checkedAt: "", sourceUrl: "", points: [] } }, true)}>Add {label.toLowerCase()}</button></div>;
      })}
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
      {entityType === "course" ? <EligibilityRuleEditor content={content} onChange={onChange} disabled={disabled} draft={eligibilityRuleDraft} /> : null}
      {entityType==="course"?<fieldset className="admin-form-grid admin-catalog-fields"><legend>Fees and admission</legend>
        {feeCorrection?<div className="admin-notice admin-span-2">
          <strong>Prepared fee correction</strong>
          <p>Source checked {feeCorrection.checkedAt}. Proposed base tuition: ₹{feeCorrection.fee.toLocaleString("en-IN")}.</p>
          <a href={feeCorrection.sourceUrl} target="_blank" rel="noopener noreferrer">Review official fee source</a>
          <ul>{feeCorrection.notes.map(note=><li key={note}>{note}</li>)}</ul>
          <button type="button" className="btn ghost" disabled={disabled||feeLoaded||content.fee_inr!==feeCorrection.expectedFee} onClick={()=>{onChange(JSON.stringify(loadPreparedFeeCorrection(content,feeCorrection),null,2));setFeeLoaded(true);}}>Load coordinated fee correction</button>
          {feeLoaded?<p role="status">Fee correction loaded into this proposal. Review the payment terms before submitting.</p>:content.fee_inr!==feeCorrection.expectedFee?<p>The proposed fee differs from this correction’s baseline. Review the fee manually.</p>:null}
        </div>:null}
        {categoryFeeDraft?<div className="admin-notice admin-span-2">
          <strong>Prepared student-category fees</strong>
          <p>Checked {categoryFeeDraft.categoryFees.checkedAt} against the {categoryFeeDraft.categoryFees.sourceLabel} and the program fee tab.</p>
          <table className="admin-mini-table"><thead><tr><th scope="col">Applicant category</th><th scope="col">Total</th><th scope="col">Per semester</th></tr></thead>
            <tbody>{categoryFeeDraft.categoryFees.rows.map(row=><tr key={row.category}><th scope="row">{row.category}</th><td>{formatCategoryFee(row.currency,row.total)}</td><td>{formatCategoryFee(row.currency,row.perSemester)} × {row.semesters}</td></tr>)}</tbody></table>
          <a href={categoryFeeDraft.categoryFees.sourceUrl} target="_blank" rel="noopener noreferrer">Review the fee source</a>{" · "}<a href={categoryFeeDraft.programUrl} target="_blank" rel="noopener noreferrer">Review the program fee tab</a>
          <ul>{(categoryFeeDraft.categoryFees.notes||[]).map(note=><li key={note}>{note}</li>)}</ul>
          <button type="button" className="btn ghost" disabled={disabled||categoryLoaded||content.fee_inr!==categoryFeeDraft.expectedFee} onClick={()=>{onChange(JSON.stringify(loadPreparedCategoryFees(content,categoryFeeDraft),null,2));setCategoryLoaded(true);}}>Load student-category fees</button>
          {categoryLoaded?<p role="status">Category fees loaded into this proposal. Review them against the prospectus before submitting.</p>:content.fee_inr!==categoryFeeDraft.expectedFee?<p>The course fee differs from the prepared Indian-applicant fee. Review the fee first.</p>:null}
        </div>:null}
        <p className="admin-span-2">Use official fee information. Changing tuition does not calculate discounts or financing terms; review the payment plans and highlights below too.</p>
        {field("fee_inr","Total tuition fee (INR)",{number:true,required:true})}
        {field("emi","EMI information",{nested:true,required:true})}
        {field("applicationFee","Application fee",{nested:true})}
        {field("lastAdmissionDate","Admission deadline",{nested:true,hint:"Use a sourced date or state that the current cycle needs checking."})}
        {intakes()}
        {categoryFeesEditor()}
        {rows("feePlans","Payment plans",["Plan name","Total fee","Payment terms"])}
        {rows("highlights","Highlights",["Label","Value"])}
      </fieldset>:null}
      {entityType==="course"?curriculum():null}
      {entityType==="course"?programDetails():null}
      {entityType==="course"&&recognitionDraft?<fieldset className="admin-form-grid admin-catalog-fields"><legend>Recognition</legend>
        <div className="admin-notice admin-span-2">
          <strong>Prepared UGC-DEB {recognitionDraft.recognition.academicYear} result: {recognitionDraft.recognition.status==="listed"?"listed":"needs the awarding university confirmed"}</strong>
          <p>Checked {recognitionDraft.recognition.checkedAt} against the {recognitionDraft.recognition.listName}.</p>
          <dl className="admin-mini-list"><div><dt>Listed under</dt><dd>{recognitionDraft.recognition.listedUnder}</dd></div><div><dt>Programme as printed</dt><dd>{recognitionDraft.recognition.listedProgramme}</dd></div></dl>
          {recognitionDraft.recognition.note?<p>{recognitionDraft.recognition.note}</p>:null}
          <a href={recognitionDraft.recognition.sourceUrl} target="_blank" rel="noopener noreferrer">Open the UGC-DEB list</a>
          <button type="button" className="btn ghost" disabled={disabled||recognitionLoaded} onClick={()=>{onChange(JSON.stringify(loadPreparedRecognition(content,recognitionDraft),null,2));setRecognitionLoaded(true);}}>Load recognition result</button>
          {recognitionLoaded?<p role="status">Recognition result loaded into this proposal. Check the entry in the list before submitting.</p>:null}
        </div>
      </fieldset>:null}
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
