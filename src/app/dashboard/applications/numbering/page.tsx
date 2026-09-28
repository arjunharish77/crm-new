"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { canUseApplications } from '@/lib/application-access';
import { applicationRuleSchema, defaultApplicationRule, formatApplicationNumber, type ApplicationNumberRule } from '@/lib/application-numbering';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/common/error-state';
import { ApplicationSelect, applicationErrorMessage } from '@/components/applications/fields';
import { useRetainedEditorDraft } from '@/providers/editor-draft-provider';

export default function NumberingPage() {
 const { user, isLoading } = useAuth();
 const allowed = canUseApplications(user, 'manage');
 const [data,setData] = useState<any>(null), [error,setError] = useState(''), [attempt,setAttempt] = useState(0);
 const { draft, update, current } = useRetainedEditorDraft('application:numbering');
 const form: ApplicationNumberRule = draft.values?.form ?? defaultApplicationRule;
 const [message,setMessage] = useState('');
 useEffect(() => { if(!allowed)return; const controller=new AbortController(); setError(''); apiFetch('/applications/numbering',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(applicationErrorMessage(e));}); return()=>controller.abort(); },[allowed,attempt]);
 const change=(patch:Partial<ApplicationNumberRule>)=>{setMessage('');update({values:{form:{...form,...patch}},dirty:true,error:''});};
 const select=(rule:ApplicationNumberRule)=>{if(current().pending)return;if(current().dirty&&!window.confirm('Discard unsaved numbering changes?'))return;update({values:{form:applicationRuleSchema.parse(rule)},dirty:false,error:''});setMessage('');};
 const save=async()=>{if(current().pending)return;const parsed=applicationRuleSchema.safeParse(form);if(!parsed.success){update({error:parsed.error.issues.map(i=>i.message).join('. ')});return;}update({pending:true,error:''});try{await apiFetch('/applications/numbering',{method:'POST',body:JSON.stringify(parsed.data)});update({dirty:false});setMessage('Numbering rule saved. Existing application numbers stay unchanged.');setAttempt(n=>n+1);}catch(e){update({error:applicationErrorMessage(e)});}finally{update({pending:false});}};
 const valid=applicationRuleSchema.safeParse(form);
 const preview=valid.success?formatApplicationNumber(valid.data,'1',new Date()):'Complete the rule to see a preview';
 if(isLoading)return <p role="status">Loading numbering settings…</p>;
 if(!allowed)return <ErrorState description="You need Applications manage permission to configure numbering."/>;
 return <div className="min-w-0 space-y-4"><PageHeader title="Application numbering" description="Set the format used when new applications are created." actions={<Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" variant="outline" asChild><Link href="/dashboard/applications">Back to Applications</Link></Button>}/>
 {error?<ErrorState description={error} onRetry={()=>setAttempt(n=>n+1)}/>:!data?<p role="status">Loading numbering settings…</p>:<div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
 <Card className="min-w-0 space-y-4 p-4"><h2 className="font-semibold">Saved rules</h2><p className="text-sm text-muted-foreground">The most specific matching scope wins. Ties prefer intake, then opportunity type. Opportunity type applies only when an opportunity is linked.</p><Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" variant="outline" disabled={draft.pending} onClick={()=>select(data.rules.find((r:ApplicationNumberRule)=>!r.universityId&&!r.opportunityTypeId&&!r.intakeId)||defaultApplicationRule)}>Workspace default</Button>{!data.rules.length&&<p className="text-sm">No custom rules. The default format is APP-{'{YYYY}'}-000001.</p>}{data.rules.map((rule:any)=><div key={rule.id} className="min-w-0 space-y-2 rounded-md border p-3"><p className="break-words text-sm">{rule.universityName||'All universities'} · {rule.opportunityTypeName||'All opportunity types'} · {rule.intakeName||'All intakes'}</p><p className="break-all font-mono text-sm">{rule.prefix}{'0'.repeat(rule.padding)}{rule.suffix}</p><Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" variant="outline" size="sm" disabled={draft.pending} onClick={()=>select(rule)}>Edit rule</Button></div>)}</Card>
 <Card className="min-w-0 space-y-4 p-4"><h2 className="font-semibold">Rule editor</h2><p className="text-sm text-muted-foreground">Saving replaces the rule for the selected scope. Changing scope creates or updates another rule. Numbers use one increasing workspace sequence, which does not reset each year.</p><fieldset disabled={draft.pending} className="min-w-0 space-y-4">
 <ApplicationSelect id="number-university" label="University (optional)" optional value={form.universityId||''} items={data.universities} onChange={v=>change({universityId:v||null,opportunityTypeId:null,intakeId:null})}/>
 <ApplicationSelect id="number-type" label="Opportunity type (optional)" optional value={form.opportunityTypeId||''} items={data.types.filter((t:any)=>!form.universityId||t.universityId===form.universityId)} onChange={v=>change({opportunityTypeId:v||null,intakeId:null})}/>
 <ApplicationSelect id="number-intake" label="Intake (optional)" optional value={form.intakeId||''} items={data.intakes.filter((i:any)=>(!form.universityId||i.universityId===form.universityId)&&(!form.opportunityTypeId||i.programId===data.types.find((t:any)=>t.id===form.opportunityTypeId)?.programId))} onChange={v=>change({intakeId:v||null})}/>
 {(['prefix','suffix','timezone'] as const).map(key=><div key={key} className="space-y-2"><Label htmlFor={'number-'+key}>{key==='prefix'?'Prefix':key==='suffix'?'Suffix':'Timezone'}</Label><Input id={'number-'+key} value={form[key]} onChange={e=>change({[key]:e.target.value})}/></div>)}
 <p className="text-sm text-muted-foreground">Prefix and suffix support letters, digits, hyphens, underscores, {'{YYYY}'} for the calendar year and {'{FY}'} for a financial year such as 2026-27.</p>
 <div className="space-y-2"><Label htmlFor="number-padding">Minimum sequence digits (1–12)</Label><Input id="number-padding" type="number" min={1} max={12} value={form.padding} onChange={e=>change({padding:Number(e.target.value)})}/></div>
 <ApplicationSelect id="number-month" label="Financial year starting month" value={String(form.financialYearStartMonth)} items={Array.from({length:12},(_,i)=>({id:String(i+1),name:new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,i,1)))}))} onChange={v=>change({financialYearStartMonth:Number(v)})}/>
 <p className="break-all text-sm">Example with sequence 1: <strong>{preview}</strong></p>{draft.dirty&&<p className="text-xs text-muted-foreground">Unsaved changes are kept during navigation until refresh or sign out.</p>}{draft.error&&<p role="alert" className="break-words text-sm text-destructive">{draft.error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}<Button className="h-auto min-h-10 max-w-full whitespace-normal break-words" disabled={draft.pending} onClick={save}>{draft.pending?'Saving…':'Save rule'}</Button>
 </fieldset></Card></div>}</div>;
}
