"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { DUPLICATE_FIELDS, duplicateRuleInput, type DuplicateRule } from "@/lib/duplicate-rules";
import { PanelHeader } from "@/components/layout/panel-header";
import { useConfirm } from "@/components/common/dialogs-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRetainedEditorDraft } from "@/providers/editor-draft-provider";
const message = (error: unknown) => error && typeof error === "object" && "originalMessage" in error && typeof error.originalMessage === "string" ? error.originalMessage : error instanceof Error ? error.message : "Unable to manage rules";
const empty = { entity: "Lead" as const, name: "", fields: [] as string[], action: "BLOCK" as const, enabled: true };
export function DuplicateRulesPanel({ embedded }: { embedded?: boolean }) {
 const confirm = useConfirm();
 const [rules,setRules] = useState<DuplicateRule[] | null>(null);
 const [error,setError] = useState("");
 const [saved,setSaved] = useState("");
 const { draft,update,current } = useRetainedEditorDraft("settings:duplicate-rules");
 const form = (draft.values?.form ?? empty) as typeof empty & Partial<DuplicateRule>;
 const load = async () => { setError(""); try { setRules(await apiFetch("/settings/duplicate-rules")); } catch(e) { setError(message(e)); } };
 useEffect(() => { void load(); }, []);
 const change = (patch: Record<string,unknown>) => { update({ values:{ form:{...form,...patch} },dirty:true,error:"" });setSaved(""); };
 const select = async (rule: unknown) => {
  if(current().pending)return;
  if(current().dirty && !(await confirm({ title:"Discard your changes to this rule?", description:"You have unsaved changes to the rule you're editing.", confirmLabel:"Discard changes", cancelLabel:"Keep editing", destructive:true })))return;
  update({values:{form:rule},dirty:false,error:""});setSaved("");
 };
 const save = async () => {
  if(current().pending)return;
  const parsed = duplicateRuleInput.safeParse(form);
  if(!parsed.success){update({error:parsed.error.issues[0].message});return;}
  update({pending:true,error:""});
  try { const row = await apiFetch("/settings/duplicate-rules",{method:"POST",body:JSON.stringify(parsed.data)}); const value=duplicateRuleInput.parse({id:row.id,version:row.version,entity:row.entity,name:row.name,fields:row.fields,action:row.action,enabled:row.enabled});update({values:{form:value},dirty:false,pending:false});setSaved("Rule saved. Changes apply to new records and changes to matching field values.");await load(); }
  catch(e){update({pending:false,error:message(e)});}
 };
 return <div className="min-w-0 space-y-4">
  <PanelHeader embedded={embedded} title="Duplicate rules" description="Choose which fields identify a duplicate and whether saving should be blocked or allowed with a warning." />
  <p className="text-sm text-muted-foreground">All fields in a rule must match. Empty values are skipped. Text ignores case and surrounding spaces; phone matching ignores punctuation and retains country codes. Existing duplicates are preserved. Merged and deleted records are excluded.</p>
  {error && <div role="alert" className="space-y-2 text-destructive"><p>{error}</p><Button variant="outline" onClick={load}>Retry</Button></div>}
  {!rules && !error && <p role="status">Loading rules…</p>}
  {rules && <div className="grid min-w-0 gap-4 lg:grid-cols-2">
   <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-label="Configured rules">
    <Button variant="outline" disabled={draft.pending} onClick={()=>select(empty)}>New rule</Button>
    {!rules.length && <p className="text-sm text-muted-foreground">No rules configured. Start with an email or phone rule for Leads, or Lead + Opportunity type for Opportunities.</p>}
    {rules.map(rule=><button key={rule.id} disabled={draft.pending} onClick={()=>select(rule)} className="block w-full min-w-0 rounded-md border p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><span className="block break-words font-medium">{rule.name}</span><span className="block break-words text-sm text-muted-foreground">{rule.entity} · {rule.fields.join(" + ")} · {rule.action === "BLOCK" ? "Block" : "Warn"} · {rule.enabled ? "Enabled" : "Disabled"}</span></button>)}
   </section>
   <form onSubmit={e=>{e.preventDefault();void save();}} className="min-w-0 rounded-lg border p-4">
    <fieldset disabled={draft.pending} className="min-w-0 space-y-4">
     <legend className="mb-3 font-semibold">{form.id ? "Edit rule" : "New rule"}</legend>
     <label className="block space-y-1 text-sm">Name<Input value={form.name} maxLength={100} onChange={e=>change({name:e.target.value})} required /></label>
     <label className="block space-y-1 text-sm">Module<select aria-label="Module" className="h-10 w-full rounded-md border bg-background px-2" value={form.entity} onChange={e=>change({entity:e.target.value,fields:[]})}><option value="Lead">Lead</option><option value="Opportunity">Opportunity</option></select></label>
     <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Matching fields (choose up to five)</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{DUPLICATE_FIELDS[form.entity].map(field=><label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.fields.includes(field)} onChange={e=>change({fields:e.target.checked?[...form.fields,field]:form.fields.filter(f=>f!==field)})}/>{field}</label>)}</div></fieldset>
     <label className="block space-y-1 text-sm">When a duplicate matches<select aria-label="When a duplicate matches" className="h-10 w-full rounded-md border bg-background px-2" value={form.action} onChange={e=>change({action:e.target.value})}><option value="BLOCK">Block saving</option><option value="WARN">Warn and allow saving</option></select></label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e=>change({enabled:e.target.checked})}/>Enabled</label>
     <p className="text-xs text-muted-foreground">Rules support the standard fields listed above. Custom fields and fuzzy matching are not included. Edits to unrelated fields remain possible on existing duplicates.</p>
     {draft.dirty && <p className="text-xs text-muted-foreground">Unsaved changes are retained during navigation until refresh or sign out.</p>}
     {draft.error && <p role="alert" className="break-words text-sm text-destructive">{draft.error}</p>}{saved && <p role="status" className="text-sm">{saved}</p>}
     <Button type="submit">{draft.pending ? "Saving…" : "Save rule"}</Button>
    </fieldset>
   </form>
  </div>}
 </div>;
}
