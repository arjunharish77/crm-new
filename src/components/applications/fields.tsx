"use client";
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function ApplicationSelect({id,label,value,onChange,items,optional=false,disabled=false}:{id:string;label:string;value:string;onChange:(value:string)=>void;items:Array<{id:string;name:string}>;optional?:boolean;disabled?:boolean}){
 return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value||'__none__'} disabled={disabled} onValueChange={value=>{if(value)onChange(value==='__none__'?'':value);}}><SelectTrigger id={id} className="h-auto min-h-9 w-full whitespace-normal text-left [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:break-words"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">{optional?'None / any':'Select…'}</SelectItem>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>;
}
export function applicationErrorMessage(error:any){return error?.status && error.status<500 ? error.body?.message||error.message : error?.message||'Request failed. Try again.';}
